// An explanation kept out of the way: a small "?" that opens it in a popover. A tap toggles it (a phone has no hover),
// a mouse resting on it opens it too, and opening one closes any other (the Popover API's "auto" mode, which also
// closes it on Escape and on a tap outside). Placed under the "?" each time it opens, kept inside the screen.
import { useId, useRef, type ReactNode } from "react";

import { cn } from "@/ui/cn";
import { placeBelow } from "@/ui/place";

const WIDTH = 288; // px, 18rem

export function Tip({
  children,
  label = "What is this?",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const place = () => placeBelow(trigger.current, pop.current);
  const isOpen = () => !!pop.current?.matches(":popover-open");
  const hovered = useRef(false); // opened by the mouse resting on it: the click that follows keeps it open
  const wasOpen = useRef(false); // open when pressed: the press itself closed it (a tap outside, to the popover)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-controls={id}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || isOpen()) return;
          hovered.current = true;
          pop.current?.showPopover();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse" || !hovered.current) return;
          hovered.current = false; // only hovered, never clicked: it goes with the mouse
          pop.current?.hidePopover();
        }}
        onPointerDown={() => {
          wasOpen.current = isOpen();
        }}
        onPointerCancel={() => {
          wasOpen.current = false;
        }}
        onClick={() => {
          if (hovered.current) {
            hovered.current = false; // a click pins it: leaving no longer closes it
            if (!isOpen()) pop.current?.showPopover();
          } else if (!wasOpen.current) pop.current?.togglePopover(); // a key, or a tap while closed
          wasOpen.current = false;
        }}
        className={cn(
          "inline-grid size-11 shrink-0 place-items-center text-faint hover:text-ink fine:size-6",
          className,
        )}
      >
        <span
          aria-hidden
          className="grid size-4 place-items-center rounded-full border border-current font-mono text-[10px] leading-none"
        >
          ?
        </span>
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        role="tooltip"
        onToggle={(e) => {
          if (e.newState === "open") place();
          else hovered.current = false;
        }}
        style={{ width: WIDTH }}
        className="m-0 border border-edge bg-raised p-3 text-xs leading-relaxed text-muted"
      >
        {children}
      </div>
    </>
  );
}
