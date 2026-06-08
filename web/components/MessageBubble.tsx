'use client';

import { Check, CheckCheck, Clock, Languages } from 'lucide-react';
import type { Message } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';

function StatusIcon({ status }: { status: string }) {
  if (status === 'pending') return <Clock className="h-3 w-3" />;
  if (status === 'read') return <CheckCheck className="h-3 w-3 text-sky-500" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}

export function MessageBubble({ message, isGroup }: { message: Message; isGroup?: boolean }) {
  const mine = message.fromMe;
  const hasTranslation = Boolean(message.translatedBody && message.translatedBody !== message.body);
  const showSender = Boolean(isGroup && !mine && message.senderName);

  return (
    <div className={cn('flex w-full animate-fade-in', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          mine ? 'rounded-br-sm bg-bubble-out' : 'rounded-bl-sm bg-bubble-in',
        )}
      >
        {showSender && (
          <p className="mb-0.5 text-xs font-semibold text-accent">{message.senderName}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>

        {hasTranslation && (
          <div className="mt-1.5 border-t border-border/60 pt-1.5">
            <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-accent">
              <Languages className="h-3 w-3" />
              {mine ? 'original' : 'translated'}
            </div>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{message.translatedBody}</p>
          </div>
        )}

        <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground')}>
          <span>{formatTime(message.timestamp)}</span>
          {mine && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
