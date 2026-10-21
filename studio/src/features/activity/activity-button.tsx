// What the studio is doing, always in view: a compact button in the tab row and in the viewer that
// opens the activity sheet.
import { useAtomValue, useSetAtom } from "jotai";

import type { Gpu } from "@/data/api";
import { idlesIn, useGpu } from "@/data/queries";
import { clock } from "@/domain/format";
import { progress, running, status, type Job } from "@/domain/job";
import { LABEL, TONE } from "@/features/activity/gpu-state";
import { useNow } from "@/features/activity/use-now";
import { layerAtom, liveJobsAtom } from "@/state/studio";
import { Pressable } from "@/ui/pressable";
import { Progress } from "@/ui/text";

function labelOf(job: Job | undefined, gpu: Gpu | null) {
  if (!job) return LABEL[gpu?.state ?? "cold"];
  if (job.stage) return status(job);
  return gpu?.booted === false ? "Booting" : "Queued";
}

export function ActivityButton() {
  const handle = useGpu();
  const { gpu } = handle;
  const jobs = useAtomValue(liveJobsAtom);
  const setLayer = useSetAtom(layerAtom);
  const live = jobs.filter(running);
  const failed = jobs.length - live.length;
  const job = live.at(-1); // the oldest: the one the worker is on
  const state = gpu?.state ?? "cold";
  const now = useNow(state === "warm");
  const idles = idlesIn(handle, now);
  const label = labelOf(job, gpu);
  const tone = gpu ? TONE[state] : "text-faint";
  return (
    <Pressable
      onClick={() => setLayer("activity")}
      title="Activity: renders, queue, GPU"
      aria-label={`Activity: ${label}${live.length > 1 ? `, ${live.length - 1} more queued` : ""}${failed ? `, ${failed} failed` : ""}`}
      className="relative flex h-11 max-w-[55%] min-w-0 shrink-0 items-center gap-2 border border-line bg-panel px-2.5 font-mono text-xs tabular-nums hover:border-edge fine:h-8"
    >
      <span aria-hidden className={`size-1.5 shrink-0 bg-current ${tone}`} />
      <span className={`truncate ${job ? "text-ink" : tone}`}>{gpu ? label : "GPU …"}</span>
      {live.length > 1 && <span className="text-faint">+{live.length - 1}</span>}
      {failed > 0 && <span className="text-bad">!{failed}</span>}
      {!job && idles != null && <span className="text-muted">{clock(idles)}</span>}
      {job && <Progress value={progress(job)} />}
    </Pressable>
  );
}
