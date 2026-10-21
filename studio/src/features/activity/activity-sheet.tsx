// The sheet the activity button opens: every job in flight, the GPU's controls and the workspace.
import { useAtom, useAtomValue } from "jotai";

import { useSpace } from "@/data/db/space";
import { useWorkspace } from "@/data/db/workspaces";
import { useGpu } from "@/data/queries";
import { describe } from "@/domain/format";
import { isUpscale, progress, running, status, type Job } from "@/domain/job";
import { GpuPanel } from "@/features/activity/gpu-panel";
import { useNow } from "@/features/activity/use-now";
import { useImageActions } from "@/state/actions";
import { useJobs } from "@/state/jobs";
import { layerAtom, liveJobsAtom, veilAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Sheet } from "@/ui/modal";
import { Pressable } from "@/ui/pressable";
import { Heading, Note, Progress } from "@/ui/text";

function what(j: Job) {
  if (!j.params) return "";
  return isUpscale(j) ? `upscale to ${j.params.width}×${j.params.height}` : describe(j.params);
}

function QueueItem({ job: j, now, onShow }: { job: Job; now: number; onShow: (id: string) => void }) {
  const { gpu } = useGpu();
  const { cancel, dismiss } = useJobs();
  return (
    <div className="flex items-start gap-3 border-b border-line pb-2">
      <Pressable
        onClick={() => onShow(j.id)}
        className="relative size-12 shrink-0 overflow-hidden border border-line bg-bg"
        aria-label="Show it"
      >
        {j.preview && <img src={j.preview} alt="" className="size-full object-cover" />}
        {!j.error && <Progress value={progress(j)} />}
      </Pressable>
      <Pressable
        onClick={() => onShow(j.id)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 font-mono text-xs"
      >
        {j.error ? (
          <span className="break-words text-bad">Failed: {j.error}</span>
        ) : (
          <span className="text-ink tabular-nums">
            {status(j, gpu?.booted)}{" "}
            <span className="text-faint">{Math.max(0, Math.round((now - j.startedAt) / 1000))}s</span>
          </span>
        )}
        <span className="truncate text-faint">{what(j)}</span>
      </Pressable>
      {j.error ? (
        <Button onClick={() => dismiss(j.id)}>Dismiss</Button>
      ) : (
        <Button onClick={() => cancel(j.id)}>Cancel</Button>
      )}
    </div>
  );
}

export function ActivitySheet() {
  const [layer, setLayer] = useAtom(layerAtom);
  const jobs = useAtomValue(liveJobsAtom);
  const [veil, setVeil] = useAtom(veilAtom);
  const workspace = useWorkspace(useSpace().id);
  const { open: show } = useImageActions();
  const open = layer === "activity";
  const now = useNow(open && jobs.some(running));
  const onShow = (id: string) => {
    setLayer(null);
    show(id);
  };

  return (
    <Sheet open={open} onClose={() => setLayer(null)} title="Activity">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <Heading>Queue</Heading>
          {jobs.length === 0 && <Note mono>Nothing running.</Note>}
          {jobs.map((j) => (
            <QueueItem key={j.id} job={j} now={now} onShow={onShow} />
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <Heading>GPU worker</Heading>
          {/* the sheet renders its body only while open: an armed force stop never outlives it */}
          <GpuPanel />
        </section>

        <section className="flex flex-col gap-2">
          <Heading>Workspace</Heading>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {workspace?.name}
              {workspace?.lock ? <span className="text-faint"> · protected</span> : null}
            </span>
            <Button onClick={() => setLayer("workspace")}>Switch…</Button>
          </div>
          <Checkbox
            on={veil}
            onChange={setVeil}
            label={<span className="text-xs text-muted">Hide all images (H)</span>}
          />
        </section>
      </div>
    </Sheet>
  );
}
