// A row's subcategories, to put in order with the arrows (a phone's way; one way, not two), rename (onto another's name, the two become
// one), delete with what is in them, add, or reset to the built-in ones. Shared by every workspace, like the presets.
import { useState } from "react";

import { editPresets } from "@/data/db/prompt-catalog";
import { resetRow } from "@/domain/built-ins";
import {
  addSub,
  chunksOf,
  deleteSub,
  renameSub,
  reorderSubs,
  subsOf,
  type Presets,
} from "@/domain/prompt-catalog";
import type { PresetRow } from "@/domain/rows";
import { editPresetsSaying } from "@/state/presets";
import { Button } from "@/ui/button";
import { CommitInput, Input } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { Note } from "@/ui/text";

export function SubsSheet({
  open,
  onClose,
  row,
  label,
  presets,
}: {
  open: boolean;
  onClose: () => void;
  row: PresetRow;
  label: string;
  presets: Presets;
}) {
  const [name, setName] = useState("");
  const subs = subsOf(presets, row);
  const move = (from: number, to: number) => void editPresets((c) => reorderSubs(c, row, from, to));

  return (
    <Sheet open={open} onClose={onClose} title={`${label} · subcategories`}>
      {subs.length === 0 && <Note>No subcategories yet. Add one below.</Note>}
      <div className="flex flex-col gap-2">
        {subs.map((s, i) => {
          const count = chunksOf(presets, s.id).length;
          return (
            <div key={s.id} className="flex items-center gap-1 border border-line bg-bg pl-2">
              <CommitInput
                bare
                value={s.name}
                aria-label="Name"
                onCommit={(n) => n.trim() && void editPresets((c) => renameSub(c, s.id, n))}
                className="min-w-0 flex-1"
              />
              <span className="font-mono text-[11px] text-faint tabular-nums">{count}</span>
              <Button
                variant="icon"
                size="square"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`Move ${s.name} up`}
              >
                ↑
              </Button>
              <Button
                variant="icon"
                size="square"
                disabled={i === subs.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Move ${s.name} down`}
              >
                ↓
              </Button>
              <Button
                variant="icon"
                size="square"
                aria-label={`Delete ${s.name}`}
                onClick={() =>
                  void editPresetsSaying(
                    count ? `Deleted ${s.name} and its ${count} presets` : `Deleted ${s.name}`,
                    (c) => deleteSub(c, s.id),
                  )
                }
              >
                ×
              </Button>
            </div>
          );
        })}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void editPresets((c) => addSub(c, row, name)[0]);
          setName("");
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="a new subcategory"
          enterKeyHint="done"
          className="flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      <Button
        variant="link"
        size="inline"
        className="self-start"
        onClick={() =>
          void editPresetsSaying(`Reset ${label} to the built-in presets`, (c) => resetRow(c, row))
        }
      >
        reset {label} to the built-in presets
      </Button>
      <Note>Presets you typed stay, in a subcategory of the name they had.</Note>
    </Sheet>
  );
}
