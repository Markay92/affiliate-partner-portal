import * as React from 'react';
import { useState } from 'react';
import { cn } from './utils';
import { SearchBox } from './search-box';

/**
 * Sticky per-tab toolbar: renders the tab head, then a single horizontally
 * scrollable row of controls (search + popups + segmented + sort), with an
 * optional trailing cluster of icon actions (refresh / collapse / clear / CTA).
 * Shared by every Manager + Dashboard tab so the controls read as one bar.
 */
export function Toolbar({
  stickyTop, head, trailing, search, children, className,
}: {
  /** px offset for `sticky top` (e.g. 60 for Manager, 60 + linkBarH for Dashboard). */
  stickyTop?: number;
  head?: React.ReactNode;
  trailing?: React.ReactNode;
  /** The search affordance, rendered outside the segmented control group. */
  search?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      style={stickyTop != null ? { top: stickyTop } : undefined}
      className={cn('sticky z-20 bg-canvas/95 backdrop-blur-md pt-4 pb-3 mb-4 border-b border-hair', className)}
    >
      {head}
      {/* Mobile: a horizontally-scrollable strip — search, then the controls in a
          single segmented "well". Desktop (sm+): the well dissolves (contents) so
          each control is a separate outlined pill and the row wraps. */}
      <div className="ds-chips flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-1 px-1">
        {search && <div className="flex-shrink-0">{search}</div>}
        <div className="flex items-center gap-0.5 rounded-full bg-surface p-0.5 flex-shrink-0 sm:contents">
          {children}
        </div>
        {trailing && <div className="flex items-center gap-1.5 flex-shrink-0 sm:ml-auto">{trailing}</div>}
      </div>
    </div>
  );
}

/**
 * The animated search affordance sized for the toolbar: a 36px icon that grows
 * to a fixed-width field on open (and shrinks back when emptied). Wraps the
 * shared SearchBox and manages the container width via its open state.
 */
export function ToolbarSearch({
  value, onChange, placeholder = 'Search', openWidthClass = 'w-[220px]',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  openWidthClass?: string;
}) {
  const [open, setOpen] = useState(!!value);
  return (
    <div className={cn(
      'relative flex items-center min-h-9 pl-11 flex-shrink-0 transition-[width] duration-300 ease-out',
      open ? openWidthClass : 'w-9',
    )}>
      <SearchBox value={value} onChange={onChange} placeholder={placeholder} onOpenChange={setOpen} />
    </div>
  );
}

/** Pill button matching the popup/segmented controls — for trailing toolbar actions. */
export function ToolbarButton({
  onClick, icon, children, active, title, className,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 rounded-full border text-[12.5px] font-medium whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors',
        children ? 'px-2.5' : 'w-8 justify-center',
        active
          ? 'border-brand/40 bg-brand-soft text-brand'
          : 'border-line bg-white text-subtle hover:border-brand/50 hover:text-brand hover:bg-surface',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
