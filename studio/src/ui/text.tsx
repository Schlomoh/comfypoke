// The few kinds of text the interface uses besides labels: hints, notes and errors, and facts in a table.
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

const note = cva("text-xs", {
  variants: {
    tone: { faint: "text-faint", muted: "text-muted", ink: "text-ink", warn: "text-warn", bad: "text-bad" },
    mono: { true: "font-mono", false: "" },
  },
  defaultVariants: { tone: "faint", mono: false },
});

/** A line of explanation. With tone "bad" it is announced as an error. */
export function Note({
  tone,
  mono,
  className,
  children,
}: VariantProps<typeof note> & { className?: string; children: ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : undefined}
      className={cn(note({ tone, mono }), "break-words", className)}
    >
      {children}
    </p>
  );
}

export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("label", className)}>{children}</h3>;
}

/** Name and value pairs in two columns, ruled. */
export function Facts({
  rows,
  className,
}: {
  rows: readonly (readonly [string, ReactNode])[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[auto_1fr] border-t border-line font-mono text-xs tabular-nums",
        className,
      )}
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="border-b border-line py-2 pr-4 text-faint">{k}</dt>
          <dd className="min-w-0 border-b border-line py-2 text-right break-words">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A thin bar along an edge, filled to `value` (0 to 1). */
export function Progress({
  value,
  tone = "ink",
  className,
}: {
  value: number;
  tone?: "ink" | "bad";
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("absolute inset-x-0 bottom-0 block h-0.5 bg-line", className)}>
      <span
        className={cn("block h-full transition-[width] duration-300", tone === "bad" ? "bg-bad" : "bg-ink")}
        style={{ width: `${100 * Math.min(1, Math.max(0, value))}%` }}
      />
    </span>
  );
}
