// The picture's size, its seed, and how many seeds each version renders with.
import { useAtomValue, useSetAtom } from "jotai";

import { randomSeed } from "@/domain/batch";
import { ASPECTS, MEGAPIXELS, size } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Note } from "@/ui/text";

const SEED_MODES = [
  { value: "random", label: "Random" },
  { value: "fixed", label: "Fixed" },
] as const;

export function SizeSection() {
  const { aspect, mp } = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const px = size(aspect, mp);
  return (
    <Section
      title="Size"
      right={
        <span className="font-mono text-xs text-faint tabular-nums">
          {px.width}×{px.height}
        </span>
      }
    >
      <Segmented
        value={aspect}
        options={ASPECTS.map((a) => ({ value: a.label, label: a.label }))}
        onChange={(v) => setRecipe((r) => ({ ...r, aspect: v }))}
      />
      <Segmented
        value={mp}
        options={MEGAPIXELS.map((m) => ({ value: m, label: `${m} MP` }))}
        onChange={(v) => setRecipe((r) => ({ ...r, mp: v }))}
      />
      {mp > 1 && (
        <Note>
          Past the 1 MP these models were trained at: expect repeated subjects or stretched bodies, and slower
          renders.
        </Note>
      )}
    </Section>
  );
}

export function SeedSection() {
  const { seed, count } = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  return (
    <>
      <Section title="Seed">
        <div className="flex gap-2">
          <Segmented
            className="w-40"
            value={seed == null ? "random" : "fixed"}
            options={SEED_MODES}
            onChange={(v) => setRecipe((r) => ({ ...r, seed: v === "random" ? null : randomSeed() }))}
          />
          {seed != null && (
            <>
              <Input
                mono
                inputMode="numeric"
                value={seed}
                onChange={(e) => {
                  const typed = Number(e.target.value.replace(/\D/g, "")) || 0;
                  setRecipe((r) => ({ ...r, seed: typed }));
                }}
                className="flex-1"
              />
              <Button onClick={() => setRecipe((r) => ({ ...r, seed: randomSeed() }))} title="New seed">
                New
              </Button>
            </>
          )}
        </div>
        {seed != null && count > 1 && <Note>A batch counts up from this seed.</Note>}
      </Section>
      <Section title="Seeds">
        <Segmented
          value={count}
          options={[1, 2, 3, 4].map((n) => ({ value: n, label: `×${n}` }))}
          onChange={(v) => setRecipe((r) => ({ ...r, count: v }))}
        />
        <Note>Each version of the prompt renders once per seed.</Note>
      </Section>
    </>
  );
}
