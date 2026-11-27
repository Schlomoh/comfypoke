// Every layer over the page is a <dialog> shown with showModal(), through Modal: it opens and closes
// with its `open` prop, holds the page still underneath, knows which layer is on top (where a toast
// goes), and passes on only the closes the person made (Escape, Back). Sheet lays a Modal out as a
// bottom sheet on a phone and a centered panel on a desktop.
import { useEffect, useRef, type ReactNode, type Ref } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { lockPage, pushLayer } from "@/ui/layers";

/**
 * While open, keeps the dialog inside what is visible. The iOS keyboard shrinks only the visual viewport, and Safari
 * pans the page to the focused field: measured against the layout viewport, a panned keyboard looks like no keyboard
 * at all. So the keyboard is how far the visible height dropped below the most seen since opening, and while it is
 * up the sheet takes exactly the visible area (`--vv-top`, `--visible`), wherever Safari has panned to. After the
 * keyboard closed, taps could otherwise land where the sheet was drawn before.
 */
function useVisibleArea(dialog: { current: HTMLDialogElement | null }, open: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    const d = dialog.current;
    if (!open || !vv || !d) return;
    let full = Math.max(window.innerHeight, vv.height);
    const fit = () => {
      full = Math.max(full, vv.height);
      d.style.setProperty("--visible", `${vv.height}px`);
      d.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      // the keyboard, not a toolbar sliding in: the sheet makes room for the field being typed in
      d.toggleAttribute("data-keyboard", full - vv.height > 120);
    };
    // The keyboard is up and the sheet shrank around the focused field: keep it in sight. Only its own
    // scroller moves; scrollIntoView would also scroll the dialog and the locked page.
    const resize = () => {
      fit();
      const f = document.activeElement;
      const box =
        f instanceof HTMLElement && d.hasAttribute("data-keyboard") && f.closest("[data-sheet-scroll]");
      if (!box || !(f instanceof HTMLElement)) return;
      const r = f.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      else if (r.top < b.top) box.scrollTop -= b.top - r.top;
    };
    // a field losing focus is the keyboard closing: make WebKit settle its viewport before the next tap
    const settle = () => requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY));
    fit();
    vv.addEventListener("resize", resize);
    vv.addEventListener("scroll", fit);
    d.addEventListener("focusout", settle);
    return () => {
      vv.removeEventListener("resize", resize);
      vv.removeEventListener("scroll", fit);
      d.removeEventListener("focusout", settle);
      d.removeAttribute("data-keyboard");
    };
  }, [dialog, open]);
}

export function Modal({
  open,
  onClose,
  children,
  className,
  label,
  keysThrough,
  ref,
}: {
  open: boolean;
  /** The studio's keyboard shortcuts keep working while it is open: the full-screen viewer. */
  keysThrough?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
  ref?: Ref<HTMLDialogElement>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d || !open) return;
    if (!d.open) d.showModal();
    const off = pushLayer(d);
    const release = lockPage();
    return () => {
      if (d.open) d.close(); // closed before the layers move on, so a toast never lands in a closing one
      off();
      release();
    };
  }, [open]);
  useVisibleArea(dialog, open);
  return (
    // the backdrop's click handler has its keyboard twin in Escape, which dialog handles natively
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={(d) => {
        dialog.current = d;
        if (typeof ref === "function") ref(d);
        else if (ref) ref.current = d;
      }}
      aria-label={label}
      data-keys-through={keysThrough || undefined}
      // The close event is queued: it can land after the dialog was closed by its prop and opened
      // again. Only a close while it should be open, of a dialog no longer open, is the person's.
      onClose={() => open && !dialog.current?.open && onClose()}
      // a tap on the backdrop closes it
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn("bg-panel p-0 text-ink", className)}
    >
      {open && children}
    </dialog>
  );
}

/**
 * A bottom sheet on a phone, a centered panel on a desktop. Its regions are stacked, never layered: the
 * title, the body, which scrolls, and an optional footer, which scrolls on its own when tall. Nothing
 * is sticky and no scroller sits inside another, so what a finger touches is what is drawn there.
 *
 * With the keyboard up (iOS shrinks only the visual viewport, never dvh) the footer gives way: typing in
 * the body folds it away, and typing in the footer hides its parts marked `data-keyboard-hide`, leaving
 * the field.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  center,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  center?: boolean; // a centered panel on every screen: the keyboard shortcuts, the workspace
}) {
  const edge = "pb-[max(1rem,env(safe-area-inset-bottom))]";
  return (
    <Modal
      open={open}
      onClose={onClose}
      label={typeof title === "string" ? title : undefined}
      className={cn(
        "overflow-hidden border-line open:flex open:flex-col",
        center
          ? "m-auto max-h-[min(90dvh,var(--visible,100dvh))] w-[min(28rem,calc(100vw-2rem))] border"
          : "mx-0 mt-auto max-h-[min(90dvh,calc(var(--visible,100dvh)-2rem))] w-screen max-w-none border-t lg:m-auto lg:w-[30rem] lg:border",
        // the keyboard up: exactly what is visible, from its top, whatever Safari panned
        "data-keyboard:fixed data-keyboard:inset-x-0 data-keyboard:top-(--vv-top) data-keyboard:bottom-auto data-keyboard:m-0 data-keyboard:h-(--visible) data-keyboard:max-h-(--visible) data-keyboard:w-screen data-keyboard:max-w-none",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        {/* a toast covers the title, never the list under it or Done */}
        <div className="relative min-w-0 flex-1">
          <h2 className="truncate label">{title}</h2>
          <div data-toast-slot className="absolute inset-0 z-10" />
        </div>
        <Button onClick={onClose}>Done</Button>
      </div>
      <div
        data-sheet-body
        data-sheet-scroll
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4",
          footer ? "pb-3" : edge,
        )}
      >
        {children}
      </div>
      {footer && (
        <div
          data-sheet-footer
          data-sheet-scroll
          className={cn(
            "flex max-h-[calc(var(--visible,100dvh)*0.4)] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain border-t border-warn bg-raised px-4 pt-2.5",
            "in-data-keyboard:focus-within:**:data-keyboard-hide:hidden",
            "[[data-keyboard]:has([data-sheet-body]:focus-within)_&]:hidden",
            edge,
          )}
        >
          {footer}
        </div>
      )}
    </Modal>
  );
}
