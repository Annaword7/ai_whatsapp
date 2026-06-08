'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquarePlus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { ChatListItem } from '@/components/ChatListItem';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const status = useChatStore((s) => s.status);
  const chats = useChatStore((s) => s.chats);
  const setChats = useChatStore((s) => s.setChats);
  const setSession = useChatStore((s) => s.setSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await api.status();
        if (active) setSession(info);
        const list = await api.chats();
        if (active) setChats(list);
      } catch {
        /* surfaced via connection banner */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [setChats, setSession]);

  return (
    <>
      <header className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold">AI WhatsApp</h1>
        </div>
        <Link href="/connect">
          <Button variant="ghost" size="sm">
            {status === 'CONNECTED' ? 'Linked' : 'Connect'}
          </Button>
        </Link>
      </header>

      <ConnectionBanner status={status} />

      <div className="scrollbar-thin flex-1 divide-y divide-border overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Spinner className="h-6 w-6" />
          </div>
        ) : chats.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <MessageSquarePlus className="h-10 w-10" />
            <p className="text-sm">
              {status === 'CONNECTED'
                ? 'No chats yet. Incoming messages will appear here.'
                : 'Link your WhatsApp to start syncing chats.'}
            </p>
            {status !== 'CONNECTED' && (
              <Link href="/connect">
                <Button size="sm">Link WhatsApp</Button>
              </Link>
            )}
          </div>
        ) : (
          chats.map((chat) => <ChatListItem key={chat.id} chat={chat} />)
        )}
      </div>
    </>
  );
}
