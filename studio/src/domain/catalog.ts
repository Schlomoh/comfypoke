// What is on the volume, and what a recipe resolves to against it.
import type { Recipe } from "@/domain/recipe";

export type Model = { file: string; family: string; verified: boolean; steps: number; cfg: number };
export type Family = { id: string; label: string; steps: number; cfg: number };
export type Catalog = { models: Model[]; families: Family[]; loras: string[] };

/** What will actually be sent: the family the person picked or the one suggested, and its defaults. */
export function resolve(recipe: Recipe, catalog: Catalog) {
  const model = catalog.models.find((m) => m.file === recipe.unet);
  const family = catalog.families.find((f) => f.id === (recipe.family ?? model?.family ?? "krea2"));
  // a verified model's own settings apply only in the family it was verified in
  const defaults = model && family && model.family === family.id ? model : family;
  const steps = recipe.steps ?? defaults?.steps ?? 8;
  const cfg = recipe.cfg ?? defaults?.cfg ?? 1;
  return { model, family, defaults, steps, cfg, negative: cfg > 1 };
}
