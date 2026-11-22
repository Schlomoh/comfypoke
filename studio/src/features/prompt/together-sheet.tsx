// What the people in the picture do with each other: one card per interaction, each from one person to
// another, and a picker that adds a new one between the pair at its top, or versions of the one picked.
import { useAtom } from "jotai";
import { useState } from "react";

import { usePresets } from "@/data/db/presets";
import { partnerOf, sayTogether, togetherLens } from "@/domain/cast";
import { onto } from "@/domain/compose";
import { phrase, type Interaction, type Recipe } from "@/domain/recipe";
import { says } from "@/domain/versions";
import { PhraseCard } from "@/features/prompt/phrase-card";
import { PresetPicker } from "@/features/prompt/preset-picker";
import { openAtom } from "@/features/prompt/state";
import { useClearEmptied } from "@/features/prompt/use-clear-emptied";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { Note } from "@/ui/text";

type Pair = { from: string; to: string };

/** Who does it to whom; picking the other one's person swaps them, so nobody does it to themself. */
function PairPicker({ recipe, pair, onPair }: { recipe: Recipe; pair: Pair; onPair: (p: Pair) => void }) {
  const pick = (side: keyof Pair, id: string) => {
    const other = side === "from" ? "to" : "from";
    onPair({ ...pair, [side]: id, ...(pair[other] === id ? { [other]: pair[side] } : {}) });
  };
  const select = (side: keyof Pair, label: string) => (
    <Select size="sm" aria-label={label} value={pair[side]} onChange={(e) => pick(side, e.target.value)}>
      {recipe.cast.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-ink">
      {select("from", "Who does it")}
      <span aria-hidden>→</span>
      {select("to", "To whom")}
    </span>
  );
}

export function TogetherSheet() {
  const [open, setOpen] = useAtom(openAtom);
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const presets = usePresets();
  const clearEmptied = useClearEmptied();
  const first = recipe.cast[0]?.id ?? "";
  const [pair, setPair] = useState<Pair>({ from: first, to: partnerOf(recipe, first) });

  const shown = open?.kind === "together" && recipe.cast.length > 1 ? open : null;
  const ids = new Set(recipe.cast.map((c) => c.id));
  const items = recipe.together.filter((i) => ids.has(i.from) && ids.has(i.to));
  const target = items.find((i) => i.id === shown?.target);
  // a pair whose person was removed, or picked while there was only one, starts over from the first two
  const valid = ids.has(pair.from) && ids.has(pair.to) && pair.from !== pair.to;
  const at = valid ? pair : { from: first, to: partnerOf(recipe, first) };
  const close = () => {
    clearEmptied(togetherLens);
    setOpen(null);
  };
  const onTarget = (t: string | null) => setOpen((o) => (o?.kind === "together" ? { ...o, target: t } : o));
  const edit = (change: (xs: Interaction[]) => Interaction[]) =>
    setRecipe((r) => togetherLens.edit(r, change));

  const has = (x: Interaction, t: string) => x.from === at.from && x.to === at.to && x.t === t;
  const add = (t: string) => {
    if (target)
      edit((xs) =>
        xs.map((x) => (x.id !== target.id || says(x, t) ? x : { ...x, versions: [...x.versions, t] })),
      );
    else edit((xs) => (xs.some((x) => has(x, t)) ? xs : [...xs, { ...phrase(t), ...at }]));
  };
  const added = (t: string) => {
    if (!target) return items.find((x) => has(x, t))?.id;
    return says(target, t) ? target.id : undefined;
  };
  const gender = recipe.cast.find((c) => c.id === at.from)?.gender ?? "person";
  const other = recipe.cast.find((c) => c.id === (target?.to ?? at.to))?.name ?? "";

  return (
    <Sheet
      open={!!shown}
      onClose={close}
      title="Together"
      footer={
        shown &&
        presets && (
          <PresetPicker
            key={target?.id ?? "new"}
            row="together"
            gender={gender}
            presets={presets}
            has={added}
            onAdd={add}
            display={(t) => onto(t, other)}
            placeholder={target ? "or type a version" : "or type one: what one does with the other"}
            header={
              target ? (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    Adding versions of “{sayTogether(recipe, target)}”
                  </span>
                  <Button variant="link" size="inline" onClick={() => onTarget(null)}>
                    add one instead
                  </Button>
                </>
              ) : (
                <PairPicker recipe={recipe} pair={at} onPair={setPair} />
              )
            }
          />
        )
      }
    >
      {shown && items.length === 0 && (
        <Note>Nobody does anything together yet. Pick who does it to whom below, then what.</Note>
      )}
      {shown &&
        items.map((i) => (
          <PhraseCard
            key={i.id}
            lens={togetherLens}
            phrase={i}
            index={recipe.together.indexOf(i)}
            picked={i.id === shown.target}
            onPick={onTarget}
          >
            <div className="px-3 pt-2">
              <PairPicker
                recipe={recipe}
                pair={i}
                onPair={(p) => edit((xs) => xs.map((x) => (x.id === i.id ? { ...x, ...p } : x)))}
              />
            </div>
          </PhraseCard>
        ))}
    </Sheet>
  );
}
