import { create } from 'zustand';
import type { Chat, Message, SessionInfo, SessionStatus } from '@/lib/types';

interface ChatState {
  // Connection
  status: SessionStatus;
  qr: string | null;
  phoneNumber: string | null;

  // Data
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> chronological messages
  activeChatId: string | null;

  // Setters
  setSession: (s: Partial<SessionInfo>) => void;
  setChats: (chats: Chat[]) => void;
  upsertChat: (chat: Chat) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (patch: Pick<Message, 'id' | 'status' | 'translatedBody'>) => void;
  setActiveChat: (chatId: string | null) => void;
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });
}

export const useChatStore = create<ChatState>((set) => ({
  status: 'DISCONNECTED',
  qr: null,
  phoneNumber: null,
  chats: [],
  messages: {},
  activeChatId: null,

  setSession: (s) =>
    set((state) => ({
      status: s.status ?? state.status,
      qr: s.qr !== undefined ? s.qr : state.qr,
      phoneNumber: s.phoneNumber !== undefined ? s.phoneNumber : state.phoneNumber,
    })),

  setChats: (chats) => set({ chats: sortChats(chats) }),

  upsertChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      const next = idx === -1 ? [...state.chats, chat] : state.chats.map((c) => (c.id === chat.id ? chat : c));
      return { chats: sortChats(next) };
    }),

  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),

  addMessage: (message) =>
    set((state) => {
      const list = state.messages[message.chatId] ?? [];
      if (list.some((m) => m.id === message.id || m.waId === message.waId)) return {};
      const next = [...list, message].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      return { messages: { ...state.messages, [message.chatId]: next } };
    }),

  updateMessage: (patch) =>
    set((state) => {
      const messages = { ...state.messages };
      for (const chatId of Object.keys(messages)) {
        const list = messages[chatId];
        const idx = list.findIndex((m) => m.id === patch.id);
        if (idx !== -1) {
          const updated = [...list];
          updated[idx] = { ...updated[idx], status: patch.status, translatedBody: patch.translatedBody };
          messages[chatId] = updated;
          break;
        }
      }
      return { messages };
    }),

  setActiveChat: (chatId) => set({ activeChatId: chatId }),
}));
