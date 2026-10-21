// A tappable surface with no look of its own: a thumbnail, a queue row, an arrow over an image. For
// anything that looks like a control, use Button, Chip, Checkbox or Segmented.
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/ui/cn";

export function Pressable({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} className={cn("text-left", className)} />;
}
