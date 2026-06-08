import type { Chat, Contact, Message, SessionInfo } from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const base = API_URL.replace(/^http/, 'ws');
  return `${base}/ws`;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when we actually send a body — otherwise
  // servers (e.g. Fastify) reject the empty-body POST as invalid JSON.
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // --- Session / connection ---
  status: () => request<SessionInfo>('/api/session/status'),
  connect: () => request<SessionInfo>('/api/session/connect', { method: 'POST' }),
  disconnect: () => request<SessionInfo>('/api/session/disconnect', { method: 'POST' }),
  logout: () => request<SessionInfo>('/api/session/logout', { method: 'POST' }),

  // --- Chats / messages ---
  chats: () => request<Chat[]>('/api/chats'),
  chat: (id: string) => request<Chat>(`/api/chats/${id}`),
  updateChat: (
    id: string,
    patch: Partial<Pick<Chat, 'autoTranslate' | 'translateTo' | 'contactLang'>>,
  ) => request<Chat>(`/api/chats/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  messages: (id: string, limit = 50) => request<Message[]>(`/api/chats/${id}/messages?limit=${limit}`),
  contact: (id: string) => request<Contact>(`/api/chats/${id}/contact`),
  translateChat: (id: string) =>
    request<{ translated: number }>(`/api/chats/${id}/translate`, { method: 'POST' }),
  sendMessage: (id: string, text: string, translateTo?: string) =>
    request<Message>(`/api/chats/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, ...(translateTo ? { translateTo } : {}) }),
    }),

  // --- AI ---
  aiTranslate: (text: string, targetLanguage: string) =>
    request<{ translation: string }>('/api/ai/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLanguage }),
    }),
  aiDetect: (text: string) =>
    request<{ language: string }>('/api/ai/detect', { method: 'POST', body: JSON.stringify({ text }) }),
  aiReply: (chatId: string, style?: string, language?: string) =>
    request<{ reply: string }>('/api/ai/reply', {
      method: 'POST',
      body: JSON.stringify({ chatId, style, language }),
    }),
  aiImprove: (text: string, style: string, language?: string) =>
    request<{ text: string }>('/api/ai/improve', {
      method: 'POST',
      body: JSON.stringify({ text, style, language }),
    }),
};

export { ApiError };
