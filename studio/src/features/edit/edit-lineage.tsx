// The top of the Edit panel: the image on the stage in its lineage. The chain back to the original, where a tap edits
// that one instead; then what is being made from this image and what was, newest first. A tap on an image edits it; a
// job still on its way opens the viewer to watch it.
import { useAtomValue, useSetAtom } from "jotai";

import { progress, running, type Job } from "@/domain/job";
import { lineage } from "@/domain/lineage";
import type { Render } from "@/domain/render";
import { Step } from "@/features/viewer/lineage-strip";
import { focusAtom, liveJobsAtom, rendersAtom, viewerAtom } from "@/state/studio";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";
import { Section } from "@/ui/section";
import { Progress } from "@/ui/text";

function JobStep({ job, onOpen }: { job: Job; onOpen: () => void }) {
  return (
    <Pressable
      onClick={onOpen}
      title={job.error ?? "on its way"}
      className={cn("relative size-12 shrink-0 border bg-panel", job.error ? "border-bad" : "border-line")}
    >
      {job.preview && <img src={job.preview} alt="" className="size-full object-cover" />}
      {running(job) && <Progress value={progress(job)} className="top-auto bottom-0" />}
      <span className="absolute inset-x-0 top-0 truncate bg-bg/80 px-0.5 font-mono text-[9px] leading-3 text-ink">
        {job.error ? "failed" : "…"}
      </span>
    </Pressable>
  );
}

export function EditLineage({ render }: { render: Render }) {
  const all = useAtomValue(rendersAtom) ?? [];
  const jobs = useAtomValue(liveJobsAtom).filter((j) => j.source === render.id && !j.saved);
  const setFocus = useSetAtom(focusAtom);
  const setViewer = useSetAtom(viewerAtom);
  const { chain, children, cut } = lineage(all, render.id);
  const made = children.toReversed();
  if (chain.length < 2 && !made.length && !jobs.length) return null;
  return (
    <Section
      title="Lineage"
      tip="Where this image came from, and what was made from it. A tap on any of them edits that one instead. One still on its way opens full screen to watch."
    >
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
        {cut && <span className="shrink-0 font-mono text-[10px] text-faint">…</span>}
        {chain.map((r, i) => (
          <div key={r.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <span className="text-faint" aria-hidden>
                →
              </span>
            )}
            <Step
              r={r}
              current={r.id === render.id}
              branches={all.filter((x) => x.source === r.id).length}
              onOpen={() => setFocus(r.id)}
            />
          </div>
        ))}
        {(jobs.length > 0 || made.length > 0) && (
          <span className="shrink-0 text-faint" aria-hidden>
            ⇉
          </span>
        )}
        {jobs.map((j) => (
          <JobStep key={j.id} job={j} onOpen={() => setViewer(j.id)} />
        ))}
        {made.map((r) => (
          <Step key={r.id} r={r} current={false} onOpen={() => setFocus(r.id)} />
        ))}
      </div>
    </Section>
  );
}
