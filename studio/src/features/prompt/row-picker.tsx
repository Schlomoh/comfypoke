// The picker under a row's sheet: it adds a phrase to the row, or a version to the phrase picked above.
import { useAtom } from "jotai";

import { editPhrase, editRow, isPerson, ownerOf, rowDef, type RowRef } from "@/domain/cast";
import type { Presets } from "@/domain/prompt-catalog";
import { phrase, type Phrase } from "@/domain/recipe";
import { says, sameText } from "@/domain/versions";
import { PresetPicker } from "@/features/prompt/preset-picker";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";

type Props = {
  at: RowRef;
  phrases: Phrase[];
  target: Phrase | undefined;
  presets: Presets;
  onTarget: (target: string | null) => void;
};

export function RowPicker({ at, phrases, target, presets, onTarget }: Props) {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const def = rowDef(at.row);
  const o = ownerOf(recipe, at.key);
  const gender = o && isPerson(o) ? o.gender : "person"; // the scene's presets say no gender

  const add = (t: string) => {
    if (target)
      setRecipe((r) =>
        editPhrase(r, { ...at, id: target.id }, (p) =>
          says(p, t) ? p : { ...p, versions: [...p.versions, t] },
        ),
      );
    else setRecipe((r) => editRow(r, at, (xs) => (xs.some((p) => p.t === t) ? xs : [...xs, phrase(t)])));
  };
  const has = (x: string) =>
    (target ? [target].find((p) => says(p, x)) : phrases.find((p) => sameText(p.t, x)))?.id;

  return (
    <PresetPicker
      row={at.row}
      gender={gender}
      presets={presets}
      has={has}
      onAdd={add}
      placeholder={target ? "or type a version" : `or type one: ${def.hint}`}
      header={
        <>
          <span className="min-w-0 flex-1 truncate">
            {target ? `Adding versions of “${target.t}”` : `Adding to ${def.label}`}
          </span>
          {target && (
            <Button variant="link" size="inline" onClick={() => onTarget(null)}>
              add a phrase instead
            </Button>
          )}
        </>
      }
    />
  );
}
