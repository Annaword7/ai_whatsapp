'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/lib/types';
import { MessageBubble } from '@/components/MessageBubble';

export function MessageList({ messages, isGroup }: { messages: Message[]; isGroup?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} isGroup={isGroup} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
