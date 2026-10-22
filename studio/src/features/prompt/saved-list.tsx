// The other saved characters (or scenes): use one in this tab, or delete it.
import { useAtom } from "jotai";

import { deleteSaved, putSaved } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { adoptSaved, kindOf, ownerOf, replaceOwner, type Key } from "@/domain/cast";
import type { Saved } from "@/domain/saved";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";
import { Pressable } from "@/ui/pressable";
import { Heading, Note } from "@/ui/text";

export function SavedList({
  tab,
  linked,
  unsaved,
  list,
  onUsed,
}: {
  tab: Key;
  linked: Saved | undefined;
  unsaved: boolean; // the tab has edits a switch would replace
  list: Saved[];
  onUsed: () => void;
}) {
  const space = useSpace();
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const o = ownerOf(recipe, tab);
  if (!o) return null;
  const kind = kindOf(tab);
  const what = kind === "person" ? "character" : "scene";
  const others = list.filter((x) => x.id !== linked?.id);
  const inUse = (x: Saved) =>
    kind === "person" && recipe.cast.some((c) => c.id !== tab && c.savedId === x.id);
  const label = kind === "person" ? o.name : "This scene";

  const use = (x: Saved) => {
    setRecipe((r) => replaceOwner(r, tab, adoptSaved(o, kind, x)));
    onUsed();
    notify(kind === "person" ? `${o.name} is now ${x.name}` : `Using the scene “${x.name}”`, {
      action: { label: "Undo", run: () => setRecipe((r) => replaceOwner(r, tab, o)) },
    });
  };

  const remove = (x: Saved) => {
    void deleteSaved(x.id);
    notify(`Deleted the saved ${what} “${x.name}”`, {
      action: { label: "Undo", run: () => void putSaved(space, x) },
    });
  };

  return (
    <>
      <Heading>Saved {what}s</Heading>
      {others.length === 0 ? (
        <Note>No other saved {what}s yet.</Note>
      ) : (
        <>
          {unsaved && (
            <Note tone="muted" className="border-l-2 border-edge pl-2">
              {label}'s edits are not saved. Using a saved {what} replaces them; Undo brings them back.
            </Note>
          )}
          <div className="flex flex-col">
            {others.map((x) => (
              <div key={x.id} className="flex items-center border-b border-line">
                <Pressable
                  disabled={inUse(x)}
                  onClick={() => use(x)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-2 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 break-words">{x.name}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {inUse(x) ? "in this picture" : "use here"}
                  </span>
                </Pressable>
                <Button
                  variant="icon"
                  size="square"
                  onClick={() => remove(x)}
                  aria-label={`Delete the saved ${what} ${x.name}`}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Note>
            {kind === "person"
              ? `Using one here: ${o.name} becomes that character, name and rows. Side and depth stay.`
              : "Using one here replaces Where, Shot, Style and Extra."}
          </Note>
        </>
      )}
    </>
  );
}
