// The footer of a row's sheet: the subcategories of presets, their chips, and a field to type one. It
// adds a phrase to the row, or a version to the phrase picked above. Nothing here moves on its own:
// the subcategory changes only when another one is tapped, and the first line never wraps.
import { useAtom, useSetAtom } from "jotai";
import { useState } from "react";

import { addPreset, deletePreset, restorePreset } from "@/data/db/presets";
import type { Preset } from "@/data/db/schema";
import { editPhrase, editRow, isBuiltIn, presetGroups, rowDef, type RowRef } from "@/domain/cast";
import { phrase, type Phrase } from "@/domain/recipe";
import { flash } from "@/features/prompt/flash";
import { keepTypedAtom, subcategoryAtom } from "@/features/prompt/state";
import { useTapGuard } from "@/features/prompt/use-tap-guard";
import { recipeAtom } from "@/state/studio";
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

export function PresetPicker({
  at,
  phrases,
  target,
  presets,
  onTarget,
}: {
  at: RowRef;
  phrases: Phrase[];
  target: Phrase | undefined;
  presets: Preset[];
  onTarget: (target: string | null) => void;
}) {
  const setRecipe = useSetAtom(recipeAtom);
  const [subs, setSubs] = useAtom(subcategoryAtom);
  const [keep, setKeep] = useAtom(keepTypedAtom);
  const [removing, setRemoving] = useState(false);
  const [typed, setTyped] = useState("");

  const def = rowDef(at.row);
  const mine = presets.filter((p) => p.block === at.row);
  const groups = presetGroups(
    at.row,
    mine.map((p) => p.text),
  );
  const sub =
    groups.find(([g]) => g === subs[at.row])?.[0] ??
    groups.find(([g]) => g !== "Yours")?.[0] ??
    groups[0]?.[0];
  const items = groups.find(([g]) => g === sub)?.[1] ?? [];
  const owner = (x: string) =>
    target ? [target].find((p) => p.t === x || p.versions.includes(x)) : phrases.find((p) => p.t === x);

  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (target)
      setRecipe((r) =>
        editPhrase(r, { ...at, id: target.id }, (p) =>
          t === p.t || p.versions.includes(t) ? p : { ...p, versions: [...p.versions, t] },
        ),
      );
    else setRecipe((r) => editRow(r, at, (xs) => (xs.some((p) => p.t === t) ? xs : [...xs, phrase(t)])));
  };

  const chips = items.map((x) => {
    const preset = removing && sub === "Yours" ? mine.find((m) => m.text === x) : undefined;
    if (preset)
      return <Removable key={x} preset={preset} last={mine.length === 1} onLast={() => setRemoving(false)} />;
    const there = owner(x);
    return there ? (
      <Chip key={x} tone="picked" onClick={() => flash(there.id)} title="Already added">
        ✓ {x}
      </Chip>
    ) : (
      <Chip key={x} tone="add" onClick={() => add(x)}>
        + {x}
      </Chip>
    );
  });

  return (
    <>
      <div className="flex h-11 items-center gap-2 text-[13px] text-warn fine:h-8">
        <span className="min-w-0 flex-1 truncate">
          {target ? `Adding versions of “${target.t}”` : `Adding to ${def.label}`}
        </span>
        {target && (
          <Button variant="link" size="inline" onClick={() => onTarget(null)}>
            add a phrase instead
          </Button>
        )}
      </div>
      {groups.length > 0 && (
        <ChipRow>
          {groups.map(([g]) => (
            <Chip
              key={g}
              text="mono"
              tone={g === sub ? "picked" : "quiet"}
              aria-pressed={g === sub}
              onClick={() => {
                setSubs((m) => ({ ...m, [at.row]: g }));
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
          if (keep && !mine.some((p) => p.text === t) && !isBuiltIn(at.row, t)) void addPreset(at.row, t);
          setTyped("");
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={target ? "or type a version" : `or type one: ${def.hint}`}
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
