// What can be done to the selected images at once: best, upscale, save or zip, delete.
import { useAtomValue } from "jotai";

import { updateRender } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import type { Recipe } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import type { Export } from "@/features/library/use-export";
import { useImageActions } from "@/state/actions";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";
import { Note } from "@/ui/text";

const upscaleLabel = ({ upscale: { megapixels, prompt } }: Recipe) =>
  `Upscale to ${megapixels} MP${prompt.trim() ? `, touch-up "${prompt.trim()}"` : ""}, set in the Model tab`;

export function SelectionBar({
  shown,
  chosen,
  setPicked,
  out,
}: {
  shown: Render[];
  chosen: Render[];
  setPicked: (p: Set<string> | null) => void;
  out: Export;
}) {
  const space = useSpace();
  const { upscaleMany, removeMany } = useImageActions();
  const label = upscaleLabel(useAtomValue(recipeAtom));
  const none = !chosen.length;

  const bulkBest = async () => {
    const on = chosen.some((r) => !r.best); // mixed or none: mark all; all marked: unmark all
    for (const r of chosen) await updateRender(space, r.id, (s) => ({ ...s, best: on }));
    notify(`${on ? "Marked" : "Unmarked"} ${chosen.length} as best`);
  };

  return (
    <div className="sticky top-[calc(5.75rem+env(safe-area-inset-top))] z-10 flex flex-col gap-2 border-b border-line bg-panel px-4 py-3 lg:top-0">
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="flex-1 text-ink tabular-nums">{chosen.length} selected</span>
        <Button variant="quiet" size="inline" onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
          all {shown.length}
        </Button>
        <Button variant="quiet" size="inline" onClick={() => setPicked(new Set())}>
          none
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Button onClick={() => void bulkBest()} disabled={none} title="Mark or unmark as best">
          ★
        </Button>
        <Button
          onClick={() => {
            void upscaleMany(chosen);
            setPicked(null);
          }}
          disabled={none}
          title={label}
        >
          Upscale
        </Button>
        <Button
          onClick={() => void (out.folder ? out.saveAll() : out.downloadAll())}
          disabled={none || out.zipping != null || out.saving != null}
        >
          {out.folder ? "Save" : "Zip"}
        </Button>
        <Button
          variant="danger"
          onClick={() => void removeMany(chosen).then((gone) => gone && setPicked(null))}
          disabled={none}
        >
          Delete
        </Button>
      </div>
      <Note>{label}. Deleting also removes upscales made from the selected images.</Note>
    </div>
  );
}
