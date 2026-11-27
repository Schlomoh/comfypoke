// One line of feedback for actions that otherwise happen out of sight: a save into a folder, a copy, a
// deletion that can be undone. Screen readers hear it too. With a layer open it is drawn in that layer,
// over its title, where it covers no control or row the person is reaching for; on a phone page it sits just under
// the tab bar, over the top of the image rather than the panel being worked in; on a desktop at the top, clear of the stage's tools.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { topLayer, watchLayers } from "@/ui/layers";
import { listen, type Toast } from "@/ui/notify";

export function Toasts() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [held, setHeld] = useState(false); // pointer or focus on it: stays until let go
  const [host, setHost] = useState<Element>(document.body);
  useEffect(() => {
    const place = () => {
      const layer = topLayer();
      setHost(layer?.querySelector("[data-toast-slot]") ?? layer ?? document.body);
    };
    const stopListening = listen((t) => {
      place();
      setToast(t);
    });
    const stopWatching = watchLayers(place);
    return () => {
      stopListening();
      stopWatching();
    };
  }, []);
  useEffect(() => {
    if (!toast || held) return;
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 2500); // time to reach Undo
    return () => clearTimeout(t);
  }, [toast, held]);

  const inSlot = host instanceof HTMLElement && "toastSlot" in host.dataset;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none z-50 flex",
        inSlot
          ? "absolute inset-0 items-center"
          : "fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] justify-center px-4 lg:top-4",
      )}
    >
      {toast && (
        <div
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className={cn(
            "pointer-events-auto flex items-center gap-3 border border-edge bg-raised py-1 pr-1 pl-3 font-mono text-xs shadow-lg shadow-black/50",
            inSlot ? "max-w-full min-w-0" : "max-w-md",
          )}
        >
          <span className={cn("py-2", inSlot && "truncate", toast.bad ? "text-bad" : "text-ink")}>
            {toast.text}
          </span>
          {toast.action && (
            <Button
              variant="link"
              className="text-xs text-ink uppercase"
              onClick={() => {
                toast.action?.run();
                setToast(null);
                setHeld(false);
              }}
            >
              {toast.action.label}
            </Button>
          )}
        </div>
      )}
    </div>,
    host,
  );
}
