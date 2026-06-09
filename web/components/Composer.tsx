'use client';

import { useState } from 'react';
import { Send, X } from 'lucide-react';
import type { Chat } from '@/lib/types';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { AIPanel, type AIAction } from '@/components/AIPanel';
import { Spinner } from '@/components/ui/spinner';

// Message composer with an integrated AI assist panel (reply / rewrite / translate)
// and a "translate before send" preview.
export function Composer({ chat, contactLang }: { chat: Chat; contactLang: string }) {
  const addMessage = useChatStore((s) => s.addMessage);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<AIAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // When "armed", the message is translated into `armedLang` on send.
  const [armedLang, setArmedLang] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const disarm = () => {
    setArmedLang(null);
    setPreview(null);
  };

  const handleAction = async (action: AIAction) => {
    setError(null);
    setActive(action);
    try {
      if (action === 'reply') {
        const { reply } = await api.aiReply(chat.id, 'professional', contactLang || undefined);
        setDraft(reply);
        disarm();
      } else if (action === 'professional') {
        const { text } = await api.aiImprove(draft, 'professional and polite', contactLang || undefined);
        setDraft(text);
      } else if (action === 'shorter') {
        const { text } = await api.aiImprove(draft, 'shorter and more concise');
        setDraft(text);
      } else if (action === 'translate') {
        const target = contactLang || 'English';
        const { translation } = await api.aiTranslate(draft, target);
        setPreview(translation);
        setArmedLang(target);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setActive(null);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      // If armed, the server translates `text` into armedLang before sending and
      // stores the original draft as the record's translation.
      const msg = await api.sendMessage(chat.id, text, armedLang ?? undefined);
      addMessage(msg);
      setDraft('');
      disarm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t bg-card">
      <AIPanel active={active} hasDraft={draft.trim().length > 0} contactLang={contactLang} onAction={handleAction} />

      {armedLang && preview && (
        <div className="flex items-start gap-2 bg-accent/5 px-3 py-2 text-xs">
          <span className="mt-0.5 shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
            {armedLang.toUpperCase()}
          </span>
          <p className="flex-1 text-muted-foreground">{preview}</p>
          <button onClick={disarm} className="rounded p-0.5 hover:bg-muted" aria-label="Cancel translation">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && <p className="px-3 pt-1 text-xs text-red-500">{error}</p>}

      <div className="flex items-end gap-2 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={armedLang ? `Type — will send in ${armedLang}…` : 'Message'}
          className="scrollbar-thin max-h-32 flex-1 resize-none rounded-2xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={send}
          disabled={sending || draft.trim().length === 0}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
