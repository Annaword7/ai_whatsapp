'use client';

import { useEffect, useRef } from 'react';
import { wsUrl } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import type { ServerEvent } from '@/lib/types';

// Opens a single resilient WebSocket to the backend and pipes realtime events
// into the global store. Mount this once near the app root.
export function useWebSocket(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const setSession = useChatStore((s) => s.setSession);
  const upsertChat = useChatStore((s) => s.upsertChat);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);

  useEffect(() => {
    let closedByUs = false;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        // Heartbeat so proxies don't drop idle connections.
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        let event: ServerEvent;
        try {
          event = JSON.parse(ev.data as string) as ServerEvent;
        } catch {
          return;
        }
        switch (event.type) {
          case 'status':
            setSession({ status: event.status, qr: event.qr ?? null, phoneNumber: event.phoneNumber ?? null });
            break;
          case 'chat':
            upsertChat(event.chat);
            break;
          case 'message':
            addMessage(event.message);
            break;
          case 'message:update':
            updateMessage(event.message);
            break;
        }
      };

      ws.onclose = () => {
        if (pingRef.current) clearInterval(pingRef.current);
        if (closedByUs) return;
        // Exponential backoff reconnect (cap 15s).
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 15_000);
        attemptsRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [setSession, upsertChat, addMessage, updateMessage]);
}
