// What the studio is doing, always in view: a compact button in the tab row and in the viewer, and
// the sheet it opens with every job in flight, the GPU's controls and the workspace.
import { useEffect, useRef } from "react";
import { clock, GpuPanel, idlesIn, LABEL, TONE, useNow, type GpuHandle } from "./gpu";
import type { Job } from "./jobs";
import { describe, progress, status } from "./stage";
import { Btn, Check } from "./ui";

const running = (j: Job) => !j.error;
const what = (j: Job) =>
  !j.params ? "" : j.params.family === "seedvr2" ? `upscale to ${j.params.width}×${j.params.height}` : describe(j.params);

export function ActivityButton({ gpu, jobs, onOpen }: { gpu: GpuHandle; jobs: Job[]; onOpen: () => void }) {
  const live = jobs.filter(running);
  const failed = jobs.length - live.length;
  const job = live.at(-1); // the oldest: the one the worker is on
  const state = gpu.gpu?.state ?? "cold";
  const now = useNow(state === "warm");
  const idles = idlesIn(gpu, now);
  const label = job ? (job.stage ? status(job) : gpu.gpu?.booted === false ? "Booting" : "Queued") : LABEL[state];
  return (
    <button
      onClick={onOpen}
      title="Activity: renders, queue, GPU"
      aria-label={`Activity: ${label}${live.length > 1 ? `, ${live.length - 1} more queued` : ""}${failed ? `, ${failed} failed` : ""}`}
      className="relative flex h-11 max-w-[55%] min-w-0 shrink-0 items-center gap-2 border border-line bg-panel px-2.5 font-mono text-xs tabular-nums hover:border-edge fine:h-8"
    >
      <span aria-hidden className={`size-1.5 shrink-0 bg-current ${gpu.gpu ? TONE[state] : "text-faint"}`} />
      <span className={`truncate ${job ? "text-ink" : gpu.gpu ? TONE[state] : "text-faint"}`}>{gpu.gpu ? label : "GPU …"}</span>
      {live.length > 1 && <span className="text-faint">+{live.length - 1}</span>}
      {failed > 0 && <span className="text-bad">!{failed}</span>}
      {!job && idles != null && <span className="text-muted">{clock(idles)}</span>}
      {job && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
          <span className="block h-full bg-ink transition-[width] duration-300" style={{ width: `${100 * progress(job)}%` }} />
        </span>
      )}
    </button>
  );
}

export function ActivitySheet({ open, onClose, gpu, jobs, onShow, onCancel, onDismiss, workspace, onWorkspace, veil, setVeil }: {
  open: boolean;
  onClose: () => void;
  gpu: GpuHandle;
  jobs: Job[];
  onShow: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  workspace?: { name: string; lock?: unknown };
  onWorkspace: () => void;
  veil: boolean;
  setVeil: (on: boolean) => void;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const now = useNow(open && jobs.some(running));
  useEffect(() => {
    const d = sheet.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={sheet}
      aria-labelledby="activity-title"
      onClose={onClose}
      onClick={(e) => e.target === sheet.current && onClose()}
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-screen max-w-none overscroll-contain border-t border-line bg-panel p-0 text-ink lg:m-auto lg:w-[28rem] lg:border"
    >
      <div className="flex flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <h2 id="activity-title" className="label flex-1">Activity</h2>
          <Btn onClick={onClose}>Done</Btn>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="label">Queue</h3>
          {jobs.length === 0 && <p className="font-mono text-xs text-faint">Nothing running.</p>}
          {jobs.map((j) => (
            <div key={j.id} className="flex items-start gap-3 border-b border-line pb-2">
              <button onClick={() => onShow(j.id)} className="relative size-12 shrink-0 overflow-hidden border border-line bg-bg" aria-label="Show it">
                {j.preview && <img src={j.preview} alt="" className="size-full object-cover" />}
                {!j.error && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
                    <span className="block h-full bg-ink" style={{ width: `${100 * progress(j)}%` }} />
                  </span>
                )}
              </button>
              <button onClick={() => onShow(j.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left font-mono text-xs">
                {j.error ? (
                  <span className="break-words text-bad">Failed: {j.error}</span>
                ) : (
                  <span className="text-ink tabular-nums">
                    {status(j, gpu.gpu?.booted)} <span className="text-faint">{Math.max(0, Math.round((now - j.startedAt) / 1000))}s</span>
                  </span>
                )}
                <span className="truncate text-faint">{what(j)}</span>
              </button>
              {j.error ? <Btn onClick={() => onDismiss(j.id)}>Dismiss</Btn> : <Btn onClick={() => onCancel(j.id)}>Cancel</Btn>}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="label">GPU worker</h3>
          {open && <GpuPanel {...gpu} />}{/* mounted while open: an armed force stop never outlives the sheet */}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="label">Workspace</h3>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {workspace?.name}
              {workspace?.lock ? <span className="text-faint"> · protected</span> : null}
            </span>
            <Btn onClick={onWorkspace}>Switch…</Btn>
          </div>
          <Check on={veil} onChange={setVeil} label={<span className="text-xs text-muted">Hide all images (H)</span>} />
        </section>
      </div>
    </dialog>
  );
}
