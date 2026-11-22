// The footer of a row's sheet (and of Together): the subcategories of presets, their chips, and a field
// to type one. What a pick does is the sheet's: a phrase in the row, or a version of the one picked. Nothing here moves on its own:
// the subcategory changes only when another one is tapped, and the first line never wraps.
import { useAtom } from "jotai";
import { useState, type ReactNode } from "react";

import { addPreset, deletePreset, restorePreset } from "@/data/db/presets";
import type { Preset } from "@/data/db/schema";
import type { Gender } from "@/domain/presets/gender";
import { isBuiltIn, presetGroups } from "@/domain/presets/index";
import type { PresetRow } from "@/domain/rows";
import { flash } from "@/features/prompt/flash";
import { keepTypedAtom, subcategoryAtom } from "@/features/prompt/state";
import { useTapGuard } from "@/features/prompt/use-tap-guard";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";

function Removable({ preset, last, onLast }: { preset: Preset; last: boolean; onLast: () => void }) {
  const guard = useTapGuard();
  return (
    <Chip
      tone="removing"
      onClick={guard(() => {
        void deletePreset(preset.id);
        if (last) onLast();
        notify(`Removed the preset “${preset.text}”`, {
          action: { label: "Undo", run: () => void restorePreset(preset) },
        });
      })}
    >
      {preset.text} ×
    </Chip>
  );
}

/** What a picker adds to and how: the row's presets, its subcategory memory and the field's hint. */
const asIs = (x: string) => x;

export type PickerProps = {
  row: PresetRow;
  gender: Gender;
  presets: Preset[];
  header: ReactNode;
  placeholder: string;
  /** The phrase a preset is already, to show it as added and bring it into view. */
  has: (text: string) => string | undefined;
  onAdd: (text: string) => void;
  /** A chip's label, when it reads otherwise than the text it adds. */
  display?: (text: string) => string;
};

export function PresetPicker({
  row,
  gender,
  presets,
  header,
  placeholder,
  has,
  onAdd,
  display = asIs,
}: PickerProps) {
  const [subs, setSubs] = useAtom(subcategoryAtom);
  const [keep, setKeep] = useAtom(keepTypedAtom);
  const [removing, setRemoving] = useState(false);
  const [typed, setTyped] = useState("");

  const mine = presets.filter((p) => p.block === row);
  const groups = presetGroups(
    row,
    gender,
    mine.map((p) => p.text),
  );
  const sub =
    groups.find(([g]) => g === subs[row])?.[0] ?? groups.find(([g]) => g !== "Yours")?.[0] ?? groups[0]?.[0];
  const items = groups.find(([g]) => g === sub)?.[1] ?? [];
  const add = (text: string) => {
    const t = text.trim();
    if (t) onAdd(t);
  };

  const chips = items.map((x) => {
    const preset = removing && sub === "Yours" ? mine.find((m) => m.text === x) : undefined;
    if (preset)
      return <Removable key={x} preset={preset} last={mine.length === 1} onLast={() => setRemoving(false)} />;
    const there = has(x);
    return there ? (
      <Chip key={x} tone="picked" onClick={() => flash(there)} title="Already added">
        ✓ {display(x)}
      </Chip>
    ) : (
      <Chip key={x} tone="add" onClick={() => add(x)}>
        + {display(x)}
      </Chip>
    );
  });

  return (
    <>
      <div className="flex h-11 items-center gap-2 text-[13px] text-warn fine:h-8">{header}</div>
      {groups.length > 0 && (
        <ChipRow>
          {groups.map(([g]) => (
            <Chip
              key={g}
              text="mono"
              tone={g === sub ? "picked" : "quiet"}
              aria-pressed={g === sub}
              onClick={() => {
                setSubs((m) => ({ ...m, [row]: g }));
                setRemoving(false);
              }}
            >
              {g}
            </Chip>
          ))}
        </ChipRow>
      )}
      {items.length > 0 && (
        <ChipRow>
          {chips}
          {sub === "Yours" && (
            <Button variant="link" size="inline" onClick={() => setRemoving(!removing)}>
              {removing ? "done removing" : "remove some of yours"}
            </Button>
          )}
        </ChipRow>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = typed.trim();
          if (!t) return;
          add(t);
          if (keep && !mine.some((p) => p.text === t) && !isBuiltIn(row, gender, t)) void addPreset(row, t);
          setTyped("");
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="done"
          className="flex-1 fine:h-9"
        />
        <Button type="submit" disabled={!typed.trim()}>
          Add
        </Button>
      </form>
      <Checkbox
        on={keep}
        onChange={setKeep}
        label={
          <span className="text-xs text-muted">
            Keep what I type as a preset (under Yours, in every workspace)
          </span>
        }
      />
    </>
  );
}
