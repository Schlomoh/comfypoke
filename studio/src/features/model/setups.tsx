// Saving Look as it is under a name, from the Edit tab. The Look tab manages looks in look-sheet.tsx.
import { useAtomValue } from "jotai";
import { useState } from "react";

import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { setupOf } from "@/domain/setup";
import { useSetup } from "@/features/model/use-setup";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Note } from "@/ui/text";

/** Look as it is, saved under a name, from the Edit tab beside the passes that use looks. */
export function SaveSetup({ placeholder = "name what is set below, to save it" }: { placeholder?: string }) {
  const recipe = useAtomValue(recipeAtom);
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { saved, taken } = useSetup();
  const family = resolve(recipe, catalog).family?.id;
  const save = () => {
    const n = name.trim();
    if (!n || !family) return;
    if (taken(n)) return setError(`A look is already called “${n}”. Pick another name.`);
    saved(setupOf(recipe, family, n));
    setName("");
    notify(`Saved the look “${n}”`);
  };
  return (
    <>
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
          onChange={(e) => (setName(e.target.value), setError(""))}
          placeholder={placeholder}
        />
        <Button type="submit" disabled={!name.trim()}>
          Save
        </Button>
      </form>
      {error && <Note tone="bad">{error}</Note>}
    </>
  );
}
