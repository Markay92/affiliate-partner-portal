import * as React from 'react';
import { cn } from './utils';

export type SegmentOption = { value: string; label: string };

/**
 * iOS-style segmented control: a pill track with N mutually-exclusive segments;
 * the active one lifts to a white pill with brand text. Use for small fixed sets
 * (≤4–5 short labels) — e.g. Status, Payout range. For long/dynamic lists use PopupButton.
 */
export function SegmentedControl({
  options, value, onChange, className,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn('inline-flex items-center gap-0.5 p-0.5 rounded-full bg-surface border border-hair flex-shrink-0', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 h-7 rounded-full text-[12.5px] font-medium whitespace-nowrap cursor-pointer transition-colors duration-150',
              active ? 'bg-white text-brand shadow-sm' : 'text-faint hover:text-subtle',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
