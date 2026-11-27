// The desktop's three columns (lg), as a test at one moment and as a value that follows a resize.
import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 1024px)";

export const wide = () => matchMedia(WIDE).matches;

export function useWide() {
  return useSyncExternalStore((changed) => {
    const q = matchMedia(WIDE);
    q.addEventListener("change", changed);
    return () => q.removeEventListener("change", changed);
  }, wide);
}
