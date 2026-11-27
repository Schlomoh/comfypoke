// On a desktop a row's sheet opens in the editor's column instead of over the image: a Pane, with a Sheet's
// props and regions (title, body, footer), drawn over the column through a portal into its PaneSlot. Escape or
// Done closes it, as a Sheet's.
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/ui/button";

const SLOT = "pane-slot";
/** Where a Pane is drawn: inside a positioned column, which it covers. */
export const PaneSlot = () => <div id={SLOT} className="contents" />;

export function Pane({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open], :popover-open")) onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const slot = document.getElementById(SLOT);
  if (!open || !slot) return null;
  return createPortal(
    <section
      aria-label={typeof title === "string" ? title : undefined}
      className="absolute inset-0 z-20 flex flex-col bg-panel"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate label">{title}</h2>
        <Button onClick={onClose}>Done</Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
        {children}
      </div>
      {footer && (
        <div className="flex max-h-[60%] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain border-t border-accent bg-raised px-4 pt-2.5 pb-4">
          {footer}
        </div>
      )}
    </section>,
    slot,
  );
}
