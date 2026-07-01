import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { cn, type SortState, toggleSort } from './utils';

/**
 * Finder-style sort popup: `Sort: <field> <↑/↓> ⌄`. Lists the sortable fields
 * with a ✓ + direction arrow on the active one; picking the active field flips
 * direction, another field starts ascending. Shares SortState with the column
 * headers (SortHead), so both stay in sync.
 */
export function SortMenu({
  sort, onSort, fields, align = 'end', className,
}: {
  sort: SortState;
  onSort: (next: SortState) => void;
  fields: { field: string; label: string }[];
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const active = fields.find((f) => f.field === sort.field);
  const DirIcon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Sort"
          aria-label="Sort"
          className={cn(
            'group inline-flex items-center gap-1 h-8 pl-2.5 pr-2 rounded-full text-[12.5px] whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors',
            'border border-transparent bg-transparent data-[state=open]:bg-white data-[state=open]:shadow-sm',
            'sm:border-line sm:bg-white sm:shadow-none sm:hover:border-brand/50 sm:hover:bg-surface sm:data-[state=open]:border-brand sm:data-[state=open]:bg-surface',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            className,
          )}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-faint2" />
          <span className="text-ink font-semibold max-w-[120px] truncate hidden sm:inline">{active?.label ?? '—'}</span>
          <DirIcon className="w-3 h-3 text-brand" />
          <ChevronDown className="w-3.5 h-3.5 text-faint2 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 min-w-[180px] rounded-xl bg-white ring-1 ring-ink/10 shadow-lg py-1.5',
            'origin-(--radix-dropdown-menu-content-transform-origin)',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          {fields.map((f) => {
            const isActive = f.field === sort.field;
            return (
              <DropdownMenu.Item
                key={f.field}
                // Keep the menu open so a second click on the active field flips direction.
                onSelect={(e) => { e.preventDefault(); onSort(toggleSort(sort, f.field)); }}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-subtle cursor-pointer outline-none data-[highlighted]:bg-surface data-[highlighted]:text-ink"
              >
                <Check className={cn('w-3.5 h-3.5 flex-shrink-0 text-brand', isActive ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 truncate">{f.label}</span>
                {isActive && <DirIcon className="w-3 h-3 flex-shrink-0 text-brand" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
