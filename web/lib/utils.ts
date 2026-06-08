import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format an ISO timestamp as a short HH:MM time. */
export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Relative-ish day label for chat list (Today/Yesterday/date). */
export function formatDayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

/** Human-friendly display name from a chat (falls back to phone number). */
export function chatDisplayName(chat: { name: string | null; jid: string }): string {
  if (chat.name) return chat.name;
  if (chat.jid.endsWith('@g.us')) return 'Group';
  const id = chat.jid.split('@')[0];
  // Real phone JIDs use @s.whatsapp.net; @lid is an opaque linked-id, not a number.
  return chat.jid.endsWith('@s.whatsapp.net') ? `+${id}` : id;
}

export function initials(name: string): string {
  const parts = name.replace('+', '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
