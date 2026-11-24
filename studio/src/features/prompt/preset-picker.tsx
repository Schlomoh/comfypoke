// The footer of a row's sheet (and of Together): the subcategories of presets, their chips, and a field
// to type one. What a pick does is the sheet's: a phrase in the row, or a version of the one picked. Nothing here moves on its own:
// the subcategory changes only when another one is tapped, and the subcategories are one line of tabs that scrolls.
import { useAtom } from "jotai";
import { useState, type ReactNode } from "react";

import { addPreset, deletePreset, restorePreset } from "@/data/db/presets";
import type { Preset } from "@/data/db/schema";
import type { Gender } from "@/domain/presets/gender";
import { isBuiltIn, isOffered, presetGroups } from "@/domain/presets/index";
import type { PresetRow } from "@/domain/rows";
import { flash } from "@/features/prompt/flash";
import { keepTypedAtom, subcategoryAtom } from "@/features/prompt/state";
import { useTapGuard } from "@/features/prompt/use-tap-guard";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Tabs } from "@/ui/tabs";

/**
 * A preset taken out of its subcategory: the ones you added with its text are deleted, and a built-in one is hidden.
 * Undo brings it back. `onLast` runs when it was the last one there.
 */
function Removable({
  row,
  text,
  sub,
  own,
  builtIn,
  onLast,
}: {
  row: PresetRow;
  text: string;
  sub: string | undefined;
  own: Preset[];
  builtIn: boolean;
  onLast?: () => void;
}) {
  const guard = useTapGuard();
  const remove = async () => {
    await Promise.all(own.map((p) => deletePreset(p.id)));
    const hid = builtIn ? await addPreset(row, text, sub, true) : undefined;
    onLast?.();
    notify(`Removed the preset “${text}”`, {
      action: {
        label: "Undo",
        run: () => {
          for (const p of own) void restorePreset(p);
          if (hid) void deletePreset(hid);
        },
      },
    });
  };
  return (
    <Chip tone="removing" onClick={guard(() => void remove())}>
      {text} ×
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
  const groups = presetGroups(row, gender, mine);
  const sub = groups.find(([g]) => g === subs[row])?.[0] ?? groups[0]?.[0];
  const items = groups.find(([g]) => g === sub)?.[1] ?? [];
  const removed = mine.filter((p) => p.hidden && p.group === sub); // built-in ones taken out of this subcategory
  const add = (text: string) => {
    const t = text.trim();
    if (t) onAdd(t);
  };

  const chips = items.map((x) => {
    if (removing)
      return (
        <Removable
          key={x}
          row={row}
          text={x}
          sub={sub}
          own={mine.filter((m) => m.text === x && !m.hidden)}
          builtIn={isBuiltIn(row, gender, x)}
          onLast={items.length === 1 ? () => setRemoving(false) : undefined}
        />
      );
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
      {/* typing with the keyboard up, the sheet hides these to keep the field in sight */}
      <div data-keyboard-hide className="flex flex-col gap-2 empty:hidden">
        {groups.length > 0 && (
          <Tabs
            className="-mx-4 pl-4"
            label="Subcategories"
            value={sub}
            options={groups.map(([g]) => g)}
            onChange={(g) => {
              setSubs((m) => ({ ...m, [row]: g }));
              setRemoving(false);
            }}
          />
        )}
        {(items.length > 0 || removed.length > 0) && (
          <ChipRow>
            {chips}
            {items.length > 0 && (
              <Button variant="link" size="inline" onClick={() => setRemoving(!removing)}>
                {removing ? "done removing" : "remove some"}
              </Button>
            )}
            {removed.length > 0 && !removing && (
              <Button
                variant="link"
                size="inline"
                onClick={() => {
                  for (const p of removed) void deletePreset(p.id);
                  notify(`Brought back ${removed.length} removed`, {
                    action: { label: "Undo", run: () => removed.forEach((p) => void restorePreset(p)) },
                  });
                }}
              >
                bring back {removed.length} removed
              </Button>
            )}
          </ChipRow>
        )}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = typed.trim();
          if (!t) return;
          add(t);
          if (keep) {
            // a removed built-in one comes back; anything else not offered yet goes into the open subcategory
            const hidden = mine.find((p) => p.hidden && p.text === t);
            if (hidden) void deletePreset(hidden.id);
            else if (!isOffered(row, gender, t, mine)) void addPreset(row, t, sub);
          }
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
            Keep what I type as a preset{sub ? ` in ${sub}` : ""}, in every workspace
          </span>
        }
      />
    </>
  );
}
