// One row of the LoRA stack: the switch, the name, whose it is and the strength; strength, trigger words, the family
// it was made for and moving fold open under it.
import { useEffect, useRef, useState } from "react";

import { setLoraFamily, setTrigger } from "@/data/db/lora-notes";
import { shortName } from "@/domain/format";
import type { StackLora } from "@/domain/recipe";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cn } from "@/ui/cn";
import { Input, Select } from "@/ui/field";
import { MenuItem, Popover } from "@/ui/popover";
import type { useReorder } from "@/ui/reorder";
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

export type Owner = { id: string | undefined; name: string }; // undefined: the look's own

/** Whose a LoRA is, and the menu that gives it to someone else in the cast, in its place and at its strength. */
function OwnerTag({
  owner,
  ownerId,
  owners,
  onGive,
}: {
  owner: string;
  ownerId: string | undefined;
  owners: Owner[];
  onGive: (to: Owner) => void;
}) {
  return (
    <Popover
      trigger={owner}
      variant="quiet"
      size="inline"
      aria-label={`${owner}'s: give it to another`}
      title="Whose it is: the look's, or a character's that comes and goes with them"
      className="max-w-24 shrink-0 truncate bg-mask/15 px-1.5 text-[11px] text-mask"
    >
      <p className="px-3 py-2 text-xs text-muted">Give it to</p>
      {owners.map((o) => (
        <MenuItem key={o.id ?? ""} disabled={o.id === ownerId} onClick={() => onGive(o)}>
          {o.id ? o.name : "the look"}
        </MenuItem>
      ))}
    </Popover>
  );
}

type RowProps = {
  lora: StackLora;
  index: number;
  last: boolean;
  owner: string;
  owners: Owner[]; // who it can go to: the look, and each saved character in the cast
  onGive: (to: Owner) => void;
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

export function LoraRow({
  lora: l,
  index: i,
  last,
  owner,
  owners,
  onGive,
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
        {owners.length > 1 ? (
          <OwnerTag owner={owner} ownerId={l.from} owners={owners} onGive={onGive} />
        ) : (
          <span className="shrink-0 px-1.5 text-[11px] text-faint">{owner}</span>
        )}
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
              className="min-w-0 flex-1"
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
          {l.from && (
            <Note>
              Comes with {owner} and goes when {owner} leaves the cast, for this model family. Tap “{owner}”
              to give it to the look.
            </Note>
          )}
        </div>
      )}
    </div>
  );
}
