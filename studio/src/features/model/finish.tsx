// A second pass over every new render with a saved setup: Z-Image's composition with Krea's skin and light, say.
// Light by default, so the picture stays and only its look changes. Recorded on each render.
import { useAtom } from "jotai";

import { useSetups } from "@/data/db/setups";
import { recipeAtom } from "@/state/studio";
import { Select } from "@/ui/field";
import { Section } from "@/ui/section";
import { SliderRow } from "@/ui/slider";
import { Note } from "@/ui/text";

export function FinishSection() {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const setups = useSetups();
  const f = recipe.finish;
  const shown = f && setups.some((s) => s.id === f.setup) ? f.setup : "off"; // a removed setup reads as none
  return (
    <Section title="Finish">
      <Select
        aria-label="Finish every render with"
        value={shown}
        onChange={(e) => {
          const setup = e.target.value;
          setRecipe((r) => ({
            ...r,
            finish: setup === "off" ? null : { setup, strength: r.finish?.strength ?? 0.35 },
          }));
        }}
      >
        <option value="off">no finish</option>
        {setups.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.loras.length ? ` + ${s.loras.length} LoRA` : ""}
          </option>
        ))}
      </Select>
      {f && shown !== "off" && (
        <SliderRow
          label="Strength"
          min={0.1}
          max={0.8}
          step={0.05}
          value={f.strength}
          onValue={(strength) => setRecipe((r) => ({ ...r, finish: r.finish && { ...r.finish, strength } }))}
        />
      )}
      <Note>
        Goes over each new render once more with another setup, lightly: the picture stays, its look takes on
        that model's. A face photo is then put on with the finish's model, so it needs Krea 2 there.
      </Note>
    </Section>
  );
}
