// The canvas: the render in progress (live preview, step counter, cancel) or a finished one,
// with its settings and actions on one line underneath.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import { useImage, useObjectUrl } from "@/data/db/renders";
import { useGpu } from "@/data/queries";
import { blank } from "@/domain/example";
import { describe } from "@/domain/format";
import { progress, running, status, type Job } from "@/domain/job";
import { size } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { FIT } from "@/domain/view";
import { EditCanvas } from "@/features/edit/edit-canvas";
import { MaskTools } from "@/features/edit/mask-tools";
import { masksAtom, peekAtom } from "@/features/edit/state";
import { useMaskKey } from "@/features/edit/use-mask-key";
import { download } from "@/features/library/files";
import { ImageActions } from "@/features/library/image-actions";
import { ExampleButton } from "@/features/prompt/example-button";
import { CompareBar, CompareGrid, CompareToggle } from "@/features/stage/compare";
import { ZoomBar } from "@/features/stage/zoom-bar";
import { ZoomView } from "@/features/stage/zoom-view";
import { useImageActions } from "@/state/actions";
import { useJobs } from "@/state/jobs";
import {
  batchAtom,
  compareAtom,
  recipeAtom,
  rendersAtom,
  stageAtom,
  stripTab,
  tabAtom,
  viewAtom,
} from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { useWide } from "@/ui/media";
import { Progress } from "@/ui/text";

/** Whether the stage shows the shown render's batch at once: asked for, with a batch, and not while painting. */
function useComparing() {
  const { job, render } = useAtomValue(stageAtom);
  const on = useAtomValue(compareAtom);
  const batch = useAtomValue(batchAtom);
  const tab = useAtomValue(tabAtom);
  const wide = useWide();
  // not while painting, nor in the phone's strip, which has no bar to leave it by
  const away = tab === "edit" || (stripTab(tab) && !wide);
  return !!on && on === render?.batch && !job && batch.length > 0 && !away;
}

/** Seconds since the job started, ticking while it runs. */
function useElapsed(job?: Job) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = !!job && running(job);
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return job ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0;
}

function Canvas({ job, render, loading }: { job?: Job; render?: Render; loading: boolean }) {
  const [view, setView] = useAtom(viewAtom);
  const { open, step } = useImageActions();
  const recipe = useAtomValue(recipeAtom);
  const url = useObjectUrl(useImage(render?.id));
  const tab = useAtomValue(tabAtom);
  const editing = tab === "edit";
  const strip = stripTab(tab);
  // held "before": the image it was made from, with this one's mask over it
  const peekOn = useAtomValue(peekAtom);
  const peek = editing && !!render && peekOn === render.id;
  const before = useObjectUrl(useImage(peek ? render?.source : undefined));
  const comparing = useComparing();
  if (comparing && render) return <CompareGrid shown={render.id} />;
  if (!job && render && url && editing) return <EditCanvas render={render} url={(peek && before) || url} />;
  if (!job && render && url)
    return (
      <ZoomView
        src={url}
        alt={render.prompt}
        view={view}
        setView={setView}
        onSwipe={step}
        onTap={() => open(render.id)}
      />
    );
  const shape = job?.params ?? render ?? size(recipe.aspect, recipe.mp);
  return (
    <div
      className="relative max-h-full max-w-full border border-line bg-panel"
      style={{ aspectRatio: `${shape.width} / ${shape.height}`, height: "100%" }}
    >
      {job?.preview && <img src={job.preview} alt="" className="absolute inset-0 size-full object-cover" />}
      {!job && !render && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-xs text-faint",
            strip && "max-lg:p-2",
          )}
        >
          {loading ? "Opening…" : <Empty strip={strip} />}
        </div>
      )}
      {job && running(job) && <Progress value={progress(job)} className="top-0 bottom-auto" />}
    </div>
  );
}

/** A workspace with nothing yet: with an empty recipe too, one tap fills a first one. */
/** In the phone's strip only the button: the rows under it say the rest. */
function Empty({ strip }: { strip: boolean }) {
  const empty = blank(useAtomValue(recipeAtom));
  return (
    <>
      <p className={cn(strip && "max-lg:hidden")}>
        No renders here yet. Pick a phrase or two in the rows, then Generate.
      </p>
      {empty && <ExampleButton />}
    </>
  );
}

function FailedBar({ job }: { job: Job }) {
  const { dismiss } = useJobs();
  const image = job.image;
  return (
    <>
      <span className="text-bad" role="alert">
        FAILED
      </span>
      <span className="line-clamp-3 min-w-0 flex-1 break-words text-muted">{job.error}</span>
      {image && (
        <Button onClick={() => download(image, `studio-${job.params?.seed ?? job.id}.png`)}>Download</Button>
      )}
      <Button onClick={() => dismiss(job.id)}>Dismiss</Button>
    </>
  );
}

function RunningBar({ job }: { job: Job }) {
  const { cancel } = useJobs();
  const { gpu } = useGpu();
  const elapsed = useElapsed(job);
  return (
    <>
      <span className="text-ink" aria-live="polite">
        {status(job, gpu?.booted)}
      </span>
      <span className="font-mono text-faint tabular-nums" aria-hidden>
        {elapsed}s
      </span>
      <span className="min-w-0 flex-1 truncate text-faint">
        <span className="max-sm:hidden">{job.params && describe(job.params)}</span>
      </span>
      <Button onClick={() => cancel(job.id)}>Cancel</Button>
    </>
  );
}

function RenderBar({ render }: { render: Render }) {
  return (
    <>
      {/* on a phone the settings are in More; the bar keeps room for the buttons */}
      <span className="min-w-0 flex-1 truncate font-mono text-faint max-sm:hidden" title={describe(render)}>
        {render.characterName && <span className="text-muted">{render.characterName} · </span>}
        {describe(render)} · {render.seconds}s
      </span>
      <div className="flex gap-2 max-sm:min-w-0 max-sm:flex-1">
        <ImageActions render={render} fill />
      </div>
    </>
  );
}

function Bar({ job, render, loading }: { job?: Job; render?: Render; loading: boolean }) {
  const editing = useAtomValue(tabAtom) === "edit";
  const key = useMaskKey(render);
  const steps = useAtomValue(masksAtom)[key ?? ""]?.length ?? 0;
  const comparing = useComparing();
  if (comparing) return <CompareBar />;
  if (job?.error) return <FailedBar job={job} />;
  if (job) return <RunningBar job={job} />;
  if (render && editing) return <MaskTools render={render} maskKey={key} steps={steps} />;
  if (render) return <RenderBar render={render} />;
  return <span className="text-faint">{loading ? "" : "Ready"}</span>;
}

export function Stage() {
  const { job, render } = useAtomValue(stageAtom);
  const loading = useAtomValue(rendersAtom) === undefined; // the workspace's renders are still being decrypted
  const tab = useAtomValue(tabAtom);
  const editing = tab === "edit"; // the corner is paint area there
  const strip = stripTab(tab);
  const setView = useSetAtom(viewAtom);
  useEffect(() => {
    // the strip has no zoom bar: a zoom set in another tab would crop it with no way back
    if (strip && !matchMedia("(min-width: 1024px)").matches) setView(FIT);
  }, [strip, setView]);
  const comparing = useComparing();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#111113_0_25%,#0d0d0f_0_50%)] bg-[length:16px_16px] p-3 lg:p-6",
          strip && "max-lg:p-1.5",
        )}
      >
        <Canvas job={job} render={render} loading={loading} />
        {/* the framing sits on the canvas, out of the bar's way */}
        {render && !job && !editing && !comparing && (
          <div
            className={cn(
              "absolute top-1 right-1 z-10 flex [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]",
              strip && "max-lg:hidden",
            )}
          >
            <CompareToggle />
            <ZoomBar />
          </div>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-12 [scrollbar-width:none] items-center gap-2 overflow-x-auto border-t border-line bg-panel px-3 py-1 font-mono text-xs",
          strip && !job && "max-lg:hidden",
        )}
      >
        <Bar job={job} render={render} loading={loading} />
      </div>
    </div>
  );
}
