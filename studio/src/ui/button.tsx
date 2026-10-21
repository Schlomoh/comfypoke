// The one clickable control. Sizes follow the pointer: 44px for a finger, compact for a mouse.
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/ui/cn";

const button = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-35",
  {
    variants: {
      variant: {
        primary: "bg-ink font-medium text-bg hover:bg-white",
        ghost: "border border-line bg-panel font-medium hover:border-edge",
        quiet: "font-medium text-muted hover:text-ink",
        danger: "border border-line bg-panel font-medium text-bad hover:border-bad",
        // the small uppercase actions beside a heading: copy, reset, remove
        text: "font-mono text-[10.5px] text-muted uppercase hover:text-ink aria-pressed:text-ink",
        link: "font-mono text-[11px] text-muted underline underline-offset-4 hover:text-ink",
        // × and other single glyphs
        icon: "text-lg text-faint hover:text-ink",
      },
      size: {
        md: "h-11 px-3 fine:h-8",
        lg: "h-12 px-3 text-sm fine:h-10",
        inline: "min-h-11 px-2 fine:min-h-8",
        square: "size-11 fine:size-8",
      },
    },
    compoundVariants: [
      { variant: ["text", "link"], size: "md", className: "px-2" },
      { variant: "icon", className: "hover:text-bad" },
    ],
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} {...props} className={cn(button({ variant, size }), className)} />;
}
