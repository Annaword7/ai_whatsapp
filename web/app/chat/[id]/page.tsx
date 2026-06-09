'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Chat, Message } from '@/lib/types';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { ChatHeader } from '@/components/ChatHeader';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

// Stable empty-array reference so the selector never returns a fresh array
// (which would make useSyncExternalStore loop forever).
const EMPTY_MESSAGES: Message[] = [];

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;

  const messages = useChatStore((s) => s.messages[chatId]) ?? EMPTY_MESSAGES;
  const setMessages = useChatStore((s) => s.setMessages);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const storeChat = useChatStore((s) => s.chats.find((c) => c.id === chatId));

  const [chat, setChat] = useState<Chat | null>(null);
  const [contactLang, setContactLang] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Keep the local chat in sync with realtime store updates (e.g. settings toggle).
  useEffect(() => {
    if (storeChat) setChat(storeChat);
  }, [storeChat]);

  useEffect(() => {
    let active = true;
    setActiveChat(chatId);
    (async () => {
      try {
        const [c, msgs] = await Promise.all([api.chat(chatId), api.messages(chatId, 80)]);
        if (!active) return;
        setChat(c);
        setMessages(chatId, msgs);

        // If auto-translate is on, translate any untranslated history. Results
        // stream back over the WebSocket and update the bubbles in place.
        if (c.autoTranslate) void api.translateChat(chatId).catch(() => undefined);

        // Resolve the contact's language for outbound translation.
        let lang = c.contactLang ?? '';
        if (!lang) {
          const contact = await api.contact(chatId).catch(() => null);
          lang = contact?.language ?? '';
        }
        if (!lang) {
          const lastInbound = [...msgs].reverse().find((m) => !m.fromMe && m.body);
          if (lastInbound) {
            const detected = await api.aiDetect(lastInbound.body).catch(() => null);
            lang = detected?.language && detected.language !== 'unknown' ? detected.language : '';
          }
        }
        if (active) setContactLang(lang || 'English');
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      setActiveChat(null);
    };
  }, [chatId, setMessages, setActiveChat]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (notFound || !chat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Chat not found.</p>
        <Link href="/">
          <Button variant="secondary" size="sm">
            Back to chats
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chat={chat} />
      <MessageList messages={messages} isGroup={chat.isGroup} />
      <Composer chat={chat} contactLang={contactLang} />
    </div>
  );
}
