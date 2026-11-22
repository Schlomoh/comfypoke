// Saved model setups: the model, family, steps, CFG and LoRAs below under a name. A tap puts one back here; the
// Edit tab offers them per pass (dress, finish, repaint).
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { deleteSetup, restoreSetup, saveSetup, useSetups } from "@/data/db/setups";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import type { Recipe } from "@/domain/recipe";
import { applySetup, BUILT_IN, setupOf, type Setup } from "@/domain/setup";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

const isBuiltIn = (s: Setup) => BUILT_IN.some((b) => b.id === s.id);

/** Whether the Model tab is this setup right now. */
const isCurrent = (s: Setup, r: Recipe, family: string | undefined) =>
  s.unet === r.unet && s.family === family && s.steps === r.steps && s.cfg === r.cfg;

const remove = (s: Setup) => {
  void deleteSetup(s.id);
  notify(`Removed the setup “${s.name}”`, { action: { label: "Undo", run: () => void restoreSetup(s) } });
};

/** The Model tab as it is, saved under a name: here and in the Edit tab, beside the passes that use setups. */
export function SaveSetup({ placeholder = "name what is set below, to save it" }: { placeholder?: string }) {
  const recipe = useAtomValue(recipeAtom);
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const family = resolve(recipe, catalog).family?.id;
  const save = () => {
    const n = name.trim();
    if (!n || !family) return;
    void saveSetup(setupOf(recipe, family, n));
    setName("");
    notify(`Saved the setup “${n}”`);
  };
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input
        className="min-w-0 flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
      />
      <Button type="submit" disabled={!name.trim()}>
        Save
      </Button>
    </form>
  );
}

export function SetupsSection() {
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const setups = useSetups();
  const [removing, setRemoving] = useState(false);
  const family = resolve(recipe, catalog).family?.id;
  const suggested = (unet: string) => catalog.models.find((m) => m.file === unet)?.family;
  const mine = setups.filter((s) => !isBuiltIn(s));

  return (
    <Section
      title="Setups"
      right={
        mine.length > 0 && (
          <Button variant="link" size="inline" onClick={() => setRemoving(!removing)}>
            {removing ? "done" : "remove some"}
          </Button>
        )
      }
    >
      <ChipRow>
        {(removing ? mine : setups).map((s) =>
          removing ? (
            <Chip key={s.id} tone="removing" onClick={() => remove(s)}>
              {s.name} ×
            </Chip>
          ) : (
            <Chip
              key={s.id}
              tone={isCurrent(s, recipe, family) ? "picked" : "quiet"}
              title={`${shortName(s.unet)}${s.loras.length ? ` + ${s.loras.length} LoRA` : ""}`}
              onClick={() => setRecipe((r) => applySetup(r, s, suggested(s.unet)))}
            >
              {s.name}
            </Chip>
          ),
        )}
      </ChipRow>
      <SaveSetup />
      <Note>
        A setup is the model, family, steps, CFG and the LoRAs switched on. The Edit tab offers them for each
        pass: the dress, its finish, a repaint. Shared by all workspaces, like presets.
      </Note>
    </Section>
  );
}
