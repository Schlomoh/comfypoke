// Class names joined, with later Tailwind classes replacing earlier ones that set the same thing, so a
// caller's `h-12` beats a primitive's `h-11` without either knowing about the other.
import { extendTailwindMerge } from "tailwind-merge";

const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "bg",
        "panel",
        "raised",
        "line",
        "edge",
        "ink",
        "control",
        "muted",
        "faint",
        "ok",
        "warn",
        "bad",
      ],
    },
  },
});

export const cn = (...parts: (string | false | null | undefined)[]) => merge(parts.filter(Boolean).join(" "));
