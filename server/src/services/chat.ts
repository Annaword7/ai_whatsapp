import type { Chat, Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { wsHub } from '../ws/hub';
import { env } from '../config/env';

export interface UpsertChatInput {
  sessionId: string;
  jid: string;
  name?: string | null;
  isGroup?: boolean;
  lastMessageAt?: Date | null;
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export const chatService = {
  /** Create or update a chat, broadcasting the change to clients. */
  async upsert(input: UpsertChatInput): Promise<Chat> {
    const isGroup = input.isGroup ?? isGroupJid(input.jid);
    const data = {
      name: input.name ?? undefined,
      isGroup,
      ...(input.lastMessageAt ? { lastMessageAt: input.lastMessageAt } : {}),
    };
    const chat = await prisma.chat.upsert({
      where: { sessionId_jid: { sessionId: input.sessionId, jid: input.jid } },
      update: data,
      create: {
        sessionId: input.sessionId,
        jid: input.jid,
        name: input.name ?? null,
        isGroup,
        lastMessageAt: input.lastMessageAt ?? null,
        translateTo: env.DEFAULT_TRANSLATE_TO,
      },
    });
    wsHub.broadcast({ type: 'chat', chat });
    return chat;
  },

  /** Get a chat by its DB id. */
  async getById(sessionId: string, chatId: string): Promise<Chat | null> {
    return prisma.chat.findFirst({ where: { id: chatId, sessionId } });
  },

  async getByJid(sessionId: string, jid: string): Promise<Chat | null> {
    return prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid } } });
  },

  /** List chats ordered by most recent activity. */
  async list(sessionId: string): Promise<Chat[]> {
    return prisma.chat.findMany({
      where: { sessionId, archived: false },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  },

  /** Update AI / read settings for a chat. */
  async update(
    sessionId: string,
    chatId: string,
    patch: Pick<Prisma.ChatUpdateInput, 'autoTranslate' | 'translateTo' | 'contactLang' | 'unreadCount'>,
  ): Promise<Chat | null> {
    const existing = await this.getById(sessionId, chatId);
    if (!existing) return null;
    const chat = await prisma.chat.update({ where: { id: chatId }, data: patch });
    wsHub.broadcast({ type: 'chat', chat });
    return chat;
  },

  async touch(chatId: string, when: Date, incrementUnread: boolean): Promise<void> {
    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: when,
        ...(incrementUnread ? { unreadCount: { increment: 1 } } : {}),
      },
    });
    wsHub.broadcast({ type: 'chat', chat });
  },

  async markRead(sessionId: string, chatId: string): Promise<void> {
    const chat = await prisma.chat.update({ where: { id: chatId }, data: { unreadCount: 0 } });
    wsHub.broadcast({ type: 'chat', chat });
  },
};
