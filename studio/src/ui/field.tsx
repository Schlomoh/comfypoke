// Text, number and choice fields. 16px text on touch screens, or iOS zooms in on focus (the `field`
// utility in index.css).
import { cva, type VariantProps } from "class-variance-authority";
import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/ui/cn";

const bareLook = "border-transparent bg-transparent px-1 focus:border-control";

const field = cva("min-w-0 field placeholder:text-faint", {
  variants: {
    size: { md: "h-11 px-2.5 fine:h-8", sm: "h-8 px-2" },
    mono: { true: "font-mono tabular-nums", false: "" },
    bare: { true: bareLook, false: "" },
  },
  defaultVariants: { size: "md", mono: false, bare: false },
});

type FieldVariants = VariantProps<typeof field>;

export function Input({
  size,
  mono,
  bare,
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & FieldVariants & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} className={cn(field({ size, mono, bare }), className)} />;
}

export function Select({
  size,
  mono,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & Omit<FieldVariants, "bare">) {
  return <select {...props} className={cn(field({ size, mono }), className)} />;
}

/** A field whose text is saved when it is left or Enter is pressed, not on each key; it shows the stored value again
 * when that changes under it. */
export function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<Parameters<typeof Input>[0], "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setDraft(value);
  }
  return (
    <Input
      enterKeyHint="done"
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/** Grows with its text. */
export function Textarea({
  bare,
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { bare?: boolean; ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      rows={1}
      {...props}
      className={cn(
        "field-sizing-content min-h-11 resize-none field px-2.5 py-2 placeholder:text-faint fine:min-h-10",
        bare && bareLook,
        className,
      )}
    />
  );
}

/**
 * A one-line text that wraps to show itself whole: Enter ends the edit (the keyboard says "done") and
 * no newline gets in, typed or pasted.
 */
export function LineArea({
  onText,
  onKeyDown,
  ...props
}: Omit<Parameters<typeof Textarea>[0], "onChange"> & { onText: (t: string) => void }) {
  return (
    <Textarea
      enterKeyHint="done"
      {...props}
      onChange={(e) => onText(e.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
      onKeyDown={(e) => {
        // 229: Safari ends the composition before the Enter that picks a candidate
        if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}

/** A label above its field. */
export function Labeled({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
