// A linked tab that changed since it was saved: update the saved one, drop the changes, or save it as a new one.
import { useAtom } from "jotai";

import { putSaved } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { adoptSaved, kindOf, ownerOf, replaceOwner, toEntry, type Key } from "@/domain/cast";
import type { Saved } from "@/domain/saved";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";

export function LinkActions({
  tab,
  saved: s,
  list,
  onError,
  onSaveAsNew,
}: {
  tab: Key;
  saved: Saved;
  list: Saved[];
  onError: (e: string) => void;
  onSaveAsNew: () => void;
}) {
  const space = useSpace();
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const o = ownerOf(recipe, tab);
  if (!o) return null;
  const kind = kindOf(tab);
  const what = kind === "person" ? "character" : "scene";

  const update = async () => {
    if (list.some((x) => x.id !== s.id && x.name === o.name))
      return onError(`Another saved ${what} is already called “${o.name}”.`);
    await putSaved(space, toEntry(kind, o, s));
    notify(`Updated “${o.name}”`, { action: { label: "Undo", run: () => void putSaved(space, s) } });
  };

  const discard = () => {
    setRecipe((r) => replaceOwner(r, tab, adoptSaved(o, kind, s)));
    notify("Changes discarded", {
      action: { label: "Undo", run: () => setRecipe((r) => replaceOwner(r, tab, o)) },
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void update()}>
          {s.name === o.name ? `Update “${s.name}”` : `Update and rename to “${o.name}”`}
        </Button>
        <Button onClick={discard}>Discard changes</Button>
      </div>
      <Button variant="link" size="inline" onClick={onSaveAsNew} className="self-start">
        or save as a new {what}…
      </Button>
    </div>
  );
}
