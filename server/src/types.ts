import type { Chat, Message, SessionStatus } from '@prisma/client';

// The single session id used by the MVP (schema supports more).
export const DEFAULT_SESSION_ID = 'default';

// Events broadcast to connected WebSocket clients.
export type ServerEvent =
  | { type: 'status'; sessionId: string; status: SessionStatus; qr?: string | null; phoneNumber?: string | null }
  | { type: 'message'; message: Message }
  | { type: 'message:update'; message: Pick<Message, 'id' | 'status' | 'translatedBody'> }
  | { type: 'chat'; chat: Chat };

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  qr: string | null;
  phoneNumber: string | null;
}
