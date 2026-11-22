// What can be done to the selected images at once: best, pick among them, upscale, save or zip, a lookbook, delete.
import { useAtomValue, useSetAtom } from "jotai";

import { updateRender } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { errorText } from "@/domain/format";
import type { Recipe } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { download } from "@/features/library/files";
import { LOOKBOOK_MAX, lookbook } from "@/features/library/lookbook";
import type { Export } from "@/features/library/use-export";
import { useImageActions } from "@/state/actions";
import { pickAtom, recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";
import { Note } from "@/ui/text";

const upscaleLabel = ({ upscale: { megapixels, prompt } }: Recipe) =>
  `Upscale to ${megapixels} MP${prompt.trim() ? `, touch-up "${prompt.trim()}"` : ""}, set in the dock`;

export function SelectionBar({
  visible,
  chosen,
  setPicked,
  out,
}: {
  visible: Render[]; // what "all" selects: the covers on screen, not the images inside closed or folded stacks
  chosen: Render[];
  setPicked: (p: Set<string> | null) => void;
  out: Export;
}) {
  const space = useSpace();
  const { upscaleMany, removeMany } = useImageActions();
  const label = upscaleLabel(useAtomValue(recipeAtom));
  const none = !chosen.length;
  const setPick = useSetAtom(pickAtom);

  const bulkBest = async () => {
    const on = chosen.some((r) => !r.best); // mixed or none: mark all; all marked: unmark all
    for (const r of chosen)
      await updateRender(space, r.id, (s) => ({ ...s, best: on, passed: on ? undefined : s.passed }));
    notify(`${on ? "Marked" : "Unmarked"} ${chosen.length} as best`);
  };

  const book = async () => {
    try {
      const png = await lookbook(space, chosen);
      download(png, `lookbook-${new Date().toISOString().slice(0, 10)}.png`);
      if (chosen.length > LOOKBOOK_MAX) notify(`The lookbook holds the first ${LOOKBOOK_MAX}`);
    } catch (e) {
      notify(`Could not make the lookbook: ${errorText(e)}`, { bad: true });
    }
  };

  return (
    <div className="sticky top-[calc(5.75rem+env(safe-area-inset-top))] z-10 flex flex-col gap-2 border-b border-line bg-panel px-4 py-3 lg:top-0">
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="flex-1 text-ink tabular-nums">{chosen.length} selected</span>
        <Button variant="quiet" size="inline" onClick={() => setPicked(new Set(visible.map((r) => r.id)))}>
          all {visible.length}
        </Button>
        <Button variant="quiet" size="inline" onClick={() => setPicked(new Set())}>
          none
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
        <Button onClick={() => void bulkBest()} disabled={none} title="Mark or unmark as best">
          ★
        </Button>
        <Button
          onClick={() => {
            setPick(chosen.map((r) => r.id));
            setPicked(null);
          }}
          disabled={chosen.length < 2}
          title="Pick the best of these, two at a time"
        >
          Pick
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
          onClick={() => void book()}
          disabled={none}
          title="One PNG of the selected images, each captioned: to share or print"
        >
          Lookbook
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
