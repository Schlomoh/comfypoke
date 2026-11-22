// Rows put in order by hand: a drag on a row's handle (finger or mouse) moves it. The row under the finger follows
// it; the others stay until the drop, which reports where it went. Pair it with move up and down buttons for the
// keyboard. The list element gets `list`, each row `row(i)`, each row's handle `handle` and `data-index={i}`.
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

const index = (e: PointerEvent<HTMLElement>) => Number(e.currentTarget.dataset.index);

export function useReorder(onMove: (from: number, to: number) => void) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const live = useRef<{ from: number; dy: number } | null>(null); // the drop reads this: state may lag a fast flick
  const start = useRef({ y: 0, mids: [] as number[] });

  /** Where the dragged row lands: before the first other row whose middle is below the dragged row's middle. */
  const target = (from: number, dy: number) => {
    const { mids } = start.current;
    const others = mids.filter((_, i) => i !== from);
    const before = others.findIndex((m) => mids[from] + dy < m);
    return before === -1 ? others.length : before;
  };

  const handle = {
    style: { touchAction: "none", cursor: "grab" } satisfies CSSProperties,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const i = index(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      const rows = [...(list.current?.children ?? [])];
      start.current = {
        y: e.clientY,
        mids: rows.map((r) => {
          const b = r.getBoundingClientRect();
          return b.top + b.height / 2;
        }),
      };
      live.current = { from: i, dy: 0 };
      setDrag(live.current);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const i = index(e);
      if (live.current?.from !== i) return;
      live.current = { from: i, dy: e.clientY - start.current.y };
      setDrag(live.current);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const [i, d] = [index(e), live.current];
      live.current = null;
      setDrag(null);
      if (d?.from !== i) return;
      const to = target(i, d.dy);
      if (to !== i) onMove(i, to);
    },
    onPointerCancel: () => {
      live.current = null;
      setDrag(null);
    },
  };

  /** The dragged row follows the pointer, above the others. */
  const row = (i: number): { style?: CSSProperties; "data-dragging"?: true } =>
    drag?.from === i ? { style: { transform: `translateY(${drag.dy}px)` }, "data-dragging": true } : {};

  return { list, handle, row };
}
