// The LoRA stack: each one on or off, its strength and its trigger words.
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

import { setTrigger, useLoraNotes } from "@/data/db/presets";
import { useCatalog } from "@/data/queries";
import { shortName } from "@/domain/format";
import type { StackLora } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cn } from "@/ui/cn";
import { Input, Select } from "@/ui/field";
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

export function Loras() {
  const loras = useAtomValue(recipeAtom).loras;
  const setRecipe = useSetAtom(recipeAtom);
  const available = useCatalog().catalog.loras;
  const notes = useLoraNotes();
  const unused = available.filter((n) => !loras.some((l) => l.name === n));
  const put = (i: number, patch: Partial<StackLora>) =>
    setRecipe((r) => ({ ...r, loras: r.loras.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  return (
    <Section title={`LoRAs · ${loras.filter((l) => l.on).length} active`}>
      {loras.map((l, i) => (
        <div
          key={l.name}
          className={cn("flex flex-col gap-1.5 border border-line bg-bg p-2", !l.on && "opacity-45")}
        >
          <div className="flex items-center gap-1">
            <Checkbox
              on={l.on}
              onChange={(on) => put(i, { on })}
              title={l.name}
              className="min-w-0 flex-1"
              label={<span className="truncate font-mono text-xs">{shortName(l.name)}</span>}
            />
            <Button
              variant="text"
              onClick={() => setRecipe((r) => ({ ...r, loras: r.loras.filter((_, j) => j !== i) }))}
            >
              remove
            </Button>
          </div>
          <LoraTuning
            lora={l}
            trigger={notes.find((n) => n.name === l.name)?.trigger ?? ""}
            onStrength={(strength) => put(i, { strength })}
          />
        </div>
      ))}
      {available.length === 0 && (
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
