// A zoomable, pannable image. The view is kept by the caller as a scale and the point of the image at
// the center of the frame (fractions, not pixels), so it stays put when the image changes: same
// spot, same magnification, which is how two seeds get compared. At fit, a horizontal swipe asks for
// the next or previous image and, in the full-screen viewer, a swipe down closes it. Zoomed in, a
// drag pans, so arrows at the edges take over going to the next image.
import { useEffect, useRef, useState } from "react";

export type View = { scale: number | null; cx: number; cy: number }; // scale: screen px per image px; null fits
export const FIT: View = { scale: null, cx: 0.5, cy: 0.5 };
const MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Props = {
  src: string;
  alt: string;
  view: View;
  setView: (v: View) => void;
  onSwipe?: (dir: 1 | -1) => void;
  onTap?: () => void;
  onDismiss?: () => void; // a swipe down at fit; the frame then handles vertical drags itself
};

export function ZoomView({ src, alt, view, setView, onSwipe, onTap, onDismiss }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; dist: number; view: View; scale: number; moved: boolean; t: number } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(undefined);
  const [pull, setPull] = useState(0); // how far a swipe down has dragged the image, for the viewer's close

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

  // Zoom to s, taking the image point under (px, py) in the `from` layout to (tx, ty): the same
  // point for a wheel, the moved midpoint of two fingers for a pinch, which pans as it zooms.
  const zoomAt = (s: number, px: number, py: number, from = { scale, left, top }, tx = px, ty = py) => {
    if (!nat.w || !vp.w) return; // nothing to measure against until the image has loaded
    if (s <= fit * 1.01) return setView(FIT);
    s = Math.min(MAX, s);
    const u = (px - from.left) / (nat.w * from.scale);
    const v = (py - from.top) / (nat.h * from.scale);
    setView({ scale: s, cx: clamp((vp.w / 2 - (tx - u * nat.w * s)) / (nat.w * s), 0, 1), cy: clamp((vp.h / 2 - (ty - v * nat.h * s)) / (nat.h * s), 0, 1) });
  };
  const toggle = (px: number, py: number) => (view.scale == null ? zoomAt(Math.max(1, fit * 2), px, py) : setView(FIT));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    // Two fingers on the image zoom the image, not the page. touch-action alone does not stop
    // iOS Safari, which needs the touch and its own gesture events cancelled as well.
    const touch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    const gesture = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", wheel, { passive: false }); // React's onWheel is passive and cannot stop the page scrolling
    el.addEventListener("touchstart", touch, { passive: false });
    el.addEventListener("touchmove", touch, { passive: false });
    el.addEventListener("gesturestart", gesture);
    el.addEventListener("gesturechange", gesture);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("gesturestart", gesture);
      el.removeEventListener("gesturechange", gesture);
    };
  });

  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  return (
    <div
      ref={box}
      className="group relative size-full overflow-hidden select-none"
      style={{ touchAction: view.scale == null && !onDismiss ? "pan-y" : "none", cursor: view.scale == null ? "zoom-in" : "grab" }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // keeps a drag going outside the frame
        } catch {
          // a pointer that is already gone: the gesture still works inside the frame
        }
        pointers.current.set(e.pointerId, local(e));
        const p = pointers.current.size === 2 ? spread() : { ...local(e), dist: 0 };
        gesture.current = { x: p.x, y: p.y, dist: p.dist, view, scale, moved: false, t: Date.now() };
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || !pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, local(e));
        if (pointers.current.size === 2 && g.dist) {
          const p = spread();
          g.moved = true;
          const from = g.view.scale == null
            ? { scale: g.scale, left: (vp.w - nat.w * g.scale) / 2, top: (vp.h - nat.h * g.scale) / 2 }
            : { scale: g.scale, left: vp.w / 2 - g.view.cx * nat.w * g.scale, top: vp.h / 2 - g.view.cy * nat.h * g.scale };
          zoomAt(g.scale * (p.dist / g.dist), g.x, g.y, from, p.x, p.y);
          return;
        }
        const p = local(e);
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        if (Math.hypot(dx, dy) > 6) g.moved = true;
        if (g.view.scale == null && onDismiss && !g.dist && dy > 0 && dy > Math.abs(dx)) setPull(dy);
        if (g.view.scale != null) setView({ ...g.view, cx: clamp(g.view.cx - dx / (nat.w * g.scale), 0, 1), cy: clamp(g.view.cy - dy / (nat.h * g.scale), 0, 1) });
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        const p = local(e);
        pointers.current.delete(e.pointerId);
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
        if (onDismiss && g.view.scale == null && !g.dist && dy > 90 && dy > 1.5 * Math.abs(dx)) return onDismiss();
        const sideways = !g.dist && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy);
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
          return toggle(p.x, p.y); // double tap or double click
        }
        lastTap.current = Date.now();
        if (onTap) tapTimer.current = window.setTimeout(onTap, 300); // wait: it may become a double tap
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId); // the browser took over, for a vertical page scroll
        gesture.current = null;
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
      {onSwipe && (
        // zoomed in, a drag pans the image, so these are how to get to the next one; with a mouse they show on hover
        <div
          className={`pointer-events-none absolute inset-0 items-center justify-between px-2 ${
            view.scale == null ? "hidden opacity-0 group-hover:opacity-100 [@media(pointer:fine)]:flex" : "flex" // at fit a finger swipes instead
          }`}
        >
          {([[-1, "‹", "Previous image"], [1, "›", "Next image"]] as const).map(([dir, glyph, label]) => (
            <button
              key={dir}
              aria-label={label}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSwipe(dir)}
              className="pointer-events-auto grid size-11 place-items-center border border-line bg-bg/75 text-lg text-ink backdrop-blur-sm hover:border-edge"
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ZoomBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const opt = (label: string, v: View) => {
    const on = view.scale === v.scale;
    return (
      <button
        key={label}
        onClick={() => setView({ ...v, cx: view.cx, cy: view.cy })}
        aria-pressed={on}
        className={`h-11 px-2 font-mono text-[10.5px] fine:h-8 uppercase ${on ? "text-ink" : "text-faint hover:text-ink"}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex items-center">
      {opt("fit", FIT)}
      {opt("1:1", { ...FIT, scale: 1 })}
      {opt("2:1", { ...FIT, scale: 2 })}
      {view.scale != null && ![1, 2].includes(view.scale) && (
        <span className="px-1 font-mono text-[10.5px] text-muted tabular-nums">{Math.round(view.scale * 100)}%</span>
      )}
    </div>
  );
}
