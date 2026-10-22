// The ⋯ menu of a tab: its name, the saved character (or scene) it is linked to, and the other saved
// ones to use instead. Every change goes through the recipe as it is at that moment.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { putSaved, useSaved } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { isPlaceholder, kindOf, linkState, ownerOf, renameOwner, toEntry, type Key } from "@/domain/cast";
import { LinkActions } from "@/features/prompt/link-actions";
import { SavedList } from "@/features/prompt/saved-list";
import { castTabAtom, openAtom } from "@/features/prompt/state";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input, Labeled } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { notify } from "@/ui/notify";
import { Note } from "@/ui/text";

export function LinkSheet() {
  const [open, setOpen] = useAtom(openAtom);
  const recipe = useAtomValue(recipeAtom);
  const key = open?.kind === "link" ? open.key : null;
  const owner = key ? ownerOf(recipe, key) : undefined;
  const close = () => setOpen(null);
  return (
    <Sheet open={!!owner} onClose={close} title={key === "scene" ? "Scene" : "Person in this picture"}>
      {key && owner && <Link key={key} tab={key} onClose={close} />}
    </Sheet>
  );
}

const what = (key: Key) => (kindOf(key) === "person" ? "character" : "scene");

/** Mounted per tab, so a half-typed new name or an error never shows up on another one. */
function Link({ tab, onClose }: { tab: Key; onClose: () => void }) {
  const space = useSpace();
  const saved = useSaved();
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const setTab = useSetAtom(castTabAtom);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const o = ownerOf(recipe, tab);
  if (!o) return null;
  const kind = kindOf(tab);
  const link = linkState(kind, o, saved);
  const list = saved.filter((x) => x.kind === kind);

  const saveNew = async (n: string) => {
    if (!n || (kind === "person" && isPlaceholder(n)))
      return setError(`Give the ${what(tab)} a name first${naming ? "" : ", in the Name field above"}.`);
    if (list.some((x) => x.name === n))
      return setError(`A saved ${what(tab)} is already called “${n}”. Pick another name.`);
    const entry = toEntry(kind, { ...o, name: n });
    await putSaved(space, entry);
    setRecipe((r) => renameOwner(r, tab, n, entry.id));
    setNaming(false);
    setError("");
    notify(`Saved the ${what(tab)} “${n}”`);
  };

  const removePerson = () => {
    const at = recipe.cast.findIndex((c) => c.id === tab);
    const person = recipe.cast[at];
    setRecipe((r) => ({ ...r, cast: r.cast.filter((c) => c.id !== tab) }));
    setTab(recipe.cast[at === 0 ? 1 : at - 1].id);
    onClose();
    notify(`Removed ${person.name} from this picture`, {
      action: {
        label: "Undo",
        run: () =>
          setRecipe((r) =>
            r.cast.some((c) => c.id === tab)
              ? r
              : { ...r, cast: [...r.cast.slice(0, at), person, ...r.cast.slice(at)] },
          ),
      },
    });
  };

  return (
    <>
      <Labeled label="Name">
        <Input
          value={o.name}
          onChange={(e) => {
            const value = e.target.value;
            setRecipe((r) => renameOwner(r, tab, value));
            setError("");
          }}
          onBlur={(e) =>
            !e.target.value.trim() &&
            setRecipe((r) => renameOwner(r, tab, link.s?.name ?? (kind === "person" ? "Person" : "")))
          }
          placeholder={kind === "scene" ? "name this scene" : "name"}
          className="fine:h-9"
        />
      </Labeled>
      <p className="font-mono text-xs text-muted">
        {link.s ? (
          <>
            <b className="font-medium text-ink">
              Saved {what(tab)} “{link.s.name}”
            </b>{" "}
            · {link.changed ? `changed: ${link.diff.join(", ")}` : "no changes"}
          </>
        ) : (
          <>
            <b className="font-medium text-ink">New</b> · not saved as a {what(tab)}
          </>
        )}
      </p>
      {!link.s || naming ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => (e.preventDefault(), void saveNew((naming ? name : o.name).trim()))}
        >
          {naming && (
            <Input
              autoFocus
              value={name}
              onChange={(e) => (setName(e.target.value), setError(""))}
              placeholder={`name the new ${what(tab)}`}
              className="flex-1 fine:h-9"
            />
          )}
          <Button type="submit" className={naming ? undefined : "flex-1"}>
            {naming
              ? "Save new"
              : `Save ${what(tab)}${kind === "person" && !isPlaceholder(o.name) ? ` “${o.name}”` : ""}`}
          </Button>
        </form>
      ) : (
        link.changed && (
          <LinkActions
            tab={tab}
            saved={link.s}
            list={list}
            onError={setError}
            onSaveAsNew={() => (setNaming(true), setName(""))}
          />
        )
      )}
      {error && <Note tone="bad">{error}</Note>}
      <Note>
        {kind === "person"
          ? "A saved character keeps Who, Look, Wearing and Doing, with versions and switched-off phrases. Side and depth stay with this picture; LoRAs stay in the Model tab."
          : "A saved scene keeps Where, Shot, Style and Extra, with versions and switched-off phrases. People are saved on their own."}{" "}
        Names never go into the prompt.
      </Note>
      <SavedList tab={tab} linked={link.s} unsaved={!link.s || link.changed} list={list} onUsed={onClose} />
      {kind === "person" && recipe.cast.length > 1 && (
        <Button variant="danger" onClick={removePerson}>
          Remove {o.name} from this picture
        </Button>
      )}
    </>
  );
}
