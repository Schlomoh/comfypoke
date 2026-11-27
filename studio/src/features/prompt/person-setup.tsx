// A person's setup, folded above their rows so the phrases come first: gender, face photo, their saved character's
// LoRAs, and where they stand when there is more than one. The folded line says what is set.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { useSaved } from "@/data/db/saved";
import { useCatalog } from "@/data/queries";
import { setGender, withPerson } from "@/domain/cast";
import { resolve } from "@/domain/catalog";
import { GENDERS } from "@/domain/presets/gender";
import { SIDES, type Depth, type Person } from "@/domain/recipe";
import { CharacterLoras } from "@/features/prompt/character-loras";
import { FaceRow } from "@/features/prompt/face-row";
import { setupOpenAtom } from "@/features/prompt/state";
import { recipeAtom } from "@/state/studio";
import { Disclosure } from "@/ui/disclosure";
import { Segmented, Toggles } from "@/ui/segmented";
import { Heading, Note } from "@/ui/text";

const DEPTHS: Depth[] = ["auto", "front", "back"];

function Placement({ person }: { person: Person }) {
  const setRecipe = useSetAtom(recipeAtom);
  const set = (change: (p: Person) => Person) => setRecipe((r) => withPerson(r, person.id, change));
  return (
    <div className="flex flex-col gap-1.5">
      <Heading>Side</Heading>
      <Toggles value={person.side} options={SIDES} onChange={(side) => set((p) => ({ ...p, side }))} />
      <Heading>Depth</Heading>
      <Segmented
        value={person.depth}
        options={DEPTHS.map((d) => ({ value: d, label: d }))}
        onChange={(depth) => set((p) => ({ ...p, depth }))}
      />
      <Note>
        {person.side.length ? "Others can share the same spot." : "No side picked: placed anywhere."}
      </Note>
    </div>
  );
}

function GenderPicker({ person }: { person: Person }) {
  const setRecipe = useSetAtom(recipeAtom);
  return (
    <Segmented
      value={person.gender}
      options={GENDERS.map((g) => ({ value: g, label: g }))}
      onChange={(g) => setRecipe((r) => setGender(r, person.id, g))}
    />
  );
}
/** "woman · face photo · 2 LoRAs · left": what the folded setup holds. */
function useSummary(person: Person) {
  const recipe = useAtomValue(recipeAtom);
  const family = resolve(recipe, useCatalog().catalog).family;
  const saved = useSaved().find((s) => s.id === person.savedId);
  const loras = (family && saved?.loras?.[family.id]?.length) || 0;
  const place = [...person.side, person.depth === "auto" ? "" : person.depth].filter(Boolean).join(" ");
  return [
    person.gender,
    person.face ? "face photo" : "no face photo",
    loras ? `${loras} LoRA${loras === 1 ? "" : "s"}` : "",
    recipe.cast.length > 1 ? place || "placed anywhere" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PersonSetup({ person }: { person: Person }) {
  const recipe = useAtomValue(recipeAtom);
  const [open, setOpen] = useAtom(setupOpenAtom);
  return (
    <Disclosure summary={useSummary(person)} open={open} onToggle={setOpen}>
      <GenderPicker person={person} />
      <FaceRow key={person.id} person={person} />
      {person.savedId && <CharacterLoras person={person} />}
      {recipe.cast.length > 1 && <Placement person={person} />}
    </Disclosure>
  );
}
