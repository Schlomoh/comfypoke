// Every layer over the page is a <dialog> shown with showModal(), through Modal: it opens and closes
// with its `open` prop, holds the page still underneath, knows which layer is on top (where a toast
// goes), and passes on only the closes the person made (Escape, Back). Sheet lays a Modal out as a
// bottom sheet on a phone and a centered panel on a desktop.
import { useEffect, useRef, type ReactNode, type Ref } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { lockPage, pushLayer } from "@/ui/layers";

/**
 * While open, keeps the dialog inside what is visible. The iOS keyboard shrinks only the visual
 * viewport: a sheet anchored to the bottom of the layout viewport would sit behind it, Safari would pan
 * to the focused field, and after the keyboard closed taps could land where the sheet was drawn before.
 */
function useVisibleArea(dialog: { current: HTMLDialogElement | null }, open: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    const d = dialog.current;
    if (!open || !vv || !d) return;
    const fit = () => {
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      d.style.setProperty("--keyboard", `${hidden}px`);
      d.style.setProperty("--visible", `${vv.height}px`);
    };
    // a field losing focus is the keyboard closing: make WebKit settle its viewport before the next tap
    const settle = () => requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY));
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    d.addEventListener("focusout", settle);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      d.removeEventListener("focusout", settle);
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
          : "mx-0 mt-auto mb-(--keyboard,0px) max-h-[min(90dvh,calc(var(--visible,100dvh)-2rem))] w-screen max-w-none border-t lg:m-auto lg:w-[30rem] lg:border",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate label">{title}</h2>
        <Button onClick={onClose}>Done</Button>
      </div>
      <div data-toast-slot className="relative z-10 h-0 shrink-0" />
      <div
        data-sheet-body
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4",
          footer ? "pb-3" : edge,
        )}
      >
        {children}
      </div>
      {footer && (
        <div
          className={cn(
            "flex max-h-[45dvh] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain border-t border-warn bg-raised px-4 pt-2.5",
            edge,
          )}
        >
          {footer}
        </div>
      )}
    </Modal>
  );
}
