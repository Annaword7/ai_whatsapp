import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Lazily construct the client so the server can boot without a key (QR pairing
// still works); AI calls then fail with a clear, catchable error.
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new AiError('OPENAI_API_KEY is not configured', 503);
  }
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export class AiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AiError';
    this.statusCode = statusCode;
  }
}

async function complete(system: string, user: string, opts?: { json?: boolean; maxTokens?: number }): Promise<string> {
  try {
    const res = await getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: opts?.maxTokens ?? 800,
      response_format: opts?.json ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    if (err instanceof AiError) throw err;
    logger.error({ err }, 'OpenAI request failed');
    throw new AiError('AI request failed', 502);
  }
}

/**
 * Translate text into the target language. Returns only the translation,
 * preserving tone, emoji and formatting.
 */
export async function translateMessage(text: string, targetLanguage: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';
  const system =
    'You are a professional translator for a chat app. Translate the user message into ' +
    `${targetLanguage}. Preserve meaning, tone, slang intent, emojis and line breaks. ` +
    'Do not add explanations or quotes. If the text is already in the target language, return it unchanged.';
  return complete(system, clean, { maxTokens: 1000 });
}

/**
 * Detect the language of a piece of text. Returns an ISO 639-1 code when possible
 * (e.g. "en", "es", "ru"), otherwise a best-effort language name.
 */
export async function detectLanguage(text: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return 'unknown';
  const system =
    'Detect the dominant natural language of the text. ' +
    'Respond with a JSON object: {"language":"<ISO 639-1 code>"}. Use lowercase. ' +
    'If uncertain, return your best guess.';
  const raw = await complete(system, clean, { json: true, maxTokens: 50 });
  try {
    const parsed = JSON.parse(raw) as { language?: string };
    return (parsed.language || 'unknown').toLowerCase();
  } catch {
    return 'unknown';
  }
}

export interface ReplyContext {
  // Recent conversation, oldest first. `me` = the operator/account owner.
  history: Array<{ role: 'me' | 'them'; text: string }>;
  // Style hint, e.g. "professional", "friendly", "short".
  style?: string;
  // Language the generated reply must be written in.
  language?: string;
}

/**
 * Generate a suggested reply given recent conversation context.
 */
export async function generateReply(ctx: ReplyContext): Promise<string> {
  const style = ctx.style?.trim() || 'helpful and natural';
  const lang = ctx.language?.trim();
  const transcript = ctx.history
    .slice(-12)
    .map((m) => `${m.role === 'me' ? 'Me' : 'Them'}: ${m.text}`)
    .join('\n');

  const system =
    `You are an assistant drafting the next reply *as "Me"* in a WhatsApp conversation. ` +
    `Write a single reply in a ${style} tone. ` +
    (lang ? `Write the reply in ${lang}. ` : 'Write the reply in the same language as the last "Them" message. ') +
    'Return only the message text, no quotes, no preamble.';

  return complete(system, transcript || 'Start a friendly opening message.', { maxTokens: 500 });
}

/**
 * Rewrite/improve a draft in a given style without changing its core meaning.
 */
export async function improveText(text: string, style: string, language?: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';
  const lang = language?.trim();
  const system =
    `You rewrite chat messages. Rewrite the user's draft to be "${style}". ` +
    'Keep the original intent and key facts. ' +
    (lang ? `Output language: ${lang}. ` : 'Keep the original language. ') +
    'Return only the rewritten message, no quotes or commentary.';
  return complete(system, clean, { maxTokens: 600 });
}

export const aiService = {
  isConfigured: () => Boolean(env.OPENAI_API_KEY),
  translateMessage,
  detectLanguage,
  generateReply,
  improveText,
};
