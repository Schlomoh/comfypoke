// The upscale settings: used for every new render when Auto is on, and by Upscale in the library.
import { useAtomValue, useSetAtom } from "jotai";

import { UPSCALE_MEGAPIXELS } from "@/data/api";
import type { UpscaleSettings } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { SliderRow } from "@/ui/slider";

export function UpscaleSection({ className }: { className?: string }) {
  const u = useAtomValue(recipeAtom).upscale;
  const setRecipe = useSetAtom(recipeAtom);
  const put = (patch: Partial<UpscaleSettings>) =>
    setRecipe((r) => ({ ...r, upscale: { ...r.upscale, ...patch } }));
  return (
    <Section
      title="Upscale"
      className={className}
      tip={
        <>
          SeedVR2 restores detail at {u.megapixels} MP{u.megapixels === 4 ? " (2048 square)" : ""}. With a
          touch-up, the image&apos;s own model first redraws it lightly at its size, the words added to its
          prompt; more strength changes more. The upscale is a new image linked to its source. Also from the
          library: select images, then Upscale.
        </>
      }
    >
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
        <SliderRow
          label="Strength"
          min={0.05}
          max={0.8}
          step={0.05}
          value={u.denoise}
          onValue={(denoise) => put({ denoise })}
        />
      )}
    </Section>
  );
}
