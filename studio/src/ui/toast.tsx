// One line of feedback for actions that otherwise happen out of sight: a save into a folder, a copy, a
// deletion that can be undone. Screen readers hear it too. With a layer open it is drawn in that layer,
// under its title where it covers no control the person is reaching for; on the page it sits above the
// bottom bar.
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
        "pointer-events-none inset-x-0 z-50 flex justify-center px-4",
        inSlot ? "absolute top-0" : "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6",
      )}
    >
      {toast && (
        <div
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className="pointer-events-auto flex max-w-md items-center gap-3 border border-edge bg-raised py-1 pr-1 pl-3 font-mono text-xs shadow-lg shadow-black/50"
        >
          <span className={cn("py-2", toast.bad ? "text-bad" : "text-ink")}>{toast.text}</span>
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
