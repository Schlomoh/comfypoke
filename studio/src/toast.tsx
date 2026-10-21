// One line of feedback at the bottom of the screen for actions that otherwise happen out of sight:
// a save into a folder, a copy, a deletion that can be undone. Screen readers hear it too. With a
// sheet open it is drawn inside that sheet: a modal dialog makes everything outside it inert, and
// Undo has to stay tappable.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; text: string; bad?: boolean; action?: { label: string; run: () => void } };

let show: (t: Toast) => void = () => {};
let next = 0;

export function notify(text: string, opts: { bad?: boolean; action?: Toast["action"] } = {}) {
  show({ id: ++next, text, ...opts });
}

export function Toasts() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [held, setHeld] = useState(false); // pointer or focus on it: stays until let go
  const [host, setHost] = useState<Element>(document.body);
  useEffect(() => {
    show = (t) => {
      // the sheet that has focus is the one on top; without one, the page
      setHost(document.activeElement?.closest("dialog[open]") ?? document.querySelector("dialog:modal") ?? document.body);
      setToast(t);
    };
    return () => {
      show = () => {};
    };
  }, []);
  useEffect(() => {
    if (!toast || held) return;
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 2500); // time to reach Undo
    return () => clearTimeout(t);
  }, [toast, held]);

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6"
    >
      {toast && (
        <div
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className="pointer-events-auto flex max-w-md items-center gap-3 border border-edge bg-raised py-1 pr-1 pl-3 font-mono text-xs shadow-lg shadow-black/50">
          <span className={`py-2 ${toast.bad ? "text-bad" : "text-ink"}`}>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
                setHeld(false);
              }}
              className="h-11 px-3 uppercase text-ink underline underline-offset-4 fine:h-8"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>,
    host,
  );
}
