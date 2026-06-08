import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aiService } from '../services/ai';
import { messageService } from '../services/message';
import { chatService } from '../services/chat';
import { DEFAULT_SESSION_ID } from '../types';

const translateSchema = z.object({
  text: z.string().min(1).max(8000),
  targetLanguage: z.string().min(1),
});

const detectSchema = z.object({ text: z.string().min(1).max(8000) });

const replySchema = z.object({
  chatId: z.string().min(1),
  style: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
});

const improveSchema = z.object({
  text: z.string().min(1).max(8000),
  style: z.string().min(1),
  language: z.string().min(1).optional(),
});

export default async function aiRoutes(app: FastifyInstance): Promise<void> {
  const sessionId = DEFAULT_SESSION_ID;

  app.get('/health', async () => ({ configured: aiService.isConfigured() }));

  app.post('/translate', async (req) => {
    const { text, targetLanguage } = translateSchema.parse(req.body);
    const translation = await aiService.translateMessage(text, targetLanguage);
    return { translation };
  });

  app.post('/detect', async (req) => {
    const { text } = detectSchema.parse(req.body);
    const language = await aiService.detectLanguage(text);
    return { language };
  });

  // Generate a suggested reply from recent chat context.
  app.post('/reply', async (req, reply) => {
    const { chatId, style, language } = replySchema.parse(req.body);
    const chat = await chatService.getById(sessionId, chatId);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });

    const recent = await messageService.listByChat(chatId, { limit: 12 });
    const history = recent
      .filter((m) => m.body)
      .map((m) => ({ role: (m.fromMe ? 'me' : 'them') as 'me' | 'them', text: m.body }));

    const result = await aiService.generateReply({
      history,
      style,
      language: language ?? chat.contactLang ?? undefined,
    });
    return { reply: result };
  });

  // Rewrite a draft in a given style ("professional", "shorter", ...).
  app.post('/improve', async (req) => {
    const { text, style, language } = improveSchema.parse(req.body);
    const result = await aiService.improveText(text, style, language);
    return { text: result };
  });
}
