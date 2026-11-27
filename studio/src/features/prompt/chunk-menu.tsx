// A preset while the picker is being edited: a tap opens what can be done with it: rename it, move it to another
// subcategory of its row (or a new one), or remove it, each with Undo.
import { useState } from "react";

import type { Gender } from "@/domain/presets/gender";
import { addSub, moveChunk, removeChunks, renameChunk, type Chunk, type Sub } from "@/domain/prompt-catalog";
import { editPresetsSaying } from "@/state/presets";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { MenuItem, Popover } from "@/ui/popover";

export function ChunkMenu({
  chunk,
  text,
  gender,
  label,
  subs,
  onMoved,
}: {
  chunk: Chunk;
  text: string; // as this gender reads it
  gender: Gender;
  label: string; // as the chip shows it
  subs: Sub[]; // the row's subcategories as the picker shows them
  onMoved: (sub: string) => void; // the picker follows it there
}) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState(text);
  const move = (to: string, toName: string) => {
    onMoved(to);
    void editPresetsSaying(`Moved “${label}” to ${toName}`, (c) => moveChunk(c, chunk.id, to));
  };
  const moveToNew = () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    let made = "";
    void editPresetsSaying(`Moved “${label}” to ${n}`, (c) => {
      const [out, id] = addSub(c, chunk.row, n);
      made = id;
      return moveChunk(out, chunk.id, id);
    }).then(() => onMoved(made));
  };

  return (
    <Popover trigger={label} variant="chip" size="inline" align="start" title="Rename, move or remove">
      <form
        className="flex gap-1 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim();
          if (t && t !== text)
            void editPresetsSaying(`Renamed “${text}” to “${t}”`, (c) => renameChunk(c, chunk.id, t, gender));
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Its text"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!draft.trim() || draft.trim() === text}>
          Rename
        </Button>
      </form>
      <p className="px-3 pt-2 pb-1 font-mono text-[10.5px] text-faint uppercase">Move to</p>
      {subs
        .filter((s) => s.id !== chunk.sub)
        .map((s) => (
          <MenuItem key={s.id} onClick={() => move(s.id, s.name)}>
            {s.name}
          </MenuItem>
        ))}
      <form
        className="flex gap-1 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          moveToNew();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="a new subcategory"
          aria-label="New subcategory"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          Move
        </Button>
      </form>
      <MenuItem
        className="text-bad"
        onClick={() =>
          void editPresetsSaying(`Removed the preset “${label}”`, (c) => removeChunks(c, [chunk.id]))
        }
      >
        Remove
      </MenuItem>
    </Popover>
  );
}
