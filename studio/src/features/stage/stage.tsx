// The canvas: the render in progress (live preview, step counter, cancel) or a finished one,
// with its settings and actions on one line underneath.
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { useImage, useObjectUrl } from "@/data/db/renders";
import { useGpu } from "@/data/queries";
import { describe } from "@/domain/format";
import { progress, running, status, type Job } from "@/domain/job";
import { size } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { EditCanvas } from "@/features/edit/edit-canvas";
import { MaskTools } from "@/features/edit/mask-tools";
import { masksAtom } from "@/features/edit/state";
import { download } from "@/features/library/files";
import { ImageActions } from "@/features/library/image-actions";
import { ZoomBar } from "@/features/stage/zoom-bar";
import { ZoomView } from "@/features/stage/zoom-view";
import { useImageActions } from "@/state/actions";
import { useJobs } from "@/state/jobs";
import { recipeAtom, rendersAtom, stageAtom, tabAtom, viewAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Progress } from "@/ui/text";

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
  const editing = useAtomValue(tabAtom) === "edit";
  if (!job && render && url && editing) return <EditCanvas render={render} url={url} />;
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
        <div className="absolute inset-0 grid place-items-center p-6 text-center font-mono text-xs text-faint">
          {loading ? "Opening…" : "No renders in this workspace yet. Fill in a block and press Generate."}
        </div>
      )}
      {job && running(job) && <Progress value={progress(job)} className="top-0 bottom-auto" />}
    </div>
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
      <span className="text-faint tabular-nums" aria-hidden>
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
      <span className="min-w-0 flex-1 truncate text-faint max-sm:hidden" title={describe(render)}>
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
  const steps = useAtomValue(masksAtom)[render?.id ?? ""]?.length ?? 0;
  if (job?.error) return <FailedBar job={job} />;
  if (job) return <RunningBar job={job} />;
  if (render && editing) return <MaskTools id={render.id} steps={steps} />;
  if (render) return <RenderBar render={render} />;
  return <span className="text-faint">{loading ? "" : "Ready"}</span>;
}

export function Stage() {
  const { job, render } = useAtomValue(stageAtom);
  const loading = useAtomValue(rendersAtom) === undefined; // the workspace's renders are still being decrypted
  const editing = useAtomValue(tabAtom) === "edit"; // the corner is paint area there
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#111113_0_25%,#0d0d0f_0_50%)] bg-[length:16px_16px] p-3 lg:p-6">
        <Canvas job={job} render={render} loading={loading} />
        {/* the framing sits on the canvas, out of the bar's way */}
        {render && !job && !editing && (
          <div className="absolute top-1 right-1 z-10 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
            <ZoomBar />
          </div>
        )}
      </div>
      <div className="flex min-h-12 [scrollbar-width:none] items-center gap-2 overflow-x-auto border-t border-line bg-panel px-3 py-1 font-mono text-xs">
        <Bar job={job} render={render} loading={loading} />
      </div>
    </div>
  );
}
