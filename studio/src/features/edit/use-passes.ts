// What a pass of an edit can run with, and what each choice is: the Model tab as it is now, the image's own model
// (not for a photo from the device, which has none), or a saved setup.
import { useAtomValue } from "jotai";

import { useSetups } from "@/data/db/setups";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import type { Render } from "@/domain/render";
import { passOf, setupOf, toPass, type Pass } from "@/domain/setup";
import type { PassChoice } from "@/features/edit/state";
import { recipeAtom } from "@/state/studio";

export type Picked = { pass: Pass; name: string };
const loras = (p: Pass) => (p.loras.length ? ` + ${p.loras.length} LoRA` : "");

export function usePasses(render: Render | undefined) {
  const recipe = useAtomValue(recipeAtom);
  const { catalog } = useCatalog();
  const setups = useSetups();
  const family = resolve(recipe, catalog).family?.id;
  const tab = family ? toPass(setupOf(recipe, family, "")) : null;
  const own = render && !render.uploaded ? passOf(render) : null;

  const pick = (choice: PassChoice): Picked | null => {
    if (choice === "tab") return tab && { pass: tab, name: "the Model tab" };
    if (choice === "own") return own && { pass: own, name: "the image's model" };
    const s = setups.find((x) => x.id === choice);
    return s ? { pass: toPass(s), name: s.name } : null;
  };

  /** The choices for a pass, those of one family only when it needs that. */
  const options = (only?: string) => [
    ...(own && (!only || own.family === only)
      ? [{ value: "own", label: `this image's · ${shortName(own.unet)}${loras(own)}` }]
      : []),
    ...(tab && (!only || tab.family === only)
      ? [{ value: "tab", label: `Model tab · ${shortName(tab.unet)}${loras(tab)}` }]
      : []),
    ...setups
      .filter((s) => !only || s.family === only)
      .map((s) => ({ value: s.id, label: `${s.name}${loras(s)}` })),
  ];

  /** A choice as it can be made here: one no longer offered (a photo's own model, a removed setup) falls to the first. */
  const choose = (choice: PassChoice, only?: string) => {
    const opts = options(only);
    const value = opts.some((o) => o.value === choice) ? choice : (opts[0]?.value ?? "");
    return { value, opts, picked: pick(value) };
  };

  return { choose };
}
