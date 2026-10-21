// Your own presets and the LoRA trigger words: tools rather than work, shared by every workspace and
// kept in the clear.
import { useLiveQuery } from "dexie-react-hooks";

import { db, type LoraNote, type Preset } from "@/data/db/schema";
import type { RowId } from "@/domain/rows";

const NO_NOTES: LoraNote[] = [];

/** With the row each is offered in, oldest first; undefined until read, so a picker can wait instead of jumping. */
export const usePresets = () => useLiveQuery(() => db.presets.orderBy("at").toArray(), []);

export const addPreset = (row: RowId, text: string) =>
  db.presets.put({ id: crypto.randomUUID(), block: row, text, at: Date.now() });
export const deletePreset = (id: string) => db.presets.delete(id);
export const restorePreset = (p: Preset) => db.presets.put(p);

export const useLoraNotes = () => useLiveQuery(() => db.loraNotes.toArray(), []) ?? NO_NOTES;
export const setTrigger = (name: string, trigger: string) => db.loraNotes.put({ name, trigger });
