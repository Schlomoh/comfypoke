// Everything rendered in this workspace, filterable by character and by the Best mark, with a
// selection mode for working on many at once (best, upscale, download, delete), the download of
// what is shown (into a folder, or as a zip), and the library backup (characters, presets and
// LoRA notes as one JSON file).
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import type { Render } from "@/domain/render";
import { BackupSection } from "@/features/library/backup-section";
import { DownloadSection } from "@/features/library/download-section";
import { SelectionBar } from "@/features/library/selection-bar";
import { Pending, Thumb } from "@/features/library/thumb";
import { useExport } from "@/features/library/use-export";
import { useImageActions } from "@/state/actions";
import {
  bestCountAtom,
  bestOnlyAtom,
  characterFilterAtom,
  characterNamesAtom,
  focusAtom,
  libraryFilterAtom,
  liveJobsAtom,
  shownAtom,
  stageAtom,
  viewerAtom,
} from "@/state/studio";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { Segmented } from "@/ui/segmented";
import { Heading } from "@/ui/text";

/** column: the desktop's right column, beside the stage. A tap there only puts an image on the stage, and the job on the stage is not listed again. */
export function Library({ column = false }: { column?: boolean }) {
  const shown = useAtomValue(shownAtom);
  const names = useAtomValue(characterNamesAtom);
  const filter = useAtomValue(libraryFilterAtom);
  const setFilter = useSetAtom(characterFilterAtom);
  const [best, setBest] = useAtom(bestOnlyAtom);
  const bestCount = useAtomValue(bestCountAtom);
  const live = useAtomValue(liveJobsAtom);
  const stage = useAtomValue(stageAtom);
  const setFocus = useSetAtom(focusAtom);
  const { open } = useImageActions();
  const [picked, setPicked] = useState<Set<string> | null>(null); // null: not selecting
  const chosen = picked ? shown.filter((r) => picked.has(r.id)) : [];
  const target = picked ? chosen : shown; // Download works on the selection while there is one
  const out = useExport(target, !!picked);

  const jobs = column ? live.filter((j) => j !== stage.job) : live;
  const focus = (stage.job ?? stage.render)?.id ?? null;
  const setViewer = useSetAtom(viewerAtom);
  // a job goes on the stage and full screen; on a phone a finished image only opens full screen, so
  // the stage still shows what it showed when the viewer closes
  const show = column ? setFocus : open;
  const showImage = column ? setFocus : setViewer;

  const toggle = (r: Render) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(r.id)) next.add(r.id);
      return next;
    });

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Heading className="flex-1 whitespace-nowrap">Library · {shown.length}</Heading>
        <Segmented
          value={best ? "best" : "all"}
          options={[
            { value: "all", label: "All" },
            { value: "best", label: `★ ${bestCount}` },
          ]}
          onChange={(v) => setBest(v === "best")}
          className="w-28"
        />
        {names.length > 0 && (
          <Select
            value={filter.character}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Character"
            className="max-w-40"
          >
            <option value="">All characters</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
        <Button
          onClick={() => setPicked(picked ? null : new Set())}
          aria-pressed={!!picked}
          disabled={!shown.length}
        >
          {picked ? "Done" : "Select"}
        </Button>
      </div>
      {picked ? (
        <SelectionBar shown={shown} chosen={chosen} setPicked={setPicked} out={out} />
      ) : (
        <p className="hidden border-b border-line px-4 py-2 font-mono text-[10.5px] text-faint [@media(pointer:fine)]:block">
          ← → browse · F full screen · B best · press ? for all keys
        </p>
      )}
      {jobs.length + shown.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-faint">
          {best
            ? "Nothing marked best here. Press B or ★ on an image to mark it."
            : "Nothing here yet. Renders are kept on this device only."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-line p-px sm:grid-cols-4 lg:grid-cols-2">
          {!picked && jobs.map((j) => <Pending key={j.id} job={j} active={j.id === focus} onFocus={show} />)}
          {shown.map((r) => (
            <Thumb
              key={r.id}
              render={r}
              active={r.id === focus}
              selected={picked ? picked.has(r.id) : undefined}
              onSelect={picked ? toggle : (x) => showImage(x.id)}
            />
          ))}
        </div>
      )}
      <DownloadSection count={target.length} selected={!!picked} out={out} />
      <BackupSection />
    </div>
  );
}
