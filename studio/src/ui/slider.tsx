import type { InputHTMLAttributes } from "react";

import { cn } from "@/ui/cn";

/** A range input, tinted like the rest of the controls (index.css). */
export function Slider({
  value,
  onValue,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValue: (v: number) => void;
}) {
  return (
    <input
      type="range"
      value={value}
      onChange={(e) => onValue(Number(e.target.value))}
      {...props}
      className={cn("h-8 min-w-0 flex-1", className)}
    />
  );
}
