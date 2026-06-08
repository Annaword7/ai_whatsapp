import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chatService } from '../services/chat';
import { messageService } from '../services/message';
import { aiService } from '../services/ai';
import { whatsapp } from '../whatsapp/manager';
import { DEFAULT_SESSION_ID } from '../types';
import { prisma } from '../db/client';

const settingsSchema = z.object({
  autoTranslate: z.boolean().optional(),
  translateTo: z.string().min(1).optional(),
  contactLang: z.string().min(1).nullable().optional(),
});

const sendSchema = z.object({
  text: z.string().min(1).max(8000),
  // If provided, the server translates `text` into this language before sending.
  translateTo: z.string().min(1).optional(),
});

const listMessagesSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  before: z.coerce.date().optional(),
});

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  const sessionId = DEFAULT_SESSION_ID;

  app.get('/', async () => {
    return chatService.list(sessionId);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = await chatService.getById(sessionId, id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    return chat;
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = settingsSchema.parse(req.body);
    const chat = await chatService.update(sessionId, id, patch);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    return chat;
  });

  app.get('/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = await chatService.getById(sessionId, id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    const { limit, before } = listMessagesSchema.parse(req.query);
    await chatService.markRead(sessionId, id);
    return messageService.listByChat(id, { limit, before });
  });

  app.post('/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text, translateTo } = sendSchema.parse(req.body);

    const chat = await chatService.getById(sessionId, id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });

    let bodyToSend = text;
    let original: string | null = null;

    if (translateTo) {
      const translated = await aiService.translateMessage(text, translateTo);
      if (translated) {
        original = text; // keep operator's draft as the record's "translation"
        bodyToSend = translated;
      }
    }

    const { waId, timestamp } = await whatsapp.sendText(sessionId, chat.jid, bodyToSend);

    const { message } = await messageService.createIfNew({
      sessionId,
      chatId: chat.id,
      waId,
      fromMe: true,
      senderJid: null,
      body: bodyToSend,
      translatedBody: original,
      type: 'text',
      status: 'sent',
      timestamp,
    });

    await chatService.touch(chat.id, timestamp, false);
    return message;
  });

  // Translate the chat's existing untranslated inbound messages into chat.translateTo.
  // Used to translate history when auto-translate is turned on / a chat is opened.
  app.post('/:id/translate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = await chatService.getById(sessionId, id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    if (!aiService.isConfigured()) return reply.code(503).send({ error: 'AI not configured' });
    const translated = await messageService.translateUntranslated(id, chat.translateTo);
    return { translated };
  });

  // Convenience: contacts (for language hints in the UI).
  app.get('/:id/contact', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = await chatService.getById(sessionId, id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    const contact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid: chat.jid } },
    });
    return contact ?? {};
  });
}
