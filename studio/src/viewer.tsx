// One image full screen, with its info beside it (or below, on a phone). Opening it adds a browser
// history entry, so Back (and the edge swipe on iOS) closes it the way leaving a page would; a
// swipe down at fit closes it too.
import { useEffect, useRef } from "react";
import { useImage, useSpace, type Render } from "./db";
import { Inspector } from "./inspector";
import { BestBtn, saveImage } from "./library";
import { describe, useObjectUrl } from "./stage";
import { Btn } from "./ui";
import { ZoomBar, ZoomView, type View } from "./zoom";

const MARK = "studioViewer"; // our entry in history.state

export function Viewer({ render, all, info, setInfo, onClose, onOpen, onReuse, onUpscale, onDelete, view, setView, onStep }: {
  render: Render | null;
  all: Render[];
  info: boolean;
  setInfo: (on: boolean) => void;
  onClose: () => void;
  onOpen: (r: Render) => void;
  onReuse: (r: Render) => void;
  onUpscale: (r: Render) => void;
  onDelete: (r: Render) => void;
  view: View;
  setView: (v: View) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const space = useSpace();
  const dialog = useRef<HTMLDialogElement>(null);
  const url = useObjectUrl(useImage(render?.id));
  const open = !!render;
  const pushed = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      history.pushState({ [MARK]: true }, "");
      pushed.current = true;
    }
    if (!open) {
      if (d.open) d.close(); // Escape has closed it already by the time this runs
      // closed by a button, Escape, a swipe or a deletion: take our entry back off (after Back it is gone already)
      if (pushed.current && history.state?.[MARK]) history.back();
      pushed.current = false;
    }
  }, [open]);

  useEffect(() => {
    // A modal dialog does not stop the page under it from scrolling: a drag on the viewer moved the
    // library behind it. The page is locked while the viewer is up and keeps its place.
    document.documentElement.classList.toggle("locked", open);
    return () => document.documentElement.classList.remove("locked");
  }, [open]);

  useEffect(() => {
    const back = () => dialog.current?.open && onClose(); // Back, or the iOS edge swipe
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [onClose]);

  return (
    <dialog ref={dialog} data-viewer onClose={onClose} aria-label="Image" className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden overscroll-none bg-bg p-0 text-ink">
      {render && (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">
              {render.title && <span className="text-ink">{render.title} · </span>}
              {describe(render)}
            </span>
            <div className="hidden sm:block">
              <ZoomBar view={view} setView={setView} />
            </div>
            <Btn onClick={() => setInfo(!info)} aria-pressed={info} title="Info and notes (I)" className={info ? "text-ink" : "text-muted"}>
              Info
            </Btn>
            <Btn onClick={onClose}>Close</Btn>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className={`min-h-0 ${info ? "h-[45%] shrink-0 lg:h-auto lg:flex-1" : "flex-1"}`}>
              {url && <ZoomView src={url} alt={render.prompt} view={view} setView={setView} onSwipe={onStep} onDismiss={onClose} />}
            </div>
            {info ? (
              <aside className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line lg:w-96 lg:flex-none lg:border-t-0 lg:border-l">
                <Inspector key={render.id} render={render} all={all} onOpen={onOpen} />
              </aside>
            ) : (
              <p className="line-clamp-3 shrink-0 border-t border-line px-3 pt-3 font-mono text-xs text-muted">{render.prompt}</p>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 border-t border-line p-3 lg:border-t-0">
            <BestBtn render={render} className="w-12" />
            <Btn onClick={() => onReuse(render)}>Reuse</Btn>
            <Btn onClick={() => onUpscale(render)} title="Upscale with the settings in the Model tab (U)">Upscale</Btn>
            <Btn onClick={() => saveImage(space, render)}>Save</Btn>
            <Btn variant="danger" onClick={() => onDelete(render)}>Delete</Btn>
          </div>
        </div>
      )}
    </dialog>
  );
}
