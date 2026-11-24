// The face pass after each render: the face found, redrawn at 1024 by the render's own model and LoRAs, and blended
// back, so a small face in a full-body shot gets the detail and likeness a close-up would. Recorded on each render.
import { useAtom } from "jotai";

import { FACE_PASS } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Section } from "@/ui/section";
import { SliderRow } from "@/ui/slider";

export function FacePassSection({ className }: { className?: string }) {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const strength = recipe.facePass;
  return (
    <Section
      title="Face"
      className={className}
      tip="Redraws the face at full resolution after each render, with the same model, prompt and LoRAs, lightly: a small face gets the detail of a close-up. Only for a picture of one person, and skipped when a face photo is on, since the head swap redraws the head already."
    >
      <Checkbox
        on={strength !== null}
        onChange={(on) => setRecipe((r) => ({ ...r, facePass: on ? FACE_PASS.default : null }))}
        label="Redraw the face after each render"
      />
      {strength !== null && (
        <SliderRow
          label="Strength"
          min={FACE_PASS.min}
          max={FACE_PASS.max}
          step={0.05}
          value={strength}
          onValue={(facePass) => setRecipe((r) => ({ ...r, facePass }))}
        />
      )}
    </Section>
  );
}
