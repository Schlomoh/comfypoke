// The LoRA stack, in the order it runs: drag a row by its handle to change it. Each row says whose it is (the
// look's, or a saved character's in the cast) and a tap on that gives it to another (lora-row.tsx). A LoRA made for
// another model family stays listed, greyed and skipped when sent.
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { useLoraNotes } from "@/data/db/presets";
import { useSaved } from "@/data/db/saved";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import { fits, moved } from "@/domain/loras";
import type { StackLora } from "@/domain/recipe";
import { LoraRow, type Owner } from "@/features/model/lora-row";
import { useGiveLora } from "@/state/recipe";
import { recipeAtom } from "@/state/studio";
import { Select } from "@/ui/field";
import { useReorder } from "@/ui/reorder";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

const keyOf = (l: StackLora) => `${l.from ?? ""}:${l.name}`;

export function Loras() {
  const recipe = useAtomValue(recipeAtom);
  const loras = recipe.loras;
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const family = resolve(recipe, catalog).family?.id;
  const notes = useLoraNotes();
  const saved = useSaved();
  const give = useGiveLora();
  const [open, setOpen] = useState<string | null>(null);
  const nameOf = (id: string) => saved.find((s) => s.id === id)?.name ?? "a character";
  const owners: Owner[] = [
    { id: undefined, name: "Look" },
    // saved characters in the cast: one deleted meanwhile can't take a LoRA
    ...saved
      .filter((s) => recipe.cast.some((p) => p.savedId === s.id))
      .map((s) => ({ id: s.id, name: s.name })),
  ];
  const unused = catalog.loras.filter((n) => !loras.some((l) => l.name === n && !l.from));
  const put = (i: number, patch: Partial<StackLora>) =>
    setRecipe((r) => ({ ...r, loras: r.loras.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const move = (from: number, to: number) => setRecipe((r) => ({ ...r, loras: moved(r.loras, from, to) }));
  const { list, handle, row } = useReorder(move);

  return (
    <Section
      title={`LoRAs · ${loras.filter((l) => l.on && fits(l.name, notes, family)).length} active`}
      tip="They run in this order, top first, and their trigger words lead the prompt in the same order: drag a row by its handle to change it. A saved character's LoRAs come and go with that person in the cast, and their trigger words go into that person's description instead. A LoRA marked for another model family stays here, greyed, and is skipped."
    >
      <div ref={list} className="flex flex-col border-t border-line">
        {loras.map((l, i) => (
          <LoraRow
            key={keyOf(l)}
            lora={l}
            index={i}
            last={i === loras.length - 1}
            owner={l.from ? nameOf(l.from) : "Look"}
            owners={family ? owners : []}
            onGive={(o) => give(l, o.id)}
            note={notes.find((n) => n.name === l.name)}
            off={!fits(l.name, notes, family)}
            expanded={open === keyOf(l)}
            families={catalog.families}
            handle={handle}
            dragged={row(i)}
            onToggle={() => setOpen(open === keyOf(l) ? null : keyOf(l))}
            put={(patch) => put(i, patch)}
            move={(to) => move(i, to)}
            remove={() => setRecipe((r) => ({ ...r, loras: r.loras.filter((_, j) => j !== i) }))}
          />
        ))}
      </div>
      {catalog.loras.length === 0 && (
        <Note>
          No LoRAs on the volume yet. Upload one with{" "}
          <code className="font-mono text-muted">tools/sync.sh lora file.safetensors</code>.
        </Note>
      )}
      {unused.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            const name = e.target.value;
            setRecipe((r) => ({ ...r, loras: [...r.loras, { name, strength: 1, on: true }] }));
          }}
          className="text-muted"
        >
          <option value="">+ Add LoRA</option>
          {unused.map((n) => (
            <option key={n} value={n}>
              {shortName(n)}
            </option>
          ))}
        </Select>
      )}
    </Section>
  );
}
