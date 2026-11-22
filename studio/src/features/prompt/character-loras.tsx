// A saved character's own LoRAs, one list per model family: they join the stack whenever the character is in the
// cast and that family runs (domain/loras.ts), and their trigger words go into the character's description.
// Kept with the saved character, so every picture with them gets them.
import { useAtomValue, useSetAtom } from "jotai";

import { updateSaved, useSaved } from "@/data/db/saved";
import { useSpace, type Space } from "@/data/db/space";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import type { Person } from "@/domain/recipe";
import type { CharacterLora } from "@/domain/saved";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { Heading, Note } from "@/ui/text";
import { Tip } from "@/ui/tip";

/** The family's list changed by `change`, applied to what is stored. */
const saveLoras = (space: Space, id: string, family: string, change: (list: CharacterLora[]) => CharacterLora[]) =>
  updateSaved(space, id, (s) => ({
    ...s,
    loras: { ...s.loras, [family]: change(s.loras?.[family] ?? []) },
    updatedAt: Date.now(),
  }));

export function CharacterLoras({ person }: { person: Person }) {
  const space = useSpace();
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const saved = useSaved().find((s) => s.id === person.savedId);
  const family = resolve(recipe, catalog).family;
  if (!saved || !family) return null;
  const own = saved.loras?.[family.id] ?? [];
  const elsewhere = Object.entries(saved.loras ?? {}).filter(([f, ls]) => f !== family.id && ls.length);

  const write = (change: (list: CharacterLora[]) => CharacterLora[]) => void saveLoras(space, saved.id, family.id, change);
  const setStrength = (name: string, strength: number) => {
    write((list) => list.map((x) => (x.name === name ? { ...x, strength } : x)));
    // the stack follows a strength set here; a LoRA added or removed is synced by state/recipe.ts
    setRecipe((r) => ({
      ...r,
      loras: r.loras.map((l) => (l.from === saved.id && l.name === name ? { ...l, strength } : l)),
    }));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Heading>LoRAs on {family.label}</Heading>
        <Tip label="About a character's LoRAs">
          {`LoRAs kept with ${saved.name}, one list per model family. They join the stack in Look whenever ${saved.name} is in the picture and that family runs, and their trigger words open ${saved.name}'s description, so two characters each keep their own.`}
        </Tip>
      </div>
      {own.map((l) => (
        <div key={l.name} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={l.name}>
            {shortName(l.name)}
          </span>
          <Input
            size="sm"
            mono
            inputMode="decimal"
            aria-label={`${shortName(l.name)} strength`}
            defaultValue={l.strength}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== l.strength) setStrength(l.name, Math.max(-8, Math.min(8, v)));
            }}
            className="w-16 text-right"
          />
          <Button variant="text" onClick={() => write((list) => list.filter((x) => x.name !== l.name))}>
            remove
          </Button>
        </div>
      ))}
      <Select
        value=""
        aria-label={`Add a LoRA to ${saved.name} for ${family.label}`}
        onChange={(e) => {
          const name = e.target.value;
          if (name) write((list) => (list.some((x) => x.name === name) ? list : [...list, { name, strength: 1 }]));
        }}
        className="text-muted"
      >
        <option value="">+ LoRA for {saved.name}</option>
        {catalog.loras
          .filter((n) => !own.some((l) => l.name === n))
          .map((n) => (
            <option key={n} value={n}>
              {shortName(n)}
            </option>
          ))}
      </Select>
      {elsewhere.length > 0 && (
        <Note>
          {elsewhere
            .map(
              ([f, ls]) =>
                `${catalog.families.find((x) => x.id === f)?.label ?? f}: ${ls.map((l) => shortName(l.name)).join(", ")}`,
            )
            .join(" · ")}
        </Note>
      )}
    </div>
  );
}
