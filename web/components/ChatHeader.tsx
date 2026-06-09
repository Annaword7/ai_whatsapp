'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Languages } from 'lucide-react';
import type { Chat } from '@/lib/types';
import { api } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { useChatStore } from '@/stores/chatStore';
import { chatDisplayName, cn } from '@/lib/utils';

export function ChatHeader({ chat }: { chat: Chat }) {
  const upsertChat = useChatStore((s) => s.upsertChat);
  const [busy, setBusy] = useState(false);
  const name = chatDisplayName(chat);

  const toggleAutoTranslate = async () => {
    setBusy(true);
    try {
      const next = !chat.autoTranslate;
      const updated = await api.updateChat(chat.id, { autoTranslate: next });
      upsertChat(updated);
      // When enabling, translate the already-loaded history too (results arrive via WS).
      if (next) void api.translateChat(chat.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="flex items-center gap-3 border-b bg-card px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
      <Link href="/" className="rounded-full p-1 hover:bg-muted">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <Avatar name={name} isGroup={chat.isGroup} className="h-9 w-9 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold leading-tight">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {chat.isGroup ? 'Group' : chat.jid.split('@')[0]}
        </div>
      </div>

      <button
        onClick={toggleAutoTranslate}
        disabled={busy}
        title="Auto-translate incoming messages"
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
          chat.autoTranslate ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Languages className="h-4 w-4" />
        {chat.autoTranslate ? chat.translateTo.toUpperCase() : 'OFF'}
      </button>
    </header>
  );
}
