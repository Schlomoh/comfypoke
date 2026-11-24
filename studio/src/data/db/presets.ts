// Your own presets (added, or built-in ones removed) and the LoRA trigger words: tools rather than work, shared by every workspace and
// kept in the clear.
import { useLiveQuery } from "dexie-react-hooks";

import { db, type LoraNote, type Preset } from "@/data/db/schema";
import type { PresetRow } from "@/domain/rows";

const NO_NOTES: LoraNote[] = [];

/** With the row each is offered in, oldest first; undefined until read, so a picker can wait instead of jumping. */
export const usePresets = () => useLiveQuery(() => db.presets.orderBy("at").toArray(), []);

/** A preset added to a subcategory (none: More), or with `hidden`, a built-in one removed from the row. */
export const addPreset = (row: PresetRow, text: string, group?: string, hidden?: boolean): Promise<string> =>
  db.presets.put({
    id: crypto.randomUUID(),
    block: row,
    text,
    at: Date.now(),
    ...(group ? { group } : {}),
    ...(hidden ? { hidden } : {}),
  });
export const deletePreset = (id: string) => db.presets.delete(id);
export const restorePreset = (p: Preset) => db.presets.put(p);

export const useLoraNotes = () => useLiveQuery(() => db.loraNotes.toArray(), []) ?? NO_NOTES;
/** Each field of a LoRA's note on its own, keeping the others. */
const putNote = (name: string, patch: Partial<LoraNote>) =>
  db.transaction("rw", db.loraNotes, async () => {
    const old = await db.loraNotes.get(name);
    await db.loraNotes.put({ trigger: "", ...old, ...patch, name });
  });
export const setTrigger = (name: string, trigger: string) => putNote(name, { trigger });
/** The family a LoRA was trained for; "" for not said. */
export const setLoraFamily = (name: string, family: string) => putNote(name, { family: family || undefined });
