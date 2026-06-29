import { forwardRef, useImperativeHandle, useRef } from 'react';

export type CustomDateHandle = { open: () => void };

/**
 * Sequential native date-range picker (no modal). Call `ref.open()` from the
 * "Custom" control: the start date picker opens immediately, and as soon as a
 * start date is chosen the end date picker opens automatically. The inputs are
 * visually hidden — only the OS date pickers are ever shown.
 */
export const CustomDateRange = forwardRef<CustomDateHandle, {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}>(({ from, to, onFrom, onTo }, ref) => {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const open = (el: HTMLInputElement | null) => {
    if (!el) return;
    try {
      if (typeof (el as any).showPicker === 'function') (el as any).showPicker();
      else { el.focus(); el.click(); }
    } catch { el.focus(); }
  };

  useImperativeHandle(ref, () => ({ open: () => open(startRef.current) }), []);

  // Rendered (not display:none, so showPicker works) but visually hidden.
  const hidden = 'pointer-events-none opacity-0 w-px h-px p-0 border-0';

  return (
    <span className="relative inline-block w-0 h-0 overflow-hidden align-middle" aria-hidden>
      <input
        ref={startRef}
        type="date"
        tabIndex={-1}
        value={from}
        max={to || undefined}
        onChange={(e) => { onFrom(e.target.value); open(endRef.current); }}
        className={`absolute left-0 top-0 ${hidden}`}
      />
      <input
        ref={endRef}
        type="date"
        tabIndex={-1}
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        className={`absolute left-0 top-0 ${hidden}`}
      />
    </span>
  );
});
CustomDateRange.displayName = 'CustomDateRange';
