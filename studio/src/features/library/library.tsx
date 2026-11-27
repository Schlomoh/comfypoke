// Everything rendered in this workspace, filterable by the Best mark, character and tags, with a
// selection mode for working on many at once (best, tag, upscale, download, delete). Its header names the
// workspace (switch, rename, hide images) and opens Export: what is shown as files or a zip, and the backup.
import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";

import { addPhoto } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { useWorkspace } from "@/data/db/workspaces";
import { errorText } from "@/domain/format";
import type { LibraryFilter } from "@/domain/library-filter";
import type { Render } from "@/domain/render";
import { ExportSheet } from "@/features/library/export-sheet";
import { FilterBar } from "@/features/library/filter-bar";
import { SelectionBar } from "@/features/library/selection-bar";
import { StackGrid } from "@/features/library/stack-grid";
import { Pending } from "@/features/library/thumb";
import { useExport } from "@/features/library/use-export";
import { useImageActions } from "@/state/actions";
import {
  focusAtom,
  layerAtom,
  libraryFilterAtom,
  liveJobsAtom,
  shownAtom,
  visibleStacksAtom,
  stageAtom,
  viewerAtom,
} from "@/state/studio";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";

function emptyText(f: LibraryFilter) {
  if (f.tags.length) return "Nothing here carries every picked tag.";
  if (f.best) return "Nothing marked best here. Press B or ★ on an image to mark it.";
  return "Nothing here yet. Renders, and photos you add to edit or dress, are kept on this device only.";
}

/** column: the desktop's right column, beside the stage. A tap there only puts an image on the stage, and the job on the stage is not listed again. */
export function Library({ column = false }: { column?: boolean }) {
  const shown = useAtomValue(shownAtom);
  const covers = useAtomValue(visibleStacksAtom).map((s) => s.cover);
  const filter = useAtomValue(libraryFilterAtom);
  const live = useAtomValue(liveJobsAtom);
  const stage = useAtomValue(stageAtom);
  const setFocus = useSetAtom(focusAtom);
  const { open } = useImageActions();
  const [picked, setPicked] = useState<Set<string> | null>(null); // null: not selecting
  const chosen = picked ? shown.filter((r) => picked.has(r.id)) : [];
  const target = picked ? chosen : shown; // Download works on the selection while there is one
  const out = useExport(target, !!picked);
  const space = useSpace();
  const file = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const workspace = useWorkspace(space.id);
  const setLayer = useSetAtom(layerAtom);

  const jobs = column ? live.filter((j) => j !== stage.job) : live;
  const focus = (stage.job ?? stage.render)?.id ?? null;
  const setViewer = useSetAtom(viewerAtom);
  // a job goes on the stage and full screen; on a phone a finished image only opens full screen, so
  // the stage still shows what it showed when the viewer closes
  const show = column ? setFocus : open;
  const showImage = column ? setFocus : setViewer;

  /** A photo from the device joins the library as an image to repaint or dress, and opens. */
  const upload = async (f: File) => {
    try {
      showImage((await addPhoto(space, f)).id);
    } catch (e) {
      notify(`Could not read that photo: ${errorText(e)}`, { bad: true });
    }
  };

  const toggle = (r: Render) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(r.id)) next.add(r.id);
      return next;
    });

  return (
    <div className="flex flex-col">
      {/* two rows on purpose: what it is and what to do on top, the filters below, so nothing wraps when the list
          grows a scrollbar */}
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            className="min-w-0 flex-1 justify-start px-0 text-[13px] text-ink"
            onClick={() => setLayer("workspace")}
            title="This workspace: switch, rename, hide images"
          >
            <span className="truncate">{workspace?.name ?? "Workspace"}</span>
            <span className="text-faint tabular-nums">{shown.length}</span>
            <span aria-hidden className="text-faint">
              ▾
            </span>
          </Button>
          <Button onClick={() => setExporting(true)} title="Download images, back up or restore">
            Export…
          </Button>
          <Button onClick={() => file.current?.click()} title="Add a photo from this device to edit or dress">
            Photo
          </Button>
          <Input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <Button
            onClick={() => setPicked(picked ? null : new Set())}
            aria-pressed={!!picked}
            disabled={!shown.length}
          >
            {picked ? "Done" : "Select"}
          </Button>
        </div>
        <FilterBar />
      </div>
      {picked ? (
        <SelectionBar visible={covers} chosen={chosen} setPicked={setPicked} out={out} />
      ) : (
        <p className="hidden border-b border-line px-4 py-2 font-mono text-[10.5px] text-faint [@media(pointer:fine)]:block">
          ← → browse · F full screen · B best · press ? for all keys
        </p>
      )}
      {jobs.length + shown.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-faint">{emptyText(filter)}</p>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-line p-px sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
          {!picked && jobs.map((j) => <Pending key={j.id} job={j} active={j.id === focus} onFocus={show} />)}
          <StackGrid focus={focus} picked={picked} onSelect={picked ? toggle : (x) => showImage(x.id)} />
        </div>
      )}
      <ExportSheet
        open={exporting}
        onClose={() => setExporting(false)}
        count={target.length}
        selected={!!picked}
        out={out}
      />
    </div>
  );
}
