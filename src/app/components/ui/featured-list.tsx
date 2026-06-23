import { useRef, useState } from 'react';
import { GripVertical, X, Trash2 } from 'lucide-react';
import { prettyCardName } from './utils';

type Item = { cardId: string; name: string; issuer?: string; cpa: number };

/**
 * iOS-style reorderable / swipe-to-remove list for the featured cards.
 *  - Hold the grip and drag: the row lifts and follows your finger while the
 *    others slide to make room; drop commits the new order.
 *  - Swipe a row left: it slides to reveal a red delete affordance; past the
 *    threshold it removes. (The × button remains for pointer/desktop.)
 * Pointer events make all of this work with touch + mouse alike.
 */
export function FeaturedList({ items, onReorder, onRemove }: {
  items: Item[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const ids = () => items.map(i => i.cardId);

  // ── Reorder (vertical, from the grip handle) ──────────────────────────────
  const drag = useRef<{ id: string; startY: number; rowH: number; fromIdx: number; toIdx: number } | null>(null);

  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const row = rowRefs.current[id];
    const rowH = row ? row.getBoundingClientRect().height : 56;
    const order = ids();
    drag.current = { id, startY: e.clientY, rowH, fromIdx: order.indexOf(id), toIdx: order.indexOf(id) };
    setDragId(id);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dy = e.clientY - d.startY;
    const order = ids();
    const toIdx = Math.max(0, Math.min(order.length - 1, d.fromIdx + Math.round(dy / d.rowH)));
    d.toIdx = toIdx;
    order.forEach((cid, idx) => {
      const el = rowRefs.current[cid]; if (!el) return;
      if (cid === d.id) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px) scale(1.02)`;
        el.style.zIndex = '50';
      } else {
        let shift = 0;
        if (d.fromIdx < toIdx && idx > d.fromIdx && idx <= toIdx) shift = -d.rowH;
        else if (d.fromIdx > toIdx && idx >= toIdx && idx < d.fromIdx) shift = d.rowH;
        el.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)';
        el.style.transform = shift ? `translateY(${shift}px)` : '';
        el.style.zIndex = '';
      }
    });
  };

  const clearRowStyles = () => ids().forEach(cid => {
    const el = rowRefs.current[cid];
    if (el) { el.style.transition = ''; el.style.transform = ''; el.style.zIndex = ''; el.style.opacity = ''; }
  });

  const onHandleUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    setDragId(null);
    if (!d) return;
    const el = rowRefs.current[d.id];
    const moved = d.toIdx !== d.fromIdx;
    const order = ids();
    const commit = () => {
      clearRowStyles();
      if (moved) { const a = [...order]; a.splice(d.toIdx, 0, a.splice(d.fromIdx, 1)[0]); onReorder(a); }
    };
    if (el) {
      // Settle the lifted row into its target slot, then commit so the
      // re-rendered (already-correct) DOM lands exactly where it animated to.
      el.style.transition = 'transform 0.18s cubic-bezier(0.2,0,0,1)';
      el.style.transform = `translateY(${(d.toIdx - d.fromIdx) * d.rowH}px)`;
      el.style.zIndex = '50';
      setTimeout(commit, 170);
    } else { commit(); }
  };

  // ── Swipe-to-remove (horizontal, from the row body) ───────────────────────
  const swipe = useRef<{ id: string; startX: number; startY: number; decided: boolean; horiz: boolean } | null>(null);

  const onBodyDown = (e: React.PointerEvent, id: string) => {
    if (drag.current) return;
    swipe.current = { id, startX: e.clientX, startY: e.clientY, decided: false, horiz: false };
  };
  const onBodyMove = (e: React.PointerEvent, id: string) => {
    const s = swipe.current; if (!s || s.id !== id) return;
    const dx = e.clientX - s.startX, dy = e.clientY - s.startY;
    if (!s.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.decided = true; s.horiz = Math.abs(dx) > Math.abs(dy);
      if (s.horiz) { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} }
    }
    if (!s.horiz) { swipe.current = null; return; } // vertical → let the list scroll
    const el = rowRefs.current[id]; if (!el) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${Math.min(0, dx)}px)`;
  };
  const onBodyUp = (e: React.PointerEvent, id: string) => {
    const s = swipe.current; swipe.current = null;
    const el = rowRefs.current[id]; if (!el || !s || !s.horiz) return;
    const dx = e.clientX - s.startX;
    const w = el.getBoundingClientRect().width || 320;
    if (dx < -Math.min(130, w * 0.42)) {
      el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      el.style.transform = 'translateX(-100%)';
      el.style.opacity = '0';
      setTimeout(() => onRemove(id), 190);
    } else {
      el.style.transition = 'transform 0.22s cubic-bezier(0.2,0,0,1)';
      el.style.transform = '';
    }
  };

  return (
    <div>
      {items.map(c => (
        <div key={c.cardId} className="relative overflow-hidden border-b border-hair2 last:border-b-0">
          {/* Delete affordance revealed as the row slides left */}
          <div className="absolute inset-0 flex items-center justify-end gap-1.5 pr-4 text-white text-[12px] font-semibold" style={{ background: 'var(--ds-neg)' }}>
            <Trash2 className="w-4 h-4" /> Remove
          </div>
          <div
            ref={el => { rowRefs.current[c.cardId] = el; }}
            data-feat-id={c.cardId}
            onPointerDown={e => onBodyDown(e, c.cardId)}
            onPointerMove={e => onBodyMove(e, c.cardId)}
            onPointerUp={e => onBodyUp(e, c.cardId)}
            onPointerCancel={e => onBodyUp(e, c.cardId)}
            style={{ touchAction: 'pan-y' }}
            className={`relative flex items-center gap-2 px-3 py-2.5 bg-white ${dragId === c.cardId ? 'shadow-[0_10px_30px_rgba(15,23,42,0.22)] ring-1 ring-brand/30 rounded-xl' : ''}`}
          >
            <button
              type="button"
              title="Hold & drag to reorder"
              onPointerDown={e => onHandleDown(e, c.cardId)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              style={{ touchAction: 'none' }}
              className="flex-shrink-0 -ml-1 p-1.5 text-faint2 hover:text-subtle cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink truncate">{prettyCardName(c.name)}</div>
              <div className="text-[12px] text-faint truncate">{c.issuer || '—'}</div>
            </div>
            <span className="text-[13px] font-medium text-pos tabular-nums flex-shrink-0">{c.cpa > 0 ? `$${c.cpa.toLocaleString()}` : '—'}</span>
            <button
              onClick={() => onRemove(c.cardId)}
              title="Remove"
              className="w-7 h-7 rounded-md flex items-center justify-center text-faint2 hover:text-neg hover:bg-hair2 transition-colors flex-shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
