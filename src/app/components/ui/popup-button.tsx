import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './utils';

export type PopupOption = { value: string; label: string; icon?: React.ReactNode };
export type PopupAction = { label: string; onClick: () => void; icon?: React.ReactNode };

/**
 * Compact macOS/Finder-style popup button: a slim pill showing `[icon] Value ⌄`
 * that opens a menu of options with a ✓ on the active one. `label` is used for
 * the tooltip/aria only (kept out of the pill to stay condensed). Optional
 * `actions` render as command items below a divider (e.g. Collapse all).
 * Portaled (via Radix) so the menu escapes the toolbar's overflow/z-index.
 */
export function PopupButton({
  label, value, options, onChange, actions, align = 'start', className, icon, valueLabel, menuClassName,
}: {
  label?: string;
  value: string;
  options: PopupOption[];
  onChange: (v: string) => void;
  actions?: PopupAction[];
  align?: 'start' | 'center' | 'end';
  className?: string;
  icon?: React.ReactNode;
  /** Override the displayed value text (e.g. a custom "All" label). */
  valueLabel?: string;
  menuClassName?: string;
}) {
  const current = options.find((o) => o.value === value);
  const shown = valueLabel ?? current?.label ?? '';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(
            'group inline-flex items-center gap-1 h-8 pl-2.5 pr-2 rounded-full text-[12.5px] whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors',
            // Mobile: bare segment inside the toolbar well (open = raised white pill).
            'border border-transparent bg-transparent data-[state=open]:bg-white data-[state=open]:shadow-sm',
            // Desktop: standalone outlined pill.
            'sm:border-line sm:bg-white sm:shadow-none sm:hover:border-brand/50 sm:hover:bg-surface sm:data-[state=open]:border-brand sm:data-[state=open]:bg-surface',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            className,
          )}
        >
          {icon}
          {/* Value hides below `sm` so the pill collapses to an icon on mobile. */}
          <span className="text-ink font-semibold max-w-[150px] truncate hidden sm:inline">{shown}</span>
          <ChevronDown className="w-3.5 h-3.5 text-faint2 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 min-w-[180px] max-h-[min(60vh,340px)] overflow-y-auto rounded-xl bg-white ring-1 ring-ink/10 shadow-lg py-1.5',
            'origin-(--radix-dropdown-menu-content-transform-origin)',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            menuClassName,
          )}
        >
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              onSelect={() => onChange(o.value)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-subtle cursor-pointer outline-none data-[highlighted]:bg-surface data-[highlighted]:text-ink"
            >
              <Check className={cn('w-3.5 h-3.5 flex-shrink-0 text-brand', o.value === value ? 'opacity-100' : 'opacity-0')} />
              {o.icon}
              <span className="truncate">{o.label}</span>
            </DropdownMenu.Item>
          ))}
          {actions && actions.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-hair" />
              {actions.map((a) => (
                <DropdownMenu.Item
                  key={a.label}
                  onSelect={() => a.onClick()}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-subtle cursor-pointer outline-none data-[highlighted]:bg-surface data-[highlighted]:text-ink"
                >
                  <span className="w-3.5 flex-shrink-0 flex items-center justify-center text-faint2">{a.icon}</span>
                  <span className="truncate">{a.label}</span>
                </DropdownMenu.Item>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
