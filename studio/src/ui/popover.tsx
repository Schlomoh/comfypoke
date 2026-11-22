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
  role = "menu",
  ...button
}: Omit<ButtonProps, "children" | "role"> & {
  trigger: ReactNode; // what the button shows
  children: ReactNode; // what opens
  align?: "center" | "start" | "end";
  panel?: string; // classes for what opens; className is the button's
  role?: "menu" | "dialog"; // a list of actions, or a question
}) {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  return (
    <>
      <Button {...button} ref={opener} popoverTarget={id} aria-haspopup={role}>
        {trigger}
      </Button>
      {/* a click inside lands on one of its buttons, or on text; only the buttons close it */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- its role is a prop: menu or dialog */}
      <div
        ref={pop}
        id={id}
        popover="auto"
        role={role}
        // the toggle event comes a frame after it shows: hidden until it is in place, not a flash at the corner
        onBeforeToggle={(e) => {
          if (e.newState === "open" && pop.current) pop.current.style.visibility = "hidden";
        }}
        onToggle={(e) => {
          if (e.newState !== "open" || !pop.current) return;
          placeBelow(opener.current, pop.current, align);
          pop.current.style.visibility = "";
        }}
        // arrows and letters belong to the menu while it is open, not to the studio's shortcuts behind it
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => (e.target as HTMLElement).closest("button") && pop.current?.hidePopover()}
        className={cn(
          "m-0 max-h-[calc(100dvh-16px)] w-60 flex-col overflow-y-auto border border-edge bg-raised p-1 text-[13px] text-ink shadow-lg open:flex",
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
  return (
    <Button
      variant="quiet"
      role="menuitem"
      {...props}
      className={cn("w-full justify-start px-3", className)}
    />
  );
}
