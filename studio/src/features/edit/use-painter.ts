// Painting the shown image's mask from the stage: the zoom view's pointer calls in, a finished stroke into the
// image's steps. The stroke under the finger and the brush ring are drawn straight onto the layer's canvas
// (mask-layer.tsx), not through React, so a stroke never waits on a render.
import { useStore } from "jotai";
import { useCallback, useRef } from "react";

import type { Stroke } from "@/features/edit/mask";
import { brushAtom, masksAtom, tapsAtom, toolAtom } from "@/features/edit/state";
import type { At, Paint } from "@/features/stage/zoom-view";

export type LayerHandle = { redraw: (live: Stroke | null, hover: At | null) => void };

const HOLD_MS = 450; // a press this long is a "not this" tap

export function usePainter(id: string) {
  const store = useStore();
  const tap = useRef<{ at: At; t: number; alt: boolean } | null>(null);
  const handle = useRef<LayerHandle>(null);
  const live = useRef<Stroke>(null);
  const hover = useRef<At>(null);
  const on = useRef(id); // the image the stroke began on: it is the one the stroke belongs to
  const draw = () => handle.current?.redraw(live.current, hover.current);
  const paint: Paint = {
    start: (at, width, alt) => {
      on.current = id;
      if (store.get(toolAtom) === "tap") {
        tap.current = { at, t: performance.now(), alt };
        return;
      }
      live.current = {
        size: store.get(brushAtom) / width,
        erase: store.get(toolAtom) === "eraser",
        points: [at],
      };
      hover.current = at;
      draw();
    },
    move: (at) => {
      live.current?.points.push(at);
      hover.current = at;
      draw();
    },
    end: () => {
      const t = tap.current;
      tap.current = null;
      if (t) {
        const point = { at: t.at, not: t.alt || performance.now() - t.t > HOLD_MS };
        store.set(tapsAtom, (all) => {
          const was = all[id] ?? { op: crypto.randomUUID(), points: [] };
          return { ...all, [id]: { ...was, points: [...was.points, point] } };
        });
        return;
      }
      const s = live.current;
      live.current = null;
      const at = on.current;
      if (s) store.set(masksAtom, (m) => ({ ...m, [at]: [...(m[at] ?? []), { kind: "stroke", ...s }] }));
      draw();
    },
    cancel: () => {
      tap.current = null;
      live.current = null;
      draw();
    },
    hover: (at) => {
      hover.current = at;
      draw();
    },
  };
  const bind = useCallback((h: LayerHandle | null) => {
    handle.current = h;
  }, []);
  return { paint, bind };
}
