import {
  Children, isValidElement, useEffect, useLayoutEffect, useRef,
  type ReactNode,
} from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from './utils';

/**
 * One tab panel. Rendered by <SwipeCarousel>; never renders on its own.
 */
export function Slide(_props: { tabKey: string; className?: string; children: ReactNode }) {
  return null;
}

interface SlideDef { key: string; className?: string; node: ReactNode }

/**
 * A swipeable tab carousel. The active panel and its immediate neighbours are
 * mounted side-by-side; on mobile (< 1024px) a horizontal drag slides the real
 * panels with your finger — the current tab moves out as the next moves in.
 * Past the commit threshold (or a quick flick) it animates to the neighbour and
 * commits; otherwise it springs back. Desktop and non-horizontal gestures are
 * untouched, and drags that begin in scrollable chips/nav, inputs, or
 * [data-noswipe] are ignored.
 */
export function SwipeCarousel({
  order, active, onChange, onDrag, className, children,
}: {
  order: string[];
  active: string;
  onChange: (key: string) => void;
  /** Live drag feedback so the nav can track the swipe: target tab + progress 0..1. */
  onDrag?: (target: string | null, t: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const vpRef = useRef<HTMLDivElement>(null);
  const nodes = useRef<Record<string, HTMLDivElement | null>>({});
  const winsRef = useRef<{ rel: number; key: string }[]>([]);
  const animating = useRef(false);
  const prevActive = useRef(active);
  const fromSwipe = useRef(false);   // set when the active change came from a drag-commit

  // Latest props for the once-bound native listeners.
  const live = useRef({ order, active, onChange, onDrag });
  live.current = { order, active, onChange, onDrag };

  // Build key -> content map from <Slide> children.
  const defs: SlideDef[] = Children.toArray(children)
    .filter(isValidElement)
    .map((el: any) => ({ key: el.props.tabKey, className: el.props.className, node: el.props.children }));
  const byKey = new Map(defs.map(d => [d.key, d]));

  const ai = order.indexOf(active);
  const wins = ([-1, 0, 1] as const)
    .map(rel => ({ rel, i: ai + rel }))
    .filter(({ i }) => i >= 0 && i < order.length)
    .map(({ rel, i }) => ({ rel, key: order[i] }));
  winsRef.current = wins;

  const applyTransform = (dx: number) => {
    for (const { rel, key } of winsRef.current) {
      const n = nodes.current[key];
      if (n) n.style.transform = `translateX(calc(${rel * 100}% + ${dx}px))`;
    }
  };

  // Re-base panels whenever the active tab changes. A swipe-commit already slid
  // the strip, so it just re-bases. A programmatic change (nav click / jump) gets
  // a springy slide-in: the incoming panel eases in from the side, nudges slightly
  // past, then settles into place ("resistance → snap").
  useLayoutEffect(() => {
    const prev = prevActive.current;
    prevActive.current = active;
    applyTransform(0);
    if (prev === active) return;
    if (fromSwipe.current) { fromSwipe.current = false; return; }
    const node = nodes.current[active];
    if (!node || prefersReducedMotion()) return;
    const dir = order.indexOf(active) >= order.indexOf(prev) ? 1 : -1;
    // Desktop: a quiet slide + fade. Mobile keeps a gentle spring/overshoot.
    const mobile = window.innerWidth < 1024;
    const from = mobile ? { xPercent: dir * 12, opacity: 0, scale: 0.99 } : { xPercent: dir * 4, opacity: 0 };
    const to = mobile
      ? { xPercent: 0, opacity: 1, scale: 1, duration: 0.44, ease: 'back.out(1.3)' }
      : { xPercent: 0, opacity: 1, duration: 0.3, ease: 'power2.out' };
    gsap.fromTo(node, from, { ...to, clearProps: 'transform,opacity', overwrite: true });
  }, [active]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const isMobile = () => window.innerWidth < 1024;
    const relOf = (k: string) => winsRef.current.find(w => w.key === k)?.rel;

    let st: { x: number; y: number; t: number; decided: boolean; horiz: boolean; skip: boolean; dx: number } | null = null;

    const onStart = (e: TouchEvent) => {
      if (animating.current || e.touches.length !== 1 || !isMobile()) { st = null; return; }
      const t = e.touches[0];
      const skip = !!(e.target as HTMLElement).closest('.ds-chips, .flo-scroll, input, textarea, select, [data-noswipe]');
      st = { x: t.clientX, y: t.clientY, t: e.timeStamp, decided: false, horiz: false, skip, dx: 0 };
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

      const { order, active } = live.current;
      const i = order.indexOf(active);
      const goingNext = dx < 0;
      const atEnd = (goingNext && i >= order.length - 1) || (!goingNext && i <= 0);
      if (atEnd) dx *= 0.25; // rubber-band at the ends
      st.dx = dx;
      applyTransform(dx);
      // Let the nav indicator follow the drag in real time.
      const w = vp.clientWidth || 1;
      const target = atEnd ? null : (goingNext ? order[i + 1] : order[i - 1]);
      live.current.onDrag?.(target, target ? Math.min(1, Math.abs(dx) / w) : 0);
    };

    const onEnd = (e: TouchEvent) => {
      const s = st; st = null;
      if (!s || s.skip || !s.horiz) { applyTransform(0); live.current.onDrag?.(null, 0); return; }
      const { order, active, onChange } = live.current;
      const i = order.indexOf(active);
      const w = vp.clientWidth || 1;
      const goingNext = s.dx < 0;
      const atEnd = (goingNext && i >= order.length - 1) || (!goingNext && i <= 0);
      const dt = Math.max(1, e.timeStamp - s.t);
      const velocity = Math.abs(s.dx) / dt; // px per ms
      const commit = !atEnd && (Math.abs(s.dx) > Math.min(110, w * 0.3) || velocity > 0.5);
      const target = atEnd ? null : (goingNext ? order[i + 1] : order[i - 1]);

      if (commit) {
        const nextKey = goingNext ? order[i + 1] : order[i - 1];
        const dir = goingNext ? -1 : 1;
        animating.current = true;
        const proxy = { dx: s.dx };
        gsap.to(proxy, {
          dx: dir * w, duration: 0.2, ease: 'power2.out',
          onUpdate: () => { applyTransform(proxy.dx); live.current.onDrag?.(nextKey, Math.min(1, Math.abs(proxy.dx) / w)); },
          onComplete: () => { fromSwipe.current = true; onChange(nextKey); animating.current = false; },
        });
      } else {
        const proxy = { dx: s.dx };
        gsap.to(proxy, {
          dx: 0, duration: 0.3, ease: 'power3.out',
          onUpdate: () => { applyTransform(proxy.dx); live.current.onDrag?.(target, target ? Math.min(1, Math.abs(proxy.dx) / w) : 0); },
        });
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
    <div ref={vpRef} className={className} style={{ position: 'relative', overflowX: 'clip' }}>
      {wins.map(({ rel, key }) => {
        const def = byKey.get(key);
        if (!def) return null;
        return (
          <div
            key={key}
            ref={n => { nodes.current[key] = n; }}
            className={def.className}
            role="tabpanel"
            style={{
              position: rel === 0 ? 'relative' : 'absolute',
              top: 0, left: 0, width: '100%',
              transform: `translateX(${rel * 100}%)`,
              // Keep off-screen neighbours from grabbing taps before they're active.
              pointerEvents: rel === 0 ? 'auto' : 'none',
            }}
          >
            {def.node}
          </div>
        );
      })}
    </div>
  );
}
