// A phrase, a preset or a choice among several, as a small bordered tag that wraps with its neighbors.
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/ui/cn";

const chip = cva(
  "inline-flex min-h-11 max-w-full items-center gap-2 border px-2.5 text-left break-words fine:min-h-8",
  {
    variants: {
      tone: {
        add: "border-dashed border-edge text-muted hover:text-ink",
        quiet: "border-line text-muted hover:text-ink",
        plain: "border-edge bg-panel text-ink",
        off: "border-line bg-panel text-faint line-through",
        picked: "border-ink bg-ink text-bg",
        varied: "border-l-[3px] border-edge border-l-warn bg-panel text-ink",
        warn: "border-warn text-warn",
        removing: "border-dashed border-edge text-muted hover:border-bad hover:text-bad",
      },
      text: { body: "text-[13px]", small: "text-xs", mono: "font-mono text-[11px]" },
    },
    defaultVariants: { tone: "plain", text: "small" },
  },
);

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof chip>;

export function Chip({ tone, text, className, type = "button", ...props }: ChipProps) {
  return <button type={type} {...props} className={cn(chip({ tone, text }), className)} />;
}

/** A tag that is not a button itself, holding its own remove button: the versions of a phrase. */
export function Tag({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center border border-warn bg-warn/10 text-warn">
      <span className="min-w-0 py-1.5 pl-2.5 text-xs break-words">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="size-11 shrink-0 fine:size-8"
      >
        ×
      </button>
    </span>
  );
}

/** Chips in rows that wrap. */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>;
}
