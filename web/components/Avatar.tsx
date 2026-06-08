import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/utils';

export function Avatar({ name, isGroup, className }: { name: string; isGroup?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground',
        className,
      )}
    >
      {isGroup ? <Users className="h-5 w-5" /> : initials(name)}
    </div>
  );
}
