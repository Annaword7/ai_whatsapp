'use client';

import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

// App-wide client providers: opens the realtime WebSocket and registers the
// PWA service worker (production only).
export function Providers({ children }: { children: React.ReactNode }) {
  useWebSocket();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore registration errors */
    });
  }, []);

  return <>{children}</>;
}
