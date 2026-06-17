import { useRef } from 'react';
import type { TouchEvent } from 'react';

/**
 * Returns touch handlers that move between ordered tabs on a horizontal swipe
 * — mobile only (viewport < 1024px). Swipes that begin inside a horizontally
 * scrollable region (chips/nav, form fields, or anything marked
 * `data-noswipe`) are ignored so the page-swipe never hijacks those gestures.
 */
export function useSwipeTabs(
  order: string[],
  active: string,
  setActive: (v: string) => void,
) {
  const start = useRef<{ x: number; y: number; skip: boolean } | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || window.innerWidth >= 1024) { start.current = null; return; }
    const t = e.touches[0];
    const skip = !!(e.target as HTMLElement).closest(
      '.ds-chips, .flo-scroll, input, textarea, select, [data-noswipe]',
    );
    start.current = { x: t.clientX, y: t.clientY, skip };
  };

  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.skip) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Require a clearly horizontal gesture before switching tabs.
    if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    const i = order.indexOf(active);
    if (i === -1) return;
    const next = dx < 0 ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
    if (next !== i) setActive(order[next]);
  };

  return { onTouchStart, onTouchEnd };
}
