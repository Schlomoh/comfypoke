// A workspace's saved characters and scenes, sealed. Both live in the chars table, told apart by kind.
import { useLiveQuery } from "dexie-react-hooks";

import { sealJson, unsealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import { useSpace, useUnsealed, type Space } from "@/data/db/space";
import { savedOnly, toSaved, type Saved } from "@/domain/saved";

/** By name; undefined while they are read. */
export function useSavedList(): Saved[] | undefined {
  const space = useSpace();
  const rows = useLiveQuery(() => db.chars.where("ws").equals(space.id).toArray(), [space.id]);
  const raw = useUnsealed(rows);
  return raw && savedOnly(raw);
}

/** By name; an empty list while they are read. */
export const useSaved = (): Saved[] => useSavedList() ?? [];

export const putSaved = async (space: Space, c: Saved) =>
  db.chars.put({ id: c.id, ws: space.id, sealed: await sealJson(space.key, c) });
export const deleteSaved = (id: string) => db.chars.delete(id);

let queue: Promise<unknown> = Promise.resolve();
/** A change to one saved entry made from what is stored, not from what a screen last showed, one after another:
 * two quick edits each see the other's. */
export const updateSaved = (space: Space, id: string, change: (s: Saved) => Saved) =>
  (queue = queue.then(async () => {
    const row = await db.chars.get(id);
    const s = row && toSaved(await unsealJson(space.key, row.sealed));
    return s ? putSaved(space, change(s)) : undefined;
  }));
