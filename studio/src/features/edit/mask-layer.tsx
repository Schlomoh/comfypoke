// A mask over the stage's image, tinted (the theme's mask color, or a person's in People), with the brush's ring where
// the finger or cursor is when it is the mask being edited; the others are drawn dimmed and take no strokes. Drawn at the
// image's own size and stretched over it by CSS, so a deep zoom never asks for a giant canvas.
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

import { drawOps, drawStroke, type Op } from "@/features/edit/mask";
import { brushAtom, toolAtom, type Tap } from "@/features/edit/state";
import type { LayerHandle } from "@/features/edit/use-painter";

const ALPHA = 0.55;
const DIM = 0.22;

const canvas2d = (w: number, h: number) => {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the mask.");
  return { c, ctx };
};

export function MaskLayer({
  ops,
  taps,
  width,
  height,
  bind,
  tint,
}: {
  ops: Op[];
  taps?: Tap[]; // points tapped for SAM, shown as dots until their area is kept
  width: number;
  height: number;
  bind?: (h: LayerHandle | null) => void; // how the painter draws onto this layer; none: shown dimmed, not edited
  tint?: string; // the theme's mask color when none
}) {
  const shown = useRef<HTMLCanvasElement>(null);
  const brush = useAtomValue(brushAtom);
  const tapping = useAtomValue(toolAtom) === "tap"; // no brush ring: a tap marks a point
  const size = useRef(brush); // read while drawing: a new size must not rebuild the mask
  useEffect(() => {
    size.current = brush;
  }, [brush]);

  useEffect(() => {
    const el = shown.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const color = tint ?? getComputedStyle(el).color; // the theme's mask color, from the class
    const done = canvas2d(width, height); // the steps so far, tinted
    done.ctx.fillStyle = done.ctx.strokeStyle = color;
    drawOps(done.ctx, ops, width, height);
    done.ctx.globalCompositeOperation = "source-in"; // found areas arrive white: take the tint
    done.ctx.fillRect(0, 0, width, height);
    const work = canvas2d(width, height); // those plus the stroke under the finger

    const redraw: LayerHandle["redraw"] = (live, hover) => {
      work.ctx.clearRect(0, 0, width, height);
      work.ctx.globalCompositeOperation = "source-over";
      work.ctx.drawImage(done.c, 0, 0);
      work.ctx.strokeStyle = color;
      if (live) drawStroke(work.ctx, live, width, height);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = bind ? ALPHA : DIM;
      ctx.drawImage(work.c, 0, 0);
      ctx.globalAlpha = 1;
      const px = width / el.clientWidth; // canvas pixels per screen pixel
      for (const t of taps ?? []) {
        ctx.beginPath();
        ctx.arc(t.at[0] * width, t.at[1] * height, 7 * px, 0, 2 * Math.PI);
        ctx.fillStyle = t.not ? "rgba(0,0,0,0.6)" : "#fff";
        ctx.fill();
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = t.not ? "#f87171" : "rgba(0,0,0,0.6)";
        ctx.stroke();
      }
      if (!hover || tapping) return;
      ctx.beginPath();
      ctx.arc(hover[0] * width, hover[1] * height, (size.current / 2) * px, 0, 2 * Math.PI);
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.stroke();
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    };
    bind?.({ redraw });
    redraw(null, null);
    return () => bind?.(null);
  }, [ops, taps, tapping, width, height, bind, tint]);

  return (
    <canvas
      ref={shown}
      width={width}
      height={height}
      aria-hidden
      className="absolute inset-0 size-full text-mask"
    />
  );
}
