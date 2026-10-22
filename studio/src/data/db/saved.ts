// A workspace's saved characters and scenes, sealed. Both live in the chars table, told apart by kind.
import { useLiveQuery } from "dexie-react-hooks";

import { sealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import { useSpace, useUnsealed, type Space } from "@/data/db/space";
import { savedOnly, type Saved } from "@/domain/saved";

/** By name; an empty list while they are read. */
export function useSaved(): Saved[] {
  const space = useSpace();
  const rows = useLiveQuery(() => db.chars.where("ws").equals(space.id).toArray(), [space.id]);
  const raw = useUnsealed(rows);
  return raw ? savedOnly(raw) : [];
}

export const putSaved = async (space: Space, c: Saved) =>
  db.chars.put({ id: c.id, ws: space.id, sealed: await sealJson(space.key, c) });
export const deleteSaved = (id: string) => db.chars.delete(id);
