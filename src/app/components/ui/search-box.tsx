import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Search affordance that lives as a small icon and smoothly grows into a full
 * field on click, then minimises again when it loses focus while empty.
 *
 * Render it inside a `relative` row that reserves ~44px of left padding
 * (`pl-11`) for the collapsed icon — when open it overlays the whole row.
 */
export function SearchBox({ value, onChange, placeholder = 'Search', onOpenChange }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(!!value);
  const inputRef = useRef<HTMLInputElement>(null);

  const change = (v: boolean) => { setOpen(v); onOpenChange?.(v); };
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  return (
    <div
      data-noswipe
      onClick={() => { if (!open) change(true); }}
      className={`absolute inset-y-0 left-0 z-20 my-auto flex items-center h-9 rounded-full overflow-hidden transition-[width,background-color,border-color,box-shadow] duration-300 ease-out ${
        open
          ? 'w-full bg-white border border-line shadow-sm'
          : 'w-9 cursor-pointer text-faint hover:bg-surface hover:text-ink'
      }`}
    >
      <Search className="absolute left-[9px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        tabIndex={open ? 0 : -1}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!value) change(false); }}
        className={`w-full h-full bg-transparent pl-9 pr-9 text-[14px] text-ink outline-none transition-opacity duration-150 ${
          open ? 'opacity-100 delay-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      {open && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(''); change(false); }}
          title="Close search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-faint2 hover:text-ink hover:bg-surface transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
