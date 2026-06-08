'use client';

import Link from 'next/link';
import { Languages } from 'lucide-react';
import type { Chat } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { chatDisplayName, formatDayLabel } from '@/lib/utils';

export function ChatListItem({ chat }: { chat: Chat }) {
  const name = chatDisplayName(chat);
  return (
    <Link
      href={`/chat/${chat.id}`}
      className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/60 active:bg-muted"
    >
      <Avatar name={name} isGroup={chat.isGroup} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatDayLabel(chat.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          {chat.autoTranslate && <Languages className="h-3.5 w-3.5 shrink-0 text-accent" />}
          <span className="truncate">
            {chat.isGroup ? 'Group chat' : chat.jid.split('@')[0]}
          </span>
        </div>
      </div>
      {chat.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
          {chat.unreadCount}
        </span>
      )}
    </Link>
  );
}
