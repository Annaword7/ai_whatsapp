'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { SessionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

// Slim status strip shown when the WhatsApp connection is not fully up.
export function ConnectionBanner({ status }: { status: SessionStatus }) {
  if (status === 'CONNECTED') return null;

  const map: Record<Exclude<SessionStatus, 'CONNECTED'>, { label: string; icon: React.ReactNode; cls: string }> = {
    CONNECTING: { label: 'Connecting…', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, cls: 'bg-amber-500/15 text-amber-600' },
    QR: { label: 'Waiting for QR scan', icon: <Wifi className="h-3.5 w-3.5" />, cls: 'bg-amber-500/15 text-amber-600' },
    DISCONNECTED: { label: 'Disconnected', icon: <WifiOff className="h-3.5 w-3.5" />, cls: 'bg-red-500/15 text-red-600' },
  };
  const cfg = map[status];

  return (
    <div className={cn('flex items-center justify-center gap-2 py-1.5 text-xs font-medium', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </div>
  );
}
