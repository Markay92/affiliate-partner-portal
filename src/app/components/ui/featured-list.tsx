import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { prettyCardName } from './utils';

type Item = { cardId: string; name: string; issuer?: string; cpa: number };

/**
 * iOS-style featured-cards list. The whole card is the drag target:
 *  - Hold and slide up/down to reorder (the row lifts and follows your finger
 *    while the others slide to make room; it settles into its slot on drop).
 *  - Swipe a card left to reveal a small delete icon; past the threshold it
 *    slides out and is removed.
 * Direction is decided on the first movement, so a vertical drag never shows
 * the delete affordance and a horizontal swipe never reorders.
 */
export function FeaturedList({ items, onReorder, onRemove }: {
  items: Item[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [liftId, setLiftId] = useState<string | null>(null);   // row being reordered (lift styling)
  const [swipeId, setSwipeId] = useState<string | null>(null); // row revealing the delete icon
  const g = useRef<{ id: string; startX: number; startY: number; mode: '' | 'v' | 'h'; rowH: number; fromIdx: number; toIdx: number } | null>(null);
  const ids = () => items.map(i => i.cardId);

  const clearStyles = () => ids().forEach(cid => {
    const el = rowRefs.current[cid];
    if (el) { el.style.transition = ''; el.style.transform = ''; el.style.zIndex = ''; el.style.opacity = ''; }
  });

  const onDown = (e: React.PointerEvent, id: string) => {
    const row = rowRefs.current[id];
    g.current = { id, startX: e.clientX, startY: e.clientY, mode: '', rowH: row ? row.getBoundingClientRect().height : 56, fromIdx: ids().indexOf(id), toIdx: ids().indexOf(id) };
  };

  const onMove = (e: React.PointerEvent, id: string) => {
    const s = g.current; if (!s || s.id !== id) return;
    const dx = e.clientX - s.startX, dy = e.clientY - s.startY;
    if (s.mode === '') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.mode = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      if (s.mode === 'v') setLiftId(id); else setSwipeId(id);
    }
    if (s.mode === 'v') {
      const order = ids();
      const toIdx = Math.max(0, Math.min(order.length - 1, s.fromIdx + Math.round(dy / s.rowH)));
      s.toIdx = toIdx;
      order.forEach((cid, idx) => {
        const el = rowRefs.current[cid]; if (!el) return;
        if (cid === s.id) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px) scale(1.02)`;
          el.style.zIndex = '50';
        } else {
          let sh = 0;
          if (s.fromIdx < toIdx && idx > s.fromIdx && idx <= toIdx) sh = -s.rowH;
          else if (s.fromIdx > toIdx && idx >= toIdx && idx < s.fromIdx) sh = s.rowH;
          el.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)';
          el.style.transform = sh ? `translateY(${sh}px)` : '';
          el.style.zIndex = '';
        }
      });
    } else {
      const el = rowRefs.current[id]; if (!el) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${Math.min(0, dx)}px)`;
    }
  };

  const onUp = (e: React.PointerEvent, id: string) => {
    const s = g.current; g.current = null;
    if (!s) return;
    if (s.mode === 'v') {
      const el = rowRefs.current[s.id];
      const moved = s.toIdx !== s.fromIdx;
      const order = ids();
      const commit = () => {
        clearStyles(); setLiftId(null);
        if (moved) { const a = [...order]; a.splice(s.toIdx, 0, a.splice(s.fromIdx, 1)[0]); onReorder(a); }
      };
      if (el) {
        el.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)';
        el.style.transform = `translateY(${(s.toIdx - s.fromIdx) * s.rowH}px)`;
        el.style.zIndex = '50';
        setTimeout(commit, 170);
      } else commit();
    } else if (s.mode === 'h') {
      const el = rowRefs.current[id];
      const dx = e.clientX - s.startX;
      const w = el ? el.getBoundingClientRect().width : 320;
      if (el && dx < -Math.min(120, w * 0.4)) {
        el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        el.style.transform = 'translateX(-100%)';
        el.style.opacity = '0';
        setTimeout(() => { onRemove(id); setSwipeId(null); }, 190);
      } else {
        if (el) { el.style.transition = 'transform 0.22s cubic-bezier(0.2,0,0,1)'; el.style.transform = ''; }
        setSwipeId(null);
      }
    } else {
      setLiftId(null); setSwipeId(null);
    }
  };

  return (
    <div>
      {items.map(c => (
        <div key={c.cardId} className="relative border-b border-hair2 last:border-b-0">
          {/* delete affordance — only visible while this row is being swiped left */}
          <div
            aria-hidden
            className={`absolute inset-0 flex items-center justify-end pr-5 transition-opacity duration-150 ${swipeId === c.cardId ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'var(--ds-neg)' }}
          >
            <Trash2 className="w-[18px] h-[18px] text-white" />
          </div>
          <div
            ref={el => { rowRefs.current[c.cardId] = el; }}
            data-feat-id={c.cardId}
            onPointerDown={e => onDown(e, c.cardId)}
            onPointerMove={e => onMove(e, c.cardId)}
            onPointerUp={e => onUp(e, c.cardId)}
            onPointerCancel={e => onUp(e, c.cardId)}
            style={{ touchAction: 'none' }}
            className={`relative flex items-center gap-3 px-4 py-3 bg-white select-none cursor-grab active:cursor-grabbing ${liftId === c.cardId ? 'shadow-[0_10px_30px_rgba(15,23,42,0.22)] ring-1 ring-brand/30 rounded-xl' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink truncate">{prettyCardName(c.name)}</div>
              <div className="text-[12px] text-faint truncate">{c.issuer || '—'}</div>
            </div>
            <span className="text-[13px] font-medium text-pos tabular-nums flex-shrink-0">{c.cpa > 0 ? `$${c.cpa.toLocaleString()}` : '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
