// Text, number and choice fields. 16px text on touch screens, or iOS zooms in on focus (the `field`
// utility in index.css).
import { cva, type VariantProps } from "class-variance-authority";
import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/ui/cn";

const field = cva("min-w-0 field placeholder:text-faint", {
  variants: {
    size: { md: "h-11 px-2.5 fine:h-8", sm: "h-8 px-2" },
    mono: { true: "font-mono tabular-nums", false: "" },
    bare: { true: "border-transparent bg-transparent px-1 focus:border-control", false: "" },
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

/** Grows with its text. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={1}
      {...props}
      className={cn(
        "field-sizing-content min-h-11 resize-none field px-2.5 py-2 placeholder:text-faint fine:min-h-10",
        className,
      )}
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
