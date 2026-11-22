// The LoRA stack, in the order it runs: drag a row by its handle to change it. A row is the switch, the name, where
// it came from (the setup's own, or a character's) and its strength; the rest folds open under it. A LoRA made for
// another model family stays listed, greyed and skipped when sent.
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

import { setLoraFamily, setTrigger, useLoraNotes } from "@/data/db/presets";
import { useSaved } from "@/data/db/saved";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import { fits, moved } from "@/domain/loras";
import type { StackLora } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cn } from "@/ui/cn";
import { Input, Select } from "@/ui/field";
import { useReorder } from "@/ui/reorder";
import { Section } from "@/ui/section";
import { Slider } from "@/ui/slider";
import { Note } from "@/ui/text";

/** A field typed into while its value can also change from elsewhere (the slider, a note loading). */
function useEditable(value: string) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(value);
  }, [value]);
  return [ref, text, setText] as const;
}

// Both fields apply on every keystroke: a tap on Generate (or Cmd+Enter) must not race a blur.
function LoraTuning({
  lora,
  trigger,
  onStrength,
}: {
  lora: StackLora;
  trigger: string;
  onStrength: (v: number) => void;
}) {
  const [strengthRef, strength, setStrength] = useEditable(String(lora.strength));
  const [triggerRef, words, setWords] = useEditable(trigger);
  return (
    <>
      <div className="flex items-center gap-2">
        <Slider min={-6} max={6} step={0.05} value={lora.strength} onValue={onStrength} />
        <Input
          ref={strengthRef}
          size="sm"
          mono
          inputMode="decimal"
          aria-label="Strength"
          value={strength}
          onChange={(e) => {
            setStrength(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) onStrength(Math.max(-8, Math.min(8, v))); // the slider stops at ±6, typing goes to ±8
          }}
          onBlur={() => setStrength(String(lora.strength))}
          className="w-16 text-right"
        />
      </div>
      <Input
        ref={triggerRef}
        size="sm"
        value={words}
        onChange={(e) => {
          setWords(e.target.value);
          void setTrigger(lora.name, e.target.value.trim());
        }}
        placeholder="trigger words (kept on this device, added to the prompt)"
      />
    </>
  );
}

const keyOf = (l: StackLora) => `${l.from ?? ""}:${l.name}`;

type RowProps = {
  lora: StackLora;
  index: number;
  last: boolean;
  owner: string | undefined;
  note: { trigger: string; family?: string } | undefined;
  off: boolean; // made for another family: listed, not sent
  expanded: boolean;
  families: { id: string; label: string }[];
  handle: ReturnType<typeof useReorder>["handle"];
  dragged: ReturnType<ReturnType<typeof useReorder>["row"]>;
  onToggle: () => void;
  put: (patch: Partial<StackLora>) => void;
  move: (to: number) => void;
  remove: () => void;
};

function LoraRow({
  lora: l,
  index: i,
  last,
  owner,
  note,
  off,
  expanded,
  families,
  handle,
  dragged,
  ...on
}: RowProps) {
  const madeFor = note?.family && families.find((f) => f.id === note.family)?.label;
  return (
    <div
      {...dragged}
      className={cn(
        "flex flex-col gap-1.5 border-b border-line bg-panel py-1 data-dragging:relative data-dragging:z-10 data-dragging:shadow-lg",
        (!l.on || off) && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1">
        <span
          {...handle}
          data-index={i}
          aria-hidden
          className="grid h-11 w-6 shrink-0 place-items-center text-faint select-none fine:h-8"
        >
          ⋮⋮
        </span>
        <Checkbox
          on={l.on}
          onChange={(v) => on.put({ on: v })}
          title={l.name}
          className="min-w-0 flex-1"
          label={<span className="truncate font-mono text-xs">{shortName(l.name)}</span>}
        />
        {owner && <span className="shrink-0 bg-mask/15 px-1.5 text-[11px] text-mask">{owner}</span>}
        {off && madeFor && <span className="shrink-0 text-[11px] text-faint">{madeFor} only</span>}
        <Button
          variant="quiet"
          size="inline"
          aria-expanded={expanded}
          aria-label={`${shortName(l.name)}: strength ${l.strength}, more`}
          onClick={on.onToggle}
          className="w-14 justify-end font-mono text-xs tabular-nums"
        >
          {l.strength.toFixed(2)}
        </Button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 pb-2 pl-7">
          <LoraTuning
            lora={l}
            trigger={note?.trigger ?? ""}
            onStrength={(strength) => on.put({ strength })}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              aria-label="Made for"
              value={note?.family ?? ""}
              onChange={(e) => void setLoraFamily(l.name, e.target.value)}
              className="min-w-0 flex-1 text-xs"
            >
              <option value="">made for any family</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  made for {f.label}
                </option>
              ))}
            </Select>
            <Button size="inline" disabled={i === 0} onClick={() => on.move(i - 1)} aria-label="Move up">
              ↑
            </Button>
            <Button size="inline" disabled={last} onClick={() => on.move(i + 1)} aria-label="Move down">
              ↓
            </Button>
            {!l.from && (
              <Button variant="text" onClick={on.remove}>
                remove
              </Button>
            )}
          </div>
          {owner && (
            <Note>Comes with {owner}; set which LoRAs a character brings on their card in Prompt.</Note>
          )}
        </div>
      )}
    </div>
  );
}

export function Loras() {
  const recipe = useAtomValue(recipeAtom);
  const loras = recipe.loras;
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const family = resolve(recipe, catalog).family?.id;
  const notes = useLoraNotes();
  const saved = useSaved();
  const [open, setOpen] = useState<string | null>(null);
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
            owner={l.from && (saved.find((s) => s.id === l.from)?.name ?? "a character")}
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
