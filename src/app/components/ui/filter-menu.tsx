import * as React from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from './utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { SegmentedControl } from './segmented-control';

export type FilterGroup = {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** 'segmented' for small fixed sets; 'list' (default) for long/dynamic lists. */
  variant?: 'list' | 'segmented';
};

/**
 * Condensed "Filters" control: one slim pill that opens a panel holding several
 * secondary filters at once, with an active-count badge and a Clear action.
 * The panel stays open across selections (Popover), so you can set several.
 * The first option of each group is treated as its default ("All").
 */
export function FilterMenu({
  groups, onClear, align = 'end', className,
}: {
  groups: FilterGroup[];
  onClear?: () => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const activeCount = groups.filter((g) => g.value !== g.options[0]?.value).length;
  const active = activeCount > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group inline-flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-full border text-[12.5px] font-medium whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors',
            active ? 'text-brand' : 'text-subtle',
            // Mobile: bare segment (active keeps a soft tint; open = raised white pill).
            active ? 'border-transparent bg-brand-soft' : 'border-transparent bg-transparent data-[state=open]:bg-white data-[state=open]:shadow-sm',
            // Desktop: standalone outlined pill.
            active ? 'sm:border-brand/40 sm:bg-brand-soft' : 'sm:border-line sm:bg-white sm:shadow-none sm:hover:border-brand/50 sm:hover:bg-surface',
            'sm:data-[state=open]:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            className,
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {active && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-faint2 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-[248px] max-w-[calc(100vw-24px)] rounded-xl bg-white ring-1 ring-ink/10 shadow-lg border-0 p-0"
      >
        <div className="max-h-[min(70vh,420px)] overflow-y-auto py-2">
          {groups.map((g, i) => (
            <div key={g.key} className={cn('px-3 py-2', i > 0 && 'border-t border-hair2')}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint2 mb-1.5">{g.label}</p>
              {g.variant === 'segmented' ? (
                <SegmentedControl options={g.options} value={g.value} onChange={g.onChange} className="w-full" />
              ) : (
                <div className="-mx-1 max-h-52 overflow-y-auto">
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => g.onChange(o.value)}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] text-left cursor-pointer transition-colors',
                        o.value === g.value ? 'text-brand font-semibold' : 'text-subtle font-medium hover:bg-surface',
                      )}
                    >
                      <Check className={cn('w-3.5 h-3.5 flex-shrink-0 text-brand', o.value === g.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{o.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {active && onClear && (
          <div className="border-t border-hair p-2">
            <button
              type="button"
              onClick={onClear}
              className="w-full h-8 rounded-lg text-[13px] font-medium text-subtle hover:bg-surface hover:text-ink transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
