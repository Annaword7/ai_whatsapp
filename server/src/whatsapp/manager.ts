import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
  jidNormalizedUser,
  type WASocket,
  type WAMessage,
  type ConnectionState,
} from 'baileys';
import QRCode from 'qrcode';
import path from 'node:path';
import type { SessionStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../db/client';
import { wsHub } from '../ws/hub';
import { chatService } from '../services/chat';
import { messageService } from '../services/message';
import { aiService } from '../services/ai';
import { useEncryptedAuthState } from './authState';
import type { SessionInfo } from '../types';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 2_000;

interface ManagedSession {
  id: string;
  sock?: WASocket;
  status: SessionStatus;
  qr: string | null; // data URL
  phoneNumber: string | null;
  saveCreds?: () => Promise<void>;
  clearAuth?: () => Promise<void>;
  reconnectAttempts: number;
  manualStop: boolean;
  starting: boolean;
}

function extractText(msg: WAMessage): { text: string; type: string } {
  const m = msg.message;
  if (!m) return { text: '', type: 'unknown' };
  if (m.conversation) return { text: m.conversation, type: 'text' };
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, type: 'text' };
  if (m.imageMessage) return { text: m.imageMessage.caption || '📷 Photo', type: 'image' };
  if (m.videoMessage) return { text: m.videoMessage.caption || '🎬 Video', type: 'video' };
  if (m.documentMessage) return { text: m.documentMessage.caption || m.documentMessage.fileName || '📄 Document', type: 'document' };
  if (m.audioMessage) return { text: '🎙️ Voice message', type: 'audio' };
  if (m.stickerMessage) return { text: '🌟 Sticker', type: 'sticker' };
  if (m.contactMessage || m.contactsArrayMessage) return { text: '👤 Contact', type: 'contact' };
  if (m.locationMessage) return { text: '📍 Location', type: 'location' };
  return { text: '', type: 'unknown' };
}

function tsToDate(ts: WAMessage['messageTimestamp']): Date {
  if (typeof ts === 'number') return new Date(ts * 1000);
  if (ts && typeof (ts as { toNumber?: () => number }).toNumber === 'function') {
    return new Date((ts as { toNumber: () => number }).toNumber() * 1000);
  }
  return new Date();
}

class WhatsAppManager {
  private sessions = new Map<string, ManagedSession>();
  private groupSubjectCache = new Map<string, string>();

  /** Resolve the display name for a chat: group subject, or contact name / pushName. */
  private async resolveChatName(
    s: ManagedSession,
    jid: string,
    isGroup: boolean,
    pushName?: string,
  ): Promise<string | undefined> {
    if (isGroup) return this.groupSubject(s, jid);
    const contact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId: s.id, jid } },
    });
    return contact?.name ?? contact?.pushName ?? pushName ?? undefined;
  }

  /** Group subject, fetched lazily via groupMetadata and cached. */
  private async groupSubject(s: ManagedSession, jid: string): Promise<string | undefined> {
    const cached = this.groupSubjectCache.get(jid);
    if (cached) return cached;
    try {
      const meta = await s.sock?.groupMetadata(jid);
      if (meta?.subject) {
        this.groupSubjectCache.set(jid, meta.subject);
        return meta.subject;
      }
    } catch (err) {
      logger.debug({ err, jid }, 'groupMetadata failed');
    }
    return undefined;
  }

  /**
   * Backfill names for all chats of a session: group subjects and 1:1 contact
   * names. Runs on connect and can be triggered manually.
   */
  async resolveNames(sessionId: string): Promise<{ updated: number }> {
    const s = this.sessions.get(sessionId);
    if (!s?.sock) return { updated: 0 };
    const chats = await prisma.chat.findMany({ where: { sessionId } });
    let updated = 0;
    for (const chat of chats) {
      const name = await this.resolveChatName(s, chat.jid, chat.isGroup, undefined);
      if (name && name !== chat.name) {
        const u = await prisma.chat.update({ where: { id: chat.id }, data: { name } });
        wsHub.broadcast({ type: 'chat', chat: u });
        updated += 1;
      }
    }
    logger.info({ sessionId, updated }, 'resolved chat names');
    return { updated };
  }

  private getOrCreate(sessionId: string): ManagedSession {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = {
        id: sessionId,
        status: 'DISCONNECTED',
        qr: null,
        phoneNumber: null,
        reconnectAttempts: 0,
        manualStop: false,
        starting: false,
      };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  getInfo(sessionId: string): SessionInfo {
    const s = this.sessions.get(sessionId);
    return {
      sessionId,
      status: s?.status ?? 'DISCONNECTED',
      qr: s?.qr ?? null,
      phoneNumber: s?.phoneNumber ?? null,
    };
  }

  private authFolder(sessionId: string): string {
    return path.join(env.WA_SESSION_PATH, sessionId);
  }

  private async setStatus(s: ManagedSession, status: SessionStatus, extra?: { qr?: string | null; phoneNumber?: string | null }): Promise<void> {
    s.status = status;
    if (extra && 'qr' in extra) s.qr = extra.qr ?? null;
    if (extra?.phoneNumber !== undefined) s.phoneNumber = extra.phoneNumber;

    await prisma.userSession.update({
      where: { id: s.id },
      data: {
        status,
        ...(s.phoneNumber ? { phoneNumber: s.phoneNumber } : {}),
        authPath: this.authFolder(s.id),
      },
    }).catch((err) => logger.warn({ err }, 'failed to persist session status'));

    wsHub.broadcast({ type: 'status', sessionId: s.id, status, qr: s.qr, phoneNumber: s.phoneNumber });
  }

  /** Start (or restart) a WhatsApp connection for the given session. */
  async start(sessionId: string): Promise<SessionInfo> {
    const s = this.getOrCreate(sessionId);
    // Never open a second socket for the same session while one is starting or
    // alive. Duplicate sockets make WhatsApp drop the connection in a reconnect
    // loop (and the device appears "not linked").
    if (s.starting || s.sock) return this.getInfo(sessionId);
    s.starting = true;
    s.manualStop = false;

    try {
      // Ensure the DB row exists (MVP uses a single fixed session id).
      await prisma.userSession.upsert({
        where: { id: sessionId },
        update: {},
        create: { id: sessionId, status: 'CONNECTING', authPath: this.authFolder(sessionId) },
      });

      const { state, saveCreds, clear } = await useEncryptedAuthState(this.authFolder(sessionId));
      s.saveCreds = saveCreds;
      s.clearAuth = clear;

      const { version } = await fetchLatestBaileysVersion();
      logger.info({ sessionId, version }, 'starting WhatsApp socket');

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger as never),
        },
        logger: logger.child({ module: 'baileys' }) as never,
        printQRInTerminal: false,
        browser: ['AI WA Client', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });

      s.sock = sock;
      await this.setStatus(s, 'CONNECTING');
      this.bindEvents(s, sock);
    } catch (err) {
      logger.error({ err, sessionId }, 'failed to start session');
      await this.setStatus(s, 'DISCONNECTED');
    } finally {
      s.starting = false;
    }

    return this.getInfo(sessionId);
  }

  private bindEvents(s: ManagedSession, sock: WASocket): void {
    sock.ev.on('creds.update', () => {
      s.saveCreds?.().catch((err) => logger.warn({ err }, 'saveCreds failed'));
    });

    sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      void this.onConnectionUpdate(s, update);
    });

    sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
      void this.onHistorySet(s, chats, contacts, messages).catch((err) =>
        logger.warn({ err }, 'history sync failed'),
      );
    });

    sock.ev.on('chats.upsert', (chats) => {
      for (const c of chats) {
        void chatService
          .upsert({ sessionId: s.id, jid: c.id, name: c.name ?? undefined })
          .catch(() => undefined);
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => void this.upsertContacts(s.id, contacts));
    sock.ev.on('contacts.update', (contacts) => void this.upsertContacts(s.id, contacts));

    sock.ev.on('groups.upsert', (groups) => {
      for (const g of groups) {
        if (g.subject) this.groupSubjectCache.set(g.id, g.subject);
        void chatService
          .upsert({ sessionId: s.id, jid: g.id, name: g.subject ?? undefined, isGroup: true })
          .catch(() => undefined);
      }
    });
    sock.ev.on('groups.update', (updates) => {
      for (const g of updates) {
        if (!g.id || !g.subject) continue;
        this.groupSubjectCache.set(g.id, g.subject);
        void chatService
          .upsert({ sessionId: s.id, jid: g.id, name: g.subject, isGroup: true })
          .catch(() => undefined);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      // 'notify' = live messages; 'append' = older messages backfilled.
      const notify = type === 'notify';
      for (const msg of messages) {
        void this.ingestMessage(s, msg, { notify, allowTranslate: notify }).catch((err) =>
          logger.warn({ err }, 'ingest message failed'),
        );
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const status = u.update?.status;
        const waId = u.key?.id;
        if (!waId || status == null) continue;
        const mapped = status >= 4 ? 'read' : status === 3 ? 'delivered' : 'sent';
        void messageService.setStatusByWaId(s.id, waId, mapped).catch(() => undefined);
      }
    });
  }

  private async onConnectionUpdate(s: ManagedSession, update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        await this.setStatus(s, 'QR', { qr: dataUrl });
      } catch (err) {
        logger.warn({ err }, 'failed to render QR');
      }
    }

    if (connection === 'open') {
      s.reconnectAttempts = 0;
      const rawId = s.sock?.user?.id ?? '';
      const phoneNumber = rawId ? jidNormalizedUser(rawId).split('@')[0] ?? null : null;
      await this.setStatus(s, 'CONNECTED', { qr: null, phoneNumber });
      logger.info({ sessionId: s.id, phoneNumber }, 'WhatsApp connected');
      // Backfill chat names once history/contacts have had time to sync.
      setTimeout(() => void this.resolveNames(s.id).catch(() => undefined), 8_000);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const replaced = statusCode === DisconnectReason.connectionReplaced;

      logger.warn({ sessionId: s.id, statusCode, loggedOut, replaced }, 'connection closed');

      // The socket is dead; drop the reference so a reconnect can create a fresh
      // one (and so the duplicate-socket guard in start() doesn't block it).
      s.sock = undefined;

      if (loggedOut) {
        await this.handleLoggedOut(s);
        return;
      }
      if (replaced || s.manualStop) {
        await this.setStatus(s, 'DISCONNECTED', { qr: null });
        return;
      }
      await this.scheduleReconnect(s);
    }
  }

  private async scheduleReconnect(s: ManagedSession): Promise<void> {
    if (s.manualStop) return;
    if (s.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error({ sessionId: s.id }, 'max reconnect attempts reached');
      await this.setStatus(s, 'DISCONNECTED', { qr: null });
      return;
    }
    s.reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (s.reconnectAttempts - 1), 60_000);
    await this.setStatus(s, 'CONNECTING');
    logger.info({ sessionId: s.id, attempt: s.reconnectAttempts, delay }, 'scheduling reconnect');
    setTimeout(() => {
      s.starting = false;
      void this.start(s.id);
    }, delay);
  }

  private async handleLoggedOut(s: ManagedSession): Promise<void> {
    logger.warn({ sessionId: s.id }, 'logged out — clearing auth state');
    try {
      await s.clearAuth?.();
    } catch (err) {
      logger.warn({ err }, 'failed to clear auth');
    }
    s.sock = undefined;
    s.phoneNumber = null;
    await this.setStatus(s, 'DISCONNECTED', { qr: null, phoneNumber: null });
  }

  private async onHistorySet(
    s: ManagedSession,
    chats: Array<{ id: string; name?: string | null; conversationTimestamp?: number | Long | null }>,
    contacts: Array<{ id: string; name?: string | null; notify?: string | null }>,
    messages: WAMessage[],
  ): Promise<void> {
    for (const c of chats) {
      const lastMessageAt = c.conversationTimestamp ? tsToDate(c.conversationTimestamp as never) : null;
      await chatService
        .upsert({ sessionId: s.id, jid: c.id, name: c.name ?? undefined, lastMessageAt })
        .catch(() => undefined);
    }
    await this.upsertContacts(s.id, contacts);
    // Backfill recent history (no translation to save tokens/cost).
    for (const msg of messages.slice(-200)) {
      await this.ingestMessage(s, msg, { notify: false, allowTranslate: false }).catch(() => undefined);
    }
  }

  private async upsertContacts(
    sessionId: string,
    contacts: Array<{ id?: string | null; name?: string | null; notify?: string | null }>,
  ): Promise<void> {
    for (const c of contacts) {
      if (!c.id) continue;
      await prisma.contact
        .upsert({
          where: { sessionId_jid: { sessionId, jid: c.id } },
          update: { name: c.name ?? undefined, pushName: c.notify ?? undefined },
          create: { sessionId, jid: c.id, name: c.name ?? null, pushName: c.notify ?? null },
        })
        .catch(() => undefined);

      // Propagate the contact name to an existing 1:1 chat so the list shows names.
      const displayName = c.name ?? c.notify ?? undefined;
      if (displayName) {
        const chat = await prisma.chat
          .findUnique({ where: { sessionId_jid: { sessionId, jid: c.id } } })
          .catch(() => null);
        if (chat && !chat.isGroup && chat.name !== displayName) {
          const updated = await prisma.chat
            .update({ where: { id: chat.id }, data: { name: displayName } })
            .catch(() => null);
          if (updated) wsHub.broadcast({ type: 'chat', chat: updated });
        }
      }
    }
  }

  /** Persist a single message; optionally auto-translate inbound text. */
  private async ingestMessage(
    s: ManagedSession,
    msg: WAMessage,
    opts: { notify: boolean; allowTranslate: boolean },
  ): Promise<void> {
    const remoteJid = msg.key?.remoteJid;
    const waId = msg.key?.id;
    if (!remoteJid || !waId) return;
    if (remoteJid === 'status@broadcast') return; // ignore status updates

    const { text, type } = extractText(msg);
    if (type === 'unknown' && !text) return; // skip protocol/empty messages

    const fromMe = Boolean(msg.key?.fromMe);
    const isGroup = isJidGroup(remoteJid) ?? false;
    const timestamp = tsToDate(msg.messageTimestamp);
    const pushName = msg.pushName ?? undefined;
    const senderName = fromMe ? undefined : pushName;

    const name = await this.resolveChatName(s, remoteJid, isGroup, fromMe ? undefined : pushName);

    const chat = await chatService.upsert({
      sessionId: s.id,
      jid: remoteJid,
      name,
      isGroup,
      lastMessageAt: timestamp,
    });

    const { message, created } = await messageService.createIfNew({
      sessionId: s.id,
      chatId: chat.id,
      waId,
      fromMe,
      senderJid: isGroup ? msg.key?.participant ?? null : remoteJid,
      senderName,
      body: text,
      type,
      timestamp,
    });

    if (!created) return;

    if (opts.notify) {
      await chatService.touch(chat.id, timestamp, !fromMe);
    }

    // Auto-translate inbound text messages when enabled for the chat.
    if (opts.allowTranslate && !fromMe && type === 'text' && chat.autoTranslate && aiService.isConfigured() && text) {
      void aiService
        .translateMessage(text, chat.translateTo)
        .then((translated) => messageService.setTranslation(message.id, translated))
        .catch((err) => logger.warn({ err }, 'auto-translate failed'));
    }
  }

  /** Send a text message and return the WA message id + timestamp. */
  async sendText(sessionId: string, jid: string, text: string): Promise<{ waId: string; timestamp: Date }> {
    const s = this.sessions.get(sessionId);
    if (!s?.sock || s.status !== 'CONNECTED') {
      throw new Error('WhatsApp is not connected');
    }
    const sent = await s.sock.sendMessage(jid, { text });
    if (!sent?.key?.id) throw new Error('Failed to send message');
    return { waId: sent.key.id, timestamp: tsToDate(sent.messageTimestamp) };
  }

  /** Mark a chat's messages as read on WhatsApp (best effort). */
  async markRead(sessionId: string, jid: string, waMessageId?: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s?.sock || s.status !== 'CONNECTED' || !waMessageId) return;
    await s.sock.readMessages([{ remoteJid: jid, id: waMessageId, fromMe: false }]).catch(() => undefined);
  }

  /** Gracefully stop a session without logging out (auth state is kept). */
  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.manualStop = true;
    try {
      s.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    s.sock = undefined;
    await this.setStatus(s, 'DISCONNECTED', { qr: null });
  }

  /** Log out from WhatsApp and wipe the encrypted auth state. */
  async logout(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.manualStop = true;
    try {
      await s.sock?.logout();
    } catch (err) {
      logger.warn({ err }, 'logout call failed');
    }
    await this.handleLoggedOut(s);
  }
}

// `Long` is provided transitively by Baileys (long.js); declare a minimal shape.
type Long = { toNumber(): number };

export const whatsapp = new WhatsAppManager();
