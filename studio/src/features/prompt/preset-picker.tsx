// The footer of a row's sheet (and of Together): the subcategories of presets, their chips, and a field to type one.
// What a pick does is the sheet's: a phrase in the row, or a version of the one picked. Nothing here moves on its own:
// the subcategory changes only when another one is tapped, and the subcategories are one line of tabs that scrolls.
// "edit" turns the chips into menus (move, remove) and offers to arrange the subcategories themselves.
import { useAtom } from "jotai";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { editPresets } from "@/data/db/prompt-catalog";
import type { Gender } from "@/domain/presets/gender";
import { addChunk, view, type Presets } from "@/domain/prompt-catalog";
import { PRESET_ROWS, type PresetRow } from "@/domain/rows";
import { ChunkMenu } from "@/features/prompt/chunk-menu";
import { flash } from "@/features/prompt/flash";
import { keepTypedAtom, subcategoryAtom } from "@/features/prompt/state";
import { SubsSheet } from "@/features/prompt/subs-sheet";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { Tabs } from "@/ui/tabs";

const asIs = (x: string) => x;

export type PickerProps = {
  row: PresetRow;
  gender: Gender;
  presets: Presets;
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
  const [open, setOpen] = useAtom(subcategoryAtom);
  const [keep, setKeep] = useAtom(keepTypedAtom);
  const [editing, setEditing] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [typed, setTyped] = useState("");

  const shelves = view(presets, row, gender);
  const shelf = shelves.find((s) => s.sub.id === open[row]) ?? shelves[0];
  const items = shelf?.items ?? [];
  const label = PRESET_ROWS.find((r) => r.id === row)?.label ?? row;
  const add = (text: string) => {
    const t = text.trim();
    if (t) onAdd(t);
  };

  const chips = items.map(({ chunk, text }) => {
    if (editing)
      return (
        <ChunkMenu
          key={`${chunk.id}:${text}`} // a new text (an Undo, another gender) starts the rename field over
          chunk={chunk}
          text={text}
          gender={gender}
          label={display(text)}
          subs={shelves.map((s) => s.sub)}
          onMoved={(sub) => setOpen((m) => ({ ...m, [row]: sub }))}
        />
      );
    const there = has(text);
    return there ? (
      <Chip key={chunk.id} tone="picked" onClick={() => flash(there)} title="Already added">
        ✓ {display(text)}
      </Chip>
    ) : (
      <Chip key={chunk.id} tone="quiet" onClick={() => add(text)}>
        + {display(text)}
      </Chip>
    );
  });

  return (
    <>
      <div className="flex h-11 items-center gap-2 text-[13px] text-accent fine:h-8">{header}</div>
      {/* typing with the keyboard up, the sheet hides these to keep the field in sight */}
      {/* not while editing: a preset's menu is in it, and its fields would vanish with the keyboard up */}
      <div data-keyboard-hide={editing ? undefined : true} className="flex flex-col gap-2 empty:hidden">
        {/* edit sits at the end of the tabs, and stays when a row has no subcategory left, to add one or reset it */}
        <div className="-mx-4 flex items-center pr-2">
          {shelves.length > 0 ? (
            <Tabs
              className="min-w-0 flex-1 pl-4"
              label="Subcategories"
              value={shelf?.sub.name}
              options={shelves.map((s) => s.sub.name)}
              onChange={(name) => {
                const sub = shelves.find((s) => s.sub.name === name)?.sub.id;
                if (sub) setOpen((m) => ({ ...m, [row]: sub }));
              }}
            />
          ) : (
            <span className="flex-1" />
          )}
          <Button
            variant="text"
            onClick={() => setEditing(!editing)}
            aria-pressed={editing}
            title="Move, rename or remove presets; arrange the subcategories"
          >
            {editing ? "Done" : "✎ Edit"}
          </Button>
        </div>
        {editing && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-xs text-muted">
              Tap a preset to move, rename or remove it.
            </span>
            <Button variant="link" size="inline" onClick={() => setArranging(true)}>
              Arrange subcategories
            </Button>
          </div>
        )}
        {(chips.length > 0 || editing) && <ChipRow editing={editing}>{chips}</ChipRow>}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = typed.trim();
          if (!t) return;
          add(t);
          if (keep) void editPresets((c) => addChunk(c, row, t, { sub: shelf?.sub.id })); // nothing when it is one already
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
            Keep what I type as a preset{shelf ? ` in ${shelf.sub.name}` : ""}, in every workspace
          </span>
        }
      />
      {/* out of this footer, which the row sheet hides with the keyboard up, taking a sheet inside it along */}
      {createPortal(
        <SubsSheet
          open={arranging}
          onClose={() => setArranging(false)}
          row={row}
          label={label}
          presets={presets}
        />,
        document.body,
      )}
    </>
  );
}
