// The canvas: the render in progress (live preview, step counter, cancel) or a finished one,
// with its settings and actions on one line underneath.
import { useEffect, useState } from "react";
import { useImage, useSpace, type Render } from "./db";
import type { Job } from "./jobs";
import { BestBtn, deleteRender, download, saveImage } from "./library";
import { Btn } from "./ui";
import { ZoomBar, ZoomView, type View } from "./zoom";

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function status(job: Job, booted?: boolean) {
  switch (job.stage) {
    case "loading":
      return "Loading model";
    case "encoding":
      return "Encoding prompt";
    case "sampling":
      return job.steps ? `Step ${job.step}/${job.steps}` : "Sampling";
    case "decoding":
      return "Decoding";
    default:
      return booted === false ? "Booting GPU, up to 2 min" : "Queued";
  }
}

export function progress(job: Job) {
  if (job.stage === "decoding") return 1;
  return job.steps ? job.step / job.steps : 0;
}

export const shortName = (file: string) => file.replace(/\.safetensors$/, "");

// unet, steps and cfg are missing on renders saved before the model panel existed
export const describe = (p: { unet?: string; model?: string; width: number; height: number; seed: number; steps?: number; cfg?: number }) =>
  [p.unet ? shortName(p.unet) : p.model, `${p.width}×${p.height}`, p.steps && `${p.steps} st`, p.cfg && `cfg ${p.cfg}`, `seed ${p.seed}`].filter(Boolean).join(" · ");

type Props = {
  job?: Job;
  render?: Render;
  aspect: { width: number; height: number };
  booted?: boolean;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpen: (r: Render) => void;
  onReuse: (r: Render) => void;
  view: View;
  setView: (v: View) => void;
  onStep: (dir: 1 | -1) => void;
};

export function Stage({ job, render, aspect, booted, onCancel, onDismiss, onOpen, onReuse, view, setView, onStep }: Props) {
  const space = useSpace();
  const url = useObjectUrl(useImage(render?.id));
  const [now, setNow] = useState(Date.now());
  const running = !!job && !job.error;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const size = job?.params ?? render ?? aspect;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#111113_0_25%,#0d0d0f_0_50%)] bg-[length:16px_16px] p-3 lg:p-6">
        {!job && render && url ? (
          <ZoomView src={url} alt={render.prompt} view={view} setView={setView} onSwipe={onStep} onTap={() => onOpen(render)} />
        ) : (
        <div
          className="relative max-h-full max-w-full border border-line bg-panel"
          style={{ aspectRatio: `${size.width} / ${size.height}`, height: "100%" }}
        >
          {job?.preview && <img src={job.preview} alt="" className="absolute inset-0 size-full object-cover" />}
          {!job && !render && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center font-mono text-xs text-faint">
              No renders in this workspace yet
            </div>
          )}
          {running && (
            <div className="absolute inset-x-0 top-0 h-0.5 bg-line">
              <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${100 * progress(job)}%` }} />
            </div>
          )}
        </div>
        )}
      </div>
      <div className="flex min-h-12 items-center gap-2 border-t border-line bg-panel px-3 font-mono text-xs">
        {job?.error ? (
          <>
            <span className="text-bad">FAILED</span>
            <span className="min-w-0 flex-1 truncate text-muted" title={job.error}>{job.error}</span>
            {job.image && (
              <Btn onClick={() => download(job.image!, `studio-${job.params?.seed ?? job.id}.png`)}>Download</Btn>
            )}
            <Btn onClick={() => onDismiss(job.id)}>Dismiss</Btn>
          </>
        ) : job ? (
          <>
            <span className="text-ink">{status(job, booted)}</span>
            <span className="text-faint tabular-nums">{Math.max(0, Math.round((now - job.startedAt) / 1000))}s</span>
            <span className="min-w-0 flex-1 truncate text-faint">{job.params && describe(job.params)}</span>
            <Btn onClick={() => onCancel(job.id)}>Cancel</Btn>
          </>
        ) : render ? (
          <>
            <div className="hidden sm:block">
              <ZoomBar view={view} setView={setView} />
            </div>
            <span className="min-w-0 flex-1 truncate text-faint" title={describe(render)}>
              {render.characterName && <span className="text-muted">{render.characterName} · </span>}
              {describe(render)} · {render.seconds}s
            </span>
            <Btn onClick={() => onReuse(render)} title="Load these settings">Reuse</Btn>
            <BestBtn render={render} />
            <Btn onClick={() => saveImage(space, render)}>Save</Btn>
            <Btn variant="danger" onClick={() => deleteRender(render)} className="hidden sm:inline-flex">Delete</Btn>
          </>
        ) : (
          <span className="text-faint">Ready</span>
        )}
      </div>
    </div>
  );
}
