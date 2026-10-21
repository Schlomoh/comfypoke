// One image full screen, with its info beside it (or below, on a phone). Opening it adds a browser
// history entry, so Back (and the edge swipe on iOS) closes it the way leaving a page would; a
// swipe down at fit closes it too. A render still in progress shows its live preview, so swiping
// passes through the queue as if it were part of the library.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { useImage, useObjectUrl } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { describe } from "@/domain/format";
import { status, type Job } from "@/domain/job";
import type { Render } from "@/domain/render";
import { ActivityButton } from "@/features/activity/activity-button";
import { BestButton } from "@/features/library/best-button";
import { saveImage } from "@/features/library/files";
import { ZoomBar } from "@/features/stage/zoom-bar";
import { ZoomView } from "@/features/stage/zoom-view";
import { Inspector } from "@/features/viewer/inspector";
import { useImageActions } from "@/state/actions";
import { useJobs } from "@/state/jobs";
import { infoAtom, viewAtom, viewerAtom, viewerItemAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Modal } from "@/ui/modal";

const MARK = "studioViewer"; // our entry in history.state
const ours = () => !!(history.state as Record<string, unknown> | null)?.[MARK];

function RenderView({ render, onClose }: { render: Render; onClose: () => void }) {
  const space = useSpace();
  const [info, setInfo] = useAtom(infoAtom);
  const [view, setView] = useAtom(viewAtom);
  const { reuse, upscaleMany, remove, step } = useImageActions();
  const url = useObjectUrl(useImage(render.id));
  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">
          {render.title && <span className="text-ink">{render.title} · </span>}
          {describe(render)}
        </span>
        <div className="hidden sm:block">
          <ZoomBar />
        </div>
        <ActivityButton />
        <Button
          onClick={() => setInfo(!info)}
          aria-pressed={info}
          title="Info and notes (I)"
          className={info ? "text-ink" : "text-muted"}
        >
          Info
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={cn("min-h-0", info ? "h-[45%] shrink-0 lg:h-auto lg:flex-1" : "flex-1")}>
          {url && (
            <ZoomView
              src={url}
              alt={render.prompt}
              view={view}
              setView={setView}
              onSwipe={step}
              onDismiss={onClose}
            />
          )}
        </div>
        {info ? (
          <aside className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line lg:w-96 lg:flex-none lg:border-t-0 lg:border-l">
            <Inspector key={render.id} render={render} />
          </aside>
        ) : (
          <p className="line-clamp-3 shrink-0 border-t border-line px-3 pt-3 font-mono text-xs text-muted">
            {render.prompt}
          </p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 border-t border-line p-3 lg:border-t-0">
        <BestButton render={render} className="w-12" />
        <Button onClick={() => reuse(render)}>Reuse</Button>
        <Button
          onClick={() => void upscaleMany([render])}
          title="Upscale with the settings in the Model tab (U)"
        >
          Upscale
        </Button>
        <Button onClick={() => void saveImage(space, render)}>Save</Button>
        <Button variant="danger" onClick={() => void remove(render)}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/** No image to zoom, but the same swipes as ZoomView: sideways for the next one, down to close. */
function NoPreview({ job, onClose }: { job: Job; onClose: () => void }) {
  const { step } = useImageActions();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="grid h-full touch-none place-items-center font-mono text-xs text-faint"
      onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        if (!swipe.current) return;
        const [dx, dy] = [e.clientX - swipe.current.x, e.clientY - swipe.current.y];
        swipe.current = null;
        if (dy > 90 && dy > Math.abs(dx)) onClose();
        else if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
    >
      {job.error ? "No image" : "No preview yet"}
    </div>
  );
}

function JobView({ job, onClose }: { job: Job; onClose: () => void }) {
  const [view, setView] = useAtom(viewAtom);
  const { step } = useImageActions();
  const { cancel, dismiss } = useJobs();
  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">
          {job.params && describe(job.params)}
        </span>
        <ActivityButton />
        <Button onClick={onClose}>Close</Button>
      </div>
      <div className="min-h-0 flex-1">
        {job.preview ? (
          <ZoomView
            src={job.preview}
            alt=""
            view={view}
            setView={setView}
            onSwipe={step}
            onDismiss={onClose}
          />
        ) : (
          <NoPreview job={job} onClose={onClose} />
        )}
      </div>
      <div className="flex min-h-16 shrink-0 items-center gap-3 border-t border-line p-3 font-mono text-xs">
        {job.error ? (
          <>
            <span className="min-w-0 flex-1 break-words text-bad" role="alert">
              Failed: {job.error}
            </span>
            <Button onClick={() => dismiss(job.id)}>Dismiss</Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-ink" aria-live="polite">
              {status(job)}
            </span>
            <Button onClick={() => cancel(job.id)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Viewer() {
  const { render, job } = useAtomValue(viewerItemAtom);
  const setViewer = useSetAtom(viewerAtom);
  const close = useCallback(() => setViewer(null), [setViewer]);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = !!render || !!job;
  const pushed = useRef(false);

  // the keyboard tells this layer from the others by it: keys still browse while the viewer is open

  useEffect(() => {
    if (open && !pushed.current) {
      history.pushState({ [MARK]: true }, "");
      pushed.current = true;
    }
    if (!open) {
      // closed by a button, Escape, a swipe or a deletion: take our entry back off (after Back it is gone already)
      if (pushed.current && ours()) history.back();
      pushed.current = false;
    }
  }, [open]);

  useEffect(() => {
    const back = () => {
      if (dialog.current?.open) close(); // Back, or the iOS edge swipe
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [close]);

  return (
    <Modal
      keysThrough
      ref={dialog}
      open={open}
      onClose={close}
      label="Image"
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden overscroll-none bg-bg"
    >
      {render && <RenderView render={render} onClose={close} />}
      {!render && job && <JobView job={job} onClose={close} />}
    </Modal>
  );
}
