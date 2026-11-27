// The LoRA trigger words and families: tools rather than work, shared by every workspace and kept in the clear.
import { useLiveQuery } from "dexie-react-hooks";

import { db, type LoraNote } from "@/data/db/schema";

const NO_NOTES: LoraNote[] = [];

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
