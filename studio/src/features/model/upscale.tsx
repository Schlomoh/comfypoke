// The upscale settings: used for every new render when Auto is on, and by Upscale in the library.
import { useAtomValue, useSetAtom } from "jotai";

import { UPSCALE_MEGAPIXELS } from "@/data/api";
import type { UpscaleSettings } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Slider } from "@/ui/slider";
import { Note } from "@/ui/text";

export function UpscaleSection() {
  const u = useAtomValue(recipeAtom).upscale;
  const setRecipe = useSetAtom(recipeAtom);
  const put = (patch: Partial<UpscaleSettings>) =>
    setRecipe((r) => ({ ...r, upscale: { ...r.upscale, ...patch } }));
  return (
    <Section title="Upscale">
      <Checkbox
        on={u.auto}
        onChange={(auto) => put({ auto })}
        label={<span className="text-[13px]">Upscale every new render right away</span>}
      />
      <Segmented
        value={u.megapixels}
        options={UPSCALE_MEGAPIXELS.map((m) => ({ value: m, label: `${m} MP` }))}
        onChange={(megapixels) => put({ megapixels })}
      />
      <Textarea
        value={u.prompt}
        onChange={(e) => put({ prompt: e.target.value })}
        placeholder="touch-up, optional: sharper eyes, cleaner skin"
      />
      {u.prompt.trim() && (
        <label className="flex items-center gap-3">
          <span className="w-16 label">Strength</span>
          <Slider
            min={0.05}
            max={0.8}
            step={0.05}
            value={u.denoise}
            onValue={(denoise) => put({ denoise })}
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums">{u.denoise.toFixed(2)}</span>
        </label>
      )}
      <Note>
        SeedVR2 restores detail at {u.megapixels} MP{u.megapixels === 4 ? " (2048 square)" : ""}. With a
        touch-up, the image's own model first redraws it lightly at its size, the words added to its prompt;
        more strength changes more. The upscale is a new image linked to its source. Also from the library:
        select images, then Upscale.
      </Note>
    </Section>
  );
}
