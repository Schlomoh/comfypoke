// Tabs over a few lists, such as a picker's subcategories: one line that scrolls sideways instead of wrapping,
// underlined rather than boxed, so they never read as chips of what they list. The open one is kept in view.
import { cn } from "@/ui/cn";

/** The open tab scrolls into view when it becomes the open one: React attaches this ref to it then. */
const inView = (el: HTMLButtonElement | null) => el?.scrollIntoView({ block: "nearest", inline: "nearest" });

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T | undefined;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string; // what the tabs choose between, for a screen reader
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        // the right edge fades, saying there is more to scroll to
        "flex shrink-0 scroll-px-8 [scrollbar-width:none] overflow-x-auto overscroll-x-contain border-b border-line [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] pr-8",
        className,
      )}
    >
      {options.map((o) => (
        <button
          type="button"
          role="tab"
          key={o}
          ref={o === value ? inView : undefined}
          aria-selected={o === value}
          onClick={() => onChange(o)}
          className={cn(
            "h-11 shrink-0 border-b-2 px-2.5 font-mono text-[11px] tracking-wider whitespace-nowrap uppercase fine:h-8",
            o === value ? "border-warn text-ink" : "border-transparent text-faint hover:text-muted",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
