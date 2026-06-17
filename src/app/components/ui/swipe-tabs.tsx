import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';

export interface SwipeTab { key: string; label: string }

/**
 * Wraps a set of tab panels and adds a real-time, finger-following swipe to
 * move between tabs on mobile (< 1024px):
 *  - the active panel translates with the drag,
 *  - a floating pill shows the tab you're swiping into (its title + arrow),
 *    growing more prominent as you approach the commit threshold,
 *  - on release it either animates the panel out / new panel in (GSAP) or
 *    springs back.
 *
 * Gestures that begin inside horizontally scrollable regions (chips/nav,
 * inputs, [data-noswipe]) are left alone so they keep scrolling natively.
 */
export function SwipeTabs({
  order, active, onChange, children,
}: {
  order: SwipeTab[];
  active: string;
  onChange: (key: string) => void;
  children: ReactNode;
}) {
  const vpRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  // Keep the latest props in refs so the (once-bound) native listeners read fresh values.
  const live = useRef({ order, active, onChange });
  live.current = { order, active, onChange };

  useEffect(() => {
    const vp = vpRef.current;
    const track = trackRef.current;
    const ind = indRef.current;
    if (!vp || !track) return;

    const isMobile = () => window.innerWidth < 1024;
    const idxOf = (k: string) => live.current.order.findIndex(t => t.key === k);
    const setX = gsap.quickSetter(track, 'x', 'px') as (v: number) => void;

    let st: { x: number; y: number; decided: boolean; horiz: boolean; skip: boolean; dx: number } | null = null;
    let animating = false;

    const hideInd = () => { if (ind) ind.style.opacity = '0'; };

    const onStart = (e: TouchEvent) => {
      if (animating || e.touches.length !== 1 || !isMobile()) { st = null; return; }
      const t = e.touches[0];
      const skip = !!(e.target as HTMLElement).closest(
        '.ds-chips, .flo-scroll, input, textarea, select, [data-noswipe]',
      );
      st = { x: t.clientX, y: t.clientY, decided: false, horiz: false, skip, dx: 0 };
    };

    const onMove = (e: TouchEvent) => {
      if (!st || st.skip) return;
      const t = e.touches[0];
      let dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (!st.decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        st.decided = true;
        st.horiz = Math.abs(dx) > Math.abs(dy) * 1.2;
      }
      if (!st.horiz) return;
      e.preventDefault(); // listener is non-passive

      const { order } = live.current;
      const i = idxOf(live.current.active);
      const goingNext = dx < 0;
      const atEnd = (goingNext && i >= order.length - 1) || (!goingNext && i <= 0);
      if (atEnd) dx *= 0.22; // rubber-band at the ends
      st.dx = dx;
      setX(dx);

      if (!ind) return;
      if (atEnd) { ind.style.opacity = '0'; return; }
      const tgt = goingNext ? order[i + 1] : order[i - 1];
      if (labelRef.current) labelRef.current.textContent = tgt.label;
      const w = vp.clientWidth || 1;
      const progress = Math.min(1, Math.abs(dx) / (w * 0.32));
      ind.style.opacity = String(0.35 + progress * 0.65);
      ind.style.left = goingNext ? 'auto' : '14px';
      ind.style.right = goingNext ? '14px' : 'auto';
      ind.style.transform = `translateY(-50%) scale(${0.92 + progress * 0.08})`;
      ind.style.background = progress >= 1 ? 'var(--ds-brand, #0a84ff)' : 'rgba(28,28,30,.84)';
      if (arrowRef.current) arrowRef.current.style.transform = goingNext ? 'none' : 'rotate(180deg)';
    };

    const onEnd = () => {
      const s = st; st = null;
      hideInd();
      if (!s || s.skip || !s.horiz) { gsap.to(track, { x: 0, duration: 0.2, ease: 'power3.out' }); return; }
      const { order, onChange } = live.current;
      const i = idxOf(live.current.active);
      const w = vp.clientWidth || 1;
      const goingNext = s.dx < 0;
      const atEnd = (goingNext && i >= order.length - 1) || (!goingNext && i <= 0);
      const threshold = Math.min(110, w * 0.3);

      if (!atEnd && Math.abs(s.dx) > threshold) {
        animating = true;
        const dir = goingNext ? -1 : 1;
        gsap.to(track, {
          x: dir * w, duration: 0.16, ease: 'power2.in',
          onComplete: () => {
            onChange(goingNext ? order[i + 1].key : order[i - 1].key);
            requestAnimationFrame(() => {
              gsap.fromTo(track, { x: -dir * w }, {
                x: 0, duration: 0.26, ease: 'power3.out',
                onComplete: () => { animating = false; },
              });
            });
          },
        });
      } else {
        gsap.to(track, { x: 0, duration: 0.3, ease: 'power3.out' });
      }
    };

    vp.addEventListener('touchstart', onStart, { passive: true });
    vp.addEventListener('touchmove', onMove, { passive: false });
    vp.addEventListener('touchend', onEnd, { passive: true });
    vp.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      vp.removeEventListener('touchstart', onStart);
      vp.removeEventListener('touchmove', onMove);
      vp.removeEventListener('touchend', onEnd);
      vp.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div ref={vpRef} style={{ position: 'relative', overflowX: 'clip' }}>
      <div ref={trackRef} style={{ willChange: 'transform' }}>{children}</div>
      <div
        ref={indRef}
        aria-hidden
        style={{
          position: 'fixed', top: '50%', right: '14px', zIndex: 50, opacity: 0,
          pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '7px',
          padding: '9px 14px', borderRadius: '999px', background: 'rgba(28,28,30,.84)',
          color: '#fff', transform: 'translateY(-50%)', backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 10px 30px -10px rgba(0,0,0,.5)',
          fontSize: '13px', fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap',
          transition: 'background .12s',
        }}
      >
        <span ref={arrowRef} style={{ display: 'inline-flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </span>
        <span ref={labelRef} />
      </div>
    </div>
  );
}
