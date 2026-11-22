// The picture's size: its aspect and how many megapixels.
import { useAtomValue, useSetAtom } from "jotai";

import { ASPECTS, MEGAPIXELS, size } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Note } from "@/ui/text";

export function SizeSection({ className }: { className?: string }) {
  const { aspect, mp } = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const px = size(aspect, mp);
  return (
    <Section
      title="Size"
      className={className}
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
        <Note tone="warn">
          Past the 1 MP these models were trained at: expect repeated subjects or stretched bodies, and slower
          renders.
        </Note>
      )}
    </Section>
  );
}
