// Model setups: shared by every workspace, kept in the clear like presets and LoRA notes.
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/data/db/schema";
import { BUILT_IN, type Setup } from "@/domain/setup";

const NONE: Setup[] = [];

/** Yours, oldest first, after the built-in ones. */
export const useSetups = () => [
  ...BUILT_IN,
  ...(useLiveQuery(() => db.setups.orderBy("at").toArray(), []) ?? NONE),
];

/** Saves under its name, replacing the one of that name. */
export async function saveSetup(s: Setup) {
  await db.transaction("rw", db.setups, async () => {
    await db.setups
      .where("id")
      .anyOf((await db.setups.toArray()).filter((x) => x.name === s.name).map((x) => x.id))
      .delete();
    await db.setups.put(s);
  });
}

export const deleteSetup = (id: string) => db.setups.delete(id);
export const restoreSetup = (s: Setup) => db.setups.put(s);
