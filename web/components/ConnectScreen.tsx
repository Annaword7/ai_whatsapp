'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { RefreshCw, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export function ConnectScreen() {
  const router = useRouter();
  const status = useChatStore((s) => s.status);
  const qr = useChatStore((s) => s.qr);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      await api.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start connection');
    } finally {
      setStarting(false);
    }
  };

  // Kick off the connection once on mount.
  useEffect(() => {
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to chats once connected.
  useEffect(() => {
    if (status === 'CONNECTED') router.replace('/');
  }, [status, router]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Smartphone className="h-8 w-8 text-primary" />
      </div>

      <div>
        <h1 className="text-xl font-bold">Link your WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open WhatsApp → Settings → Linked Devices → Link a device, then scan the code.
        </p>
      </div>

      <div className="flex h-72 w-72 items-center justify-center rounded-2xl border bg-card p-4">
        {qr ? (
          <Image src={qr} alt="WhatsApp QR code" width={256} height={256} className="rounded-lg" unoptimized />
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Spinner className="h-6 w-6" />
            <span className="text-sm">
              {status === 'CONNECTING' || starting ? 'Generating QR…' : 'Waiting for code…'}
            </span>
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Status: <span className="font-medium text-foreground">{status}</span>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button variant="secondary" size="sm" onClick={begin} disabled={starting}>
        <RefreshCw className="h-4 w-4" /> Refresh code
      </Button>
    </div>
  );
}
