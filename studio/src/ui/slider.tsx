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

/** A slider with its name before it and its value after it: a strength, a denoise. */
export function SliderRow({
  label,
  value,
  onValue,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-16 label">{label}</span>
      <Slider min={min} max={max} step={step} value={value} onValue={onValue} />
      <span className="w-10 text-right font-mono text-xs tabular-nums">{value.toFixed(2)}</span>
    </label>
  );
}
