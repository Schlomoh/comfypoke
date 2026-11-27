// What the Edit tab made on each image (its masks, the people found on it, their fitted bodies), sealed and kept by the
// image's id, so a reload or the next visit finds it as it was left. The workspace's own id holds the tab's choices.
// The shape is the Edit tab's (features/edit/keep.ts); here it is only sealed and stored.
import { sealJson, unsealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import type { Space } from "@/data/db/space";

export async function loadEdit(space: Space, id: string) {
  const row = await db.edits.get(id);
  return row ? unsealJson<unknown>(space.key, row.sealed) : undefined;
}

/** Writes an image's edit, or with `value` undefined forgets it. Nothing is written for an image deleted meanwhile. */
export async function saveEdit(space: Space, id: string, value: unknown) {
  if (value === undefined) {
    await db.edits.delete(id);
    return;
  }
  const sealed = await sealJson(space.key, value);
  await db.transaction("rw", [db.workspaces, db.shots, db.edits], async () => {
    const owner = id === space.id ? await db.workspaces.get(id) : await db.shots.get(id);
    if (owner) await db.edits.put({ id, ws: space.id, sealed });
  });
}
