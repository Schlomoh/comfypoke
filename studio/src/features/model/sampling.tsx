// Steps and CFG by hand; empty falls back to the model's defaults.
import { useAtomValue, useSetAtom } from "jotai";

import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input, Labeled } from "@/ui/field";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

// Empty, zero or nonsense means "the default", the same rule the server applies to a missing value.
const num = (v: string, whole = false) => {
  const n = whole ? Math.round(Number(v)) : Number(v);
  return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n;
};

export function SamplingSection() {
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { defaults } = resolve(recipe, useCatalog().catalog);
  return (
    <Section
      title="Sampling"
      right={
        (recipe.steps != null || recipe.cfg != null) && (
          <Button variant="text" onClick={() => setRecipe((r) => ({ ...r, steps: null, cfg: null }))}>
            reset
          </Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Steps">
          <Input
            mono
            inputMode="numeric"
            value={recipe.steps ?? ""}
            placeholder={String(defaults?.steps ?? "")}
            onChange={(e) => {
              const steps = num(e.target.value, true);
              setRecipe((r) => ({ ...r, steps }));
            }}
          />
        </Labeled>
        <Labeled label="CFG">
          <Input
            mono
            inputMode="decimal"
            value={recipe.cfg ?? ""}
            placeholder={String(defaults?.cfg ?? "")}
            onChange={(e) => {
              const cfg = num(e.target.value);
              setRecipe((r) => ({ ...r, cfg }));
            }}
          />
        </Labeled>
      </div>
      <Note>Empty uses the model's default.</Note>
    </Section>
  );
}
