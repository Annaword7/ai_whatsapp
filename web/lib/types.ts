// Shared client-side types mirroring the backend API shapes.

export type SessionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  qr: string | null;
  phoneNumber: string | null;
}

export interface Chat {
  id: string;
  sessionId: string;
  jid: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  archived: boolean;
  autoTranslate: boolean;
  translateTo: string;
  contactLang: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  chatId: string;
  waId: string;
  fromMe: boolean;
  senderJid: string | null;
  senderName: string | null;
  body: string;
  translatedBody: string | null;
  detectedLang: string | null;
  type: string;
  status: string;
  timestamp: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  jid: string;
  name: string | null;
  pushName: string | null;
  language: string | null;
}

// Realtime events pushed over the WebSocket.
export type ServerEvent =
  | { type: 'status'; sessionId: string; status: SessionStatus; qr?: string | null; phoneNumber?: string | null }
  | { type: 'message'; message: Message }
  | { type: 'message:update'; message: Pick<Message, 'id' | 'status' | 'translatedBody'> }
  | { type: 'chat'; chat: Chat };
