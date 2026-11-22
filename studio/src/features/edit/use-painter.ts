// Painting the shown image's mask from the stage: the zoom view's pointer calls in, a finished stroke into the
// image's steps. The stroke under the finger and the brush ring are drawn straight onto the layer's canvas
// (mask-layer.tsx), not through React, so a stroke never waits on a render.
import { useStore } from "jotai";
import { useCallback, useRef } from "react";

import type { Stroke } from "@/features/edit/mask";
import { brushAtom, eraseAtom, masksAtom } from "@/features/edit/state";
import type { At, Paint } from "@/features/stage/zoom-view";

export type LayerHandle = { redraw: (live: Stroke | null, hover: At | null) => void };

export function usePainter(id: string) {
  const store = useStore();
  const handle = useRef<LayerHandle>(null);
  const live = useRef<Stroke>(null);
  const hover = useRef<At>(null);
  const on = useRef(id); // the image the stroke began on: it is the one the stroke belongs to
  const draw = () => handle.current?.redraw(live.current, hover.current);
  const paint: Paint = {
    start: (at, width) => {
      on.current = id;
      live.current = { size: store.get(brushAtom) / width, erase: store.get(eraseAtom), points: [at] };
      hover.current = at;
      draw();
    },
    move: (at) => {
      live.current?.points.push(at);
      hover.current = at;
      draw();
    },
    end: () => {
      const s = live.current;
      live.current = null;
      const at = on.current;
      if (s) store.set(masksAtom, (m) => ({ ...m, [at]: [...(m[at] ?? []), { kind: "stroke", ...s }] }));
      draw();
    },
    cancel: () => {
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
