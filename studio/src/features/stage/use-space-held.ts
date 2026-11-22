// Whether Space is held, while `on`: a drag then pans the image instead of painting.
import { useEffect, useRef } from "react";

export function useSpaceHeld(on: boolean) {
  const held = useRef(false);
  useEffect(() => {
    if (!on) return;
    const key = (down: boolean) => (e: KeyboardEvent) => {
      // on a control, Space is that control's
      if (
        e.code !== "Space" ||
        (e.target instanceof Element && e.target.closest("input, textarea, select, button"))
      )
        return;
      e.preventDefault(); // not a page scroll
      held.current = down;
    };
    const down = key(true);
    const up = key(false);
    const lost = () => (held.current = false); // a keyup in another window never arrives
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", lost);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", lost);
      held.current = false;
    };
  }, [on]);
  return held;
}
