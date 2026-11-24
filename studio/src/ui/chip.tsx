// A phrase, a preset or a choice among several, as a small bordered tag that wraps with its neighbors.
import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { cn } from "@/ui/cn";
import { LineArea } from "@/ui/field";

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

const TAG = { warn: "border-warn bg-warn/10 text-warn", mask: "border-mask bg-mask/10 text-mask" } as const;

/** Focused once, when it appears, with the caret at the end. */
const focusEnd = (el: HTMLTextAreaElement | null) => {
  el?.focus();
  el?.setSelectionRange(el.value.length, el.value.length);
};

/**
 * A tag that is not a button itself, holding its own remove button: the versions of a phrase, an area of a
 * mask. An editable one turns into a field in place when its text is tapped; Enter or leaving it saves.
 */
export function Tag({
  children,
  onRemove,
  removeLabel,
  tone = "warn",
  edit,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  tone?: keyof typeof TAG;
  edit?: { value: string; label: string; onSave: (text: string) => void };
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // A sheet closed mid-edit removes the field without a blur: what was typed is saved then.
  const pending = useRef<{ draft: string | null; save?: (t: string) => void }>({ draft: null });
  useEffect(() => {
    pending.current = { draft, save: edit?.onSave };
  });
  useEffect(
    () => () => {
      const { draft: d, save } = pending.current;
      if (d !== null) save?.(d);
    },
    [],
  );
  if (edit && draft !== null)
    return (
      <span className={cn("flex w-full border", TAG[tone])}>
        <LineArea
          bare
          ref={focusEnd}
          value={draft}
          onText={setDraft}
          onBlur={() => {
            pending.current.draft = null;
            setDraft(null);
            edit.onSave(draft);
          }}
          aria-label={edit.label}
          className="min-h-10 flex-1 border-0 py-2.5 text-ink fine:min-h-8 fine:py-1.5"
        />
      </span>
    );
  return (
    <span className={cn("inline-flex max-w-full items-center border", TAG[tone])}>
      {edit ? (
        <button
          type="button"
          // focused within the tap, or iOS leaves the keyboard down
          onClick={() => flushSync(() => setDraft(edit.value))}
          title="Tap to change"
          className="min-h-11 min-w-0 py-1.5 pl-2.5 text-left text-xs break-words fine:min-h-8"
        >
          {children}
        </button>
      ) : (
        <span className="min-w-0 py-1.5 pl-2.5 text-xs break-words">{children}</span>
      )}
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
