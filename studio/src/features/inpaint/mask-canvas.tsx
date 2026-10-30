// Painting over an image with a finger or the mouse; mask.ts draws the strokes.
import { useCallback, useEffect, useRef } from "react";

import { draw, type Stroke } from "@/features/inpaint/mask";

const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
  const box = e.currentTarget.getBoundingClientRect();
  return [(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height];
};

export function MaskCanvas({
  src,
  width,
  height,
  strokes,
  size,
  onStroke,
}: {
  src: string;
  width: number;
  height: number;
  strokes: Stroke[];
  size: number;
  onStroke: (s: Stroke) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const finger = useRef<number | null>(null);

  const paint = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const ratio = devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    ctx.strokeStyle = getComputedStyle(c).color; // the theme's mask color, from the class
    draw(ctx, live.current ? [...strokes, live.current] : strokes, c.width, c.height);
  }, [strokes]);

  useEffect(() => {
    paint();
    const c = canvas.current;
    if (!c) return;
    const watch = new ResizeObserver(paint);
    watch.observe(c);
    return () => watch.disconnect();
  }, [paint]);

  return (
    <div
      className="relative mx-auto shrink-0 border border-line"
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(42dvh * ${width / height}))` }}
    >
      <img src={src} alt="" className="absolute inset-0 size-full" draggable={false} />
      <canvas
        ref={canvas}
        aria-label="Paint over what to repaint"
        className="absolute inset-0 size-full cursor-crosshair touch-none text-mask opacity-60"
        onPointerDown={(e) => {
          if (live.current) return; // one finger paints; a second one (a palm, a pinch) is ignored
          e.currentTarget.setPointerCapture(e.pointerId);
          finger.current = e.pointerId;
          live.current = { size, points: [at(e)] };
          paint();
        }}
        onPointerMove={(e) => {
          if (!live.current || e.pointerId !== finger.current) return;
          live.current.points.push(at(e));
          paint();
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== finger.current) return;
          if (live.current) onStroke(live.current);
          live.current = null;
        }}
        onPointerCancel={(e) => {
          if (e.pointerId !== finger.current) return;
          live.current = null;
          paint();
        }}
      />
    </div>
  );
}
