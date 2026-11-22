// A small panel that opens from a button and stays part of the page around it: a menu of actions, or a question
// before something costly. The Popover API's "auto" mode closes it on a tap outside, on Escape, and when another
// opens; a tap on any button inside closes it too, after that button has done its work.
import { useId, useRef, type ReactNode } from "react";

import { Button, type ButtonProps } from "@/ui/button";
import { cn } from "@/ui/cn";
import { placeBelow } from "@/ui/place";

export function Popover({
  trigger,
  children,
  align = "end",
  panel,
  ...button
}: Omit<ButtonProps, "children"> & {
  trigger: ReactNode; // what the button shows
  children: ReactNode; // what opens
  align?: "center" | "start" | "end";
  panel?: string; // classes for what opens; className is the button's
}) {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  return (
    <>
      <Button {...button} ref={opener} popoverTarget={id} aria-haspopup="dialog">
        {trigger}
      </Button>
      {/* a click inside lands on one of its buttons, or on text; only the buttons close it */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={pop}
        id={id}
        popover="auto"
        onToggle={(e) => e.newState === "open" && placeBelow(opener.current, pop.current, align)}
        onClick={(e) => (e.target as HTMLElement).closest("button") && pop.current?.hidePopover()}
        className={cn(
          "m-0 w-60 flex-col border border-edge bg-raised p-1 text-[13px] text-ink shadow-lg open:flex",
          panel,
        )}
      >
        {children}
      </div>
    </>
  );
}

/** One line of a menu. */
export function MenuItem({ className, ...props }: ButtonProps) {
  return <Button variant="quiet" {...props} className={cn("w-full justify-start px-3", className)} />;
}
