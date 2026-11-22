// Which saved setup the recipe is right now, or which it was changed from: for the Look tab's head and the dock's
// setup chip, which must say the same.
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";

import { saveSetup, useSetups } from "@/data/db/setups";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import type { Recipe } from "@/domain/recipe";
import { applySetup, BUILT_IN, setupOf, type Setup } from "@/domain/setup";
import { recipeAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

export const isBuiltIn = (s: Setup) => BUILT_IN.some((b) => b.id === s.id);

/** Whether the recipe is this setup right now, LoRAs included. */
const isCurrent = (s: Setup, r: Recipe, family: string | undefined) => {
  const on = r.loras.filter((l) => l.on && !l.from); // a character's LoRAs are not the setup's
  return (
    s.unet === r.unet &&
    s.family === family &&
    s.steps === r.steps &&
    s.cfg === r.cfg &&
    s.loras.length === on.length &&
    s.loras.every((l, i) => l.name === on[i].name && l.strength === on[i].strength)
  );
};

/** The setup last applied, for "changed from" and Update. */
const appliedAtom = atom<string | null>(null);

export function useSetup() {
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const setups = useSetups();
  const [applied, setApplied] = useAtom(appliedAtom);
  const family = resolve(recipe, catalog).family?.id;
  const matches = setups.filter((s) => isCurrent(s, recipe, family));
  const current = matches.find((s) => s.id === applied) ?? matches[0]; // the one picked, when two are alike
  const from = current ? undefined : setups.find((s) => s.id === applied);
  return {
    setups,
    current,
    from,
    isOn: (s: Setup) => isCurrent(s, recipe, family),
    apply: (s: Setup) => {
      setRecipe((r) => applySetup(r, s, catalog.models.find((m) => m.file === s.unet)?.family));
      setApplied(s.id);
    },
    update: (s: Setup) => {
      if (!family) return;
      void saveSetup({ ...setupOf(recipe, family, s.name), id: s.id });
      notify(`Updated the setup “${s.name}”`);
    },
  };
}
