// Jobs in flight: their ids outlive a reload, and the recipe behind each is sealed.
import { sealJson, unsealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import type { JobMeta } from "@/domain/render";

export const addPending = async (space: Space, id: string, meta: JobMeta) =>
  db.pending.put({ id, ws: space.id, sealed: await sealJson(space.key, meta) });
export const pendingIds = (space: Space) => db.pending.where("ws").equals(space.id).primaryKeys();
export const dropPending = (id: string) => db.pending.delete(id);

/** null when the job is no longer wanted here: purged, or its workspace deleted, while it ran. */
export async function pendingMeta(space: Space, id: string) {
  const row = await db.pending.get(id);
  return row ? unsealJson<JobMeta>(space.key, row.sealed) : null;
}
