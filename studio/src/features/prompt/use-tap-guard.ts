import { useRef } from "react";

/**
 * For taps that remove what is under the finger: the next item moves into its place, and a fast second
 * tap (iOS has no double-tap delay at device width) would remove that one too. Calls within `ms` of the
 * last one are dropped.
 */
export function useTapGuard(ms = 350) {
  const last = useRef(0);
  return <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      const now = performance.now();
      if (now - last.current < ms) return;
      last.current = now;
      fn(...args);
    };
}
