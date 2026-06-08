import type { Message } from '@prisma/client';
import { prisma } from '../db/client';
import { wsHub } from '../ws/hub';
import { aiService } from './ai';
import { logger } from '../utils/logger';

export interface CreateMessageInput {
  sessionId: string;
  chatId: string;
  waId: string;
  fromMe: boolean;
  senderJid?: string | null;
  senderName?: string | null;
  body: string;
  translatedBody?: string | null;
  detectedLang?: string | null;
  type?: string;
  status?: string;
  timestamp: Date;
}

export const messageService = {
  /**
   * Idempotently persist a message (keyed by sessionId+waId) and broadcast it.
   * Returns null if the message already existed (so callers can skip side effects).
   */
  async createIfNew(input: CreateMessageInput): Promise<{ message: Message; created: boolean }> {
    const existing = await prisma.message.findUnique({
      where: { sessionId_waId: { sessionId: input.sessionId, waId: input.waId } },
    });
    if (existing) return { message: existing, created: false };

    const message = await prisma.message.create({
      data: {
        sessionId: input.sessionId,
        chatId: input.chatId,
        waId: input.waId,
        fromMe: input.fromMe,
        senderJid: input.senderJid ?? null,
        senderName: input.senderName ?? null,
        body: input.body,
        translatedBody: input.translatedBody ?? null,
        detectedLang: input.detectedLang ?? null,
        type: input.type ?? 'text',
        status: input.status ?? (input.fromMe ? 'sent' : 'delivered'),
        timestamp: input.timestamp,
      },
    });
    wsHub.broadcast({ type: 'message', message });
    return { message, created: true };
  },

  async listByChat(chatId: string, opts?: { limit?: number; before?: Date }): Promise<Message[]> {
    const limit = Math.min(opts?.limit ?? 50, 200);
    const rows = await prisma.message.findMany({
      where: { chatId, ...(opts?.before ? { timestamp: { lt: opts.before } } : {}) },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    // Return chronological (oldest first) for rendering.
    return rows.reverse();
  },

  async setTranslation(id: string, translatedBody: string, detectedLang?: string | null): Promise<void> {
    const message = await prisma.message.update({
      where: { id },
      data: { translatedBody, ...(detectedLang ? { detectedLang } : {}) },
    });
    wsHub.broadcast({ type: 'message:update', message });
  },

  /**
   * Translate inbound text messages of a chat that don't yet have a translation,
   * into `targetLang`. Runs with small concurrency and broadcasts each result.
   * Messages already in the target language are marked done (translatedBody=body)
   * so they aren't re-translated on every open.
   */
  async translateUntranslated(chatId: string, targetLang: string, limit = 60): Promise<number> {
    const rows = await prisma.message.findMany({
      where: { chatId, fromMe: false, type: 'text', translatedBody: null, NOT: { body: '' } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    let translatedCount = 0;
    const queue = [...rows];

    const worker = async (): Promise<void> => {
      for (;;) {
        const msg = queue.shift();
        if (!msg) return;
        try {
          const translated = await aiService.translateMessage(msg.body, targetLang);
          if (translated && translated.trim() && translated.trim() !== msg.body.trim()) {
            await this.setTranslation(msg.id, translated);
            translatedCount += 1;
          } else {
            // Same language already — mark done to avoid retrying (bubble hides it).
            await prisma.message.update({ where: { id: msg.id }, data: { translatedBody: msg.body } });
          }
        } catch (err) {
          logger.warn({ err, messageId: msg.id }, 'batch translate failed');
        }
      }
    };

    await Promise.all([worker(), worker(), worker()]);
    return translatedCount;
  },

  async setStatusByWaId(sessionId: string, waId: string, status: string): Promise<void> {
    const existing = await prisma.message.findUnique({
      where: { sessionId_waId: { sessionId, waId } },
    });
    if (!existing) return;
    const message = await prisma.message.update({ where: { id: existing.id }, data: { status } });
    wsHub.broadcast({ type: 'message:update', message });
  },
};
