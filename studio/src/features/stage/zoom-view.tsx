// A zoomable, pannable image. The view is kept by the caller as a scale and the point of the image at
// the center of the frame (fractions, not pixels), so it stays put when the image changes: same
// spot, same magnification, which is how two seeds get compared. At fit, a horizontal swipe asks for
// the next or previous image and, in the full-screen viewer, a swipe down closes it. Zoomed in, a
// drag pans, so arrows at the edges take over going to the next image. With `paint` (the Edit tab) one pointer
// paints instead, in fractions of the image, and two fingers (or Space and a drag) zoom and pan.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { FIT, type View } from "@/domain/view";
import { EdgeArrows } from "@/features/stage/edge-arrows";
import { useSpaceHeld } from "@/features/stage/use-space-held";

const MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Point = { x: number; y: number };
/** Painting hides it: the brush ring stands in for it. */
const cursorOf = (painting: boolean, view: View) => {
  if (painting) return "crosshair"; // the brush ring shows only over the image
  return view.scale == null ? "zoom-in" : "grab";
};
/** Where a pointer is in the frame, which every pointer handler is on. */
const local = (e: PointerEvent<HTMLDivElement>): Point => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/** A point of the image as fractions of its width and height. */
export type At = [number, number];
export type Paint = {
  start: (at: At, width: number, alt: boolean) => void; // width: the image's on screen, in CSS pixels, for the brush's size; alt: Alt held
  move: (at: At) => void;
  end: () => void;
  cancel: () => void; // a second finger came down: that is a pinch, not a stroke
  hover: (at: At | null) => void; // where the brush is, for its ring
};

type Props = {
  src: string;
  alt: string;
  view: View;
  setView: (v: View) => void;
  onSwipe?: (dir: 1 | -1) => void;
  onTap?: () => void;
  onDismiss?: () => void; // a swipe down at fit; the frame then handles vertical drags itself
  paint?: Paint;
  overlay?: ReactNode; // drawn over the image, in its box
};

export function ZoomView({ src, alt, view, setView, onSwipe, onTap, onDismiss, paint, overlay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    dist: number;
    view: View;
    scale: number;
    moved: boolean;
    t: number;
  } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(undefined);
  const [pull, setPull] = useState(0); // how far a swipe down has dragged the image, for the viewer's close
  const painting = useRef(false);
  const space = useSpaceHeld(!!paint); // held: a drag pans while painting, as in most paint programs

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const fit = nat.w && vp.w ? Math.min(vp.w / nat.w, vp.h / nat.h) : 1;
  const scale = Math.max(view.scale ?? fit, fit); // never smaller than fit, whatever the keyboard asked for

  useEffect(() => {
    if (nat.w && view.scale != null && view.scale <= fit * 1.01) setView(FIT); // zoomed out past fit: that is fit
  }, [nat.w, fit, view.scale, setView]);
  const w = nat.w * scale;
  const h = nat.h * scale;
  const left = view.scale == null ? (vp.w - w) / 2 : vp.w / 2 - view.cx * w;
  const top = view.scale == null ? (vp.h - h) / 2 : vp.h / 2 - view.cy * h;

  // Zoom to s, taking the image point under `at` in the `from` layout to `to`: the same point for a
  // wheel, the moved midpoint of two fingers for a pinch, which pans as it zooms.
  const zoomAt = (s: number, at: Point, from = { scale, left, top }, to = at) => {
    if (!nat.w || !vp.w) return; // nothing to measure against until the image has loaded
    if (s <= fit * 1.01) return setView(FIT);
    s = Math.min(MAX, s);
    const u = (at.x - from.left) / (nat.w * from.scale);
    const v = (at.y - from.top) / (nat.h * from.scale);
    setView({
      scale: s,
      cx: clamp((vp.w / 2 - (to.x - u * nat.w * s)) / (nat.w * s), 0, 1),
      cy: clamp((vp.h / 2 - (to.y - v * nat.h * s)) / (nat.h * s), 0, 1),
    });
  };
  const atImage = (p: Point): At => [(p.x - left) / w, (p.y - top) / h];
  const toggle = (at: Point) => (view.scale == null ? zoomAt(Math.max(1, fit * 2), at) : setView(FIT));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(scale * Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    // Two fingers on the image zoom the image, not the page. touch-action alone does not stop
    // iOS Safari, which needs the touch and its own gesture events cancelled as well.
    const touch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", wheel, { passive: false }); // React's onWheel is passive and cannot stop the page scrolling
    el.addEventListener("touchstart", touch, { passive: false });
    el.addEventListener("touchmove", touch, { passive: false });
    el.addEventListener("gesturestart", block);
    el.addEventListener("gesturechange", block);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("gesturestart", block);
      el.removeEventListener("gesturechange", block);
    };
  });

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  return (
    <div
      ref={box}
      className="group relative size-full overflow-hidden select-none"
      style={{
        touchAction: view.scale == null && !onDismiss && !paint ? "pan-y" : "none",
        cursor: cursorOf(!!paint, view),
      }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // keeps a drag going outside the frame
        } catch {
          // a pointer that is already gone: the gesture still works inside the frame
        }
        pointers.current.set(e.pointerId, local(e));
        if (paint && nat.w && pointers.current.size === 1 && !space.current && e.button === 0) {
          painting.current = true;
          paint.start(atImage(local(e)), w, e.altKey);
          return;
        }
        if (painting.current) {
          painting.current = false;
          paint?.cancel();
        }
        const p = pointers.current.size === 2 ? spread() : { ...local(e), dist: 0 };
        gesture.current = { x: p.x, y: p.y, dist: p.dist, view, scale, moved: false, t: Date.now() };
      }}
      onPointerMove={(e) => {
        if (paint && e.pointerType !== "touch") paint.hover(atImage(local(e)));
        if (painting.current && pointers.current.has(e.pointerId)) {
          pointers.current.set(e.pointerId, local(e)); // where a pinch starts from if a second finger comes down
          return paint?.move(atImage(local(e)));
        }
        const g = gesture.current;
        if (!g || !pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, local(e));
        if (pointers.current.size === 2 && g.dist) {
          const p = spread();
          g.moved = true;
          const from =
            g.view.scale == null
              ? { scale: g.scale, left: (vp.w - nat.w * g.scale) / 2, top: (vp.h - nat.h * g.scale) / 2 }
              : {
                  scale: g.scale,
                  left: vp.w / 2 - g.view.cx * nat.w * g.scale,
                  top: vp.h / 2 - g.view.cy * nat.h * g.scale,
                };
          zoomAt(g.scale * (p.dist / g.dist), g, from, p);
          return;
        }
        const p = local(e);
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        if (Math.hypot(dx, dy) > 6) g.moved = true;
        if (g.view.scale == null && onDismiss && !g.dist && dy > 0 && dy > Math.abs(dx)) setPull(dy);
        if (g.view.scale != null)
          setView({
            ...g.view,
            cx: clamp(g.view.cx - dx / (nat.w * g.scale), 0, 1),
            cy: clamp(g.view.cy - dy / (nat.h * g.scale), 0, 1),
          });
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        const p = local(e);
        pointers.current.delete(e.pointerId);
        if (painting.current) {
          painting.current = false;
          return paint?.end();
        }
        if (pointers.current.size === 1 && g) {
          // one finger of a pinch lifted: the other pans on from here, not from before the pinch
          const [rest] = pointers.current.values();
          gesture.current = { ...rest, dist: 0, view, scale, moved: true, t: g.t };
          return;
        }
        if (pointers.current.size > 0 || !g) return;
        gesture.current = null;
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        setPull(0);
        if (onDismiss && g.view.scale == null && !g.dist && dy > 90 && dy > 1.5 * Math.abs(dx))
          return onDismiss();
        const sideways = !g.dist && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy);
        if (paint) return; // a pan with Space or two fingers; no swipes or taps while painting
        if (sideways && g.view.scale == null) return onSwipe?.(dx < 0 ? 1 : -1);
        if (sideways) {
          // zoomed: a drag that runs past the image's edge by 60 px goes on to the next image
          const over = (g.view.cx - dx / (nat.w * g.scale)) * nat.w * g.scale;
          if (over < -60 || over > nat.w * g.scale + 60) return onSwipe?.(dx < 0 ? 1 : -1);
        }
        if (g.moved || Date.now() - g.t > 400) return;
        if (Date.now() - lastTap.current < 300) {
          clearTimeout(tapTimer.current);
          lastTap.current = 0;
          return toggle(p); // double tap or double click
        }
        lastTap.current = Date.now();
        if (onTap) tapTimer.current = window.setTimeout(onTap, 300); // wait: it may become a double tap
      }}
      onPointerLeave={() => paint?.hover(null)}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId); // the browser took over, for a vertical page scroll
        gesture.current = null;
        if (painting.current) {
          painting.current = false;
          paint?.cancel();
        }
        setPull(0);
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="absolute max-w-none"
        style={{
          left,
          top: top + pull,
          width: w || undefined,
          height: h || undefined,
          opacity: pull ? Math.max(0.3, 1 - pull / 400) : undefined,
          imageRendering: scale >= 2 ? "pixelated" : "auto",
        }}
      />
      {overlay && nat.w > 0 && (
        <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h }}>
          {overlay}
        </div>
      )}
      {onSwipe && <EdgeArrows shown={view.scale != null || !!paint} onStep={onSwipe} />}
    </div>
  );
}
