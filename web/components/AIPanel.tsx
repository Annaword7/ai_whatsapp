'use client';

import { Briefcase, Languages, Scissors, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export type AIAction = 'reply' | 'professional' | 'shorter' | 'translate';

interface AIPanelProps {
  active: AIAction | null; // which action is currently running
  hasDraft: boolean;
  contactLang: string;
  onAction: (action: AIAction) => void;
}

// Horizontal scrollable bar of AI assist actions, shown above the composer.
export function AIPanel({ active, hasDraft, contactLang, onAction }: AIPanelProps) {
  const chips: Array<{ id: AIAction; label: string; icon: React.ReactNode; needsDraft: boolean }> = [
    { id: 'reply', label: 'AI reply', icon: <Sparkles className="h-3.5 w-3.5" />, needsDraft: false },
    { id: 'professional', label: 'Professional', icon: <Briefcase className="h-3.5 w-3.5" />, needsDraft: true },
    { id: 'shorter', label: 'Shorter', icon: <Scissors className="h-3.5 w-3.5" />, needsDraft: true },
    { id: 'translate', label: `Translate → ${contactLang.toUpperCase()}`, icon: <Languages className="h-3.5 w-3.5" />, needsDraft: true },
  ];

  return (
    <div className="scrollbar-thin flex gap-2 overflow-x-auto border-t bg-card px-3 py-2">
      {chips.map((chip) => {
        const disabled = (chip.needsDraft && !hasDraft) || (active !== null && active !== chip.id);
        const running = active === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onAction(chip.id)}
            disabled={disabled}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition',
              'hover:bg-accent/20 disabled:opacity-40',
            )}
          >
            {running ? <Spinner className="h-3.5 w-3.5" /> : chip.icon}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
