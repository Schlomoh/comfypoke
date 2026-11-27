// The prompt catalog (the presets) in the database: each edit is a function of the whole catalog (domain/prompt-catalog.ts), written as
// the difference it makes, in one transaction. Each returns its Undo: the difference back.
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/data/db/schema";
import { revise, sync } from "@/domain/built-ins";
import { diff, isEmpty, type Presets, type Change } from "@/domain/prompt-catalog";

const read = async (): Promise<Presets> => ({
  subs: await db.subs.toArray(),
  chunks: await db.chunks.toArray(),
});

async function write(c: Change) {
  if (isEmpty(c)) return;
  await db.chunks.bulkDelete(c.dropChunks);
  await db.subs.bulkDelete(c.dropSubs);
  await db.subs.bulkPut(c.subs);
  await db.chunks.bulkPut(c.chunks);
}

/** The whole catalog; undefined until read, so a picker can wait instead of jumping. */
export const usePresets = () => useLiveQuery(read, []);

export type Undo = () => Promise<void>;

/** null when the edit changed nothing (a rename onto a text the row has, say). */
export const editPresets = (edit: (c: Presets) => Presets): Promise<Undo | null> =>
  db.transaction("rw", db.subs, db.chunks, async () => {
    const before = await read();
    const after = edit(before);
    if (isEmpty(diff(before, after))) return null;
    await write(diff(before, after));
    const back = diff(after, before);
    return () => db.transaction("rw", db.subs, db.chunks, () => write(back));
  });

/** The built-in presets this device has not seen yet: all of them on a new one, a release's new ones after that,
 * and the ones a release changed, where the person left them as they were. */
export const syncBuiltIns = () =>
  db.transaction("rw", db.subs, db.chunks, db.meta, async () => {
    const stored = (await db.meta.get("seen"))?.value;
    const seen = Array.isArray(stored) ? (stored as string[]) : [];
    const before = await read();
    const [revised, known] = revise(before, seen);
    const [after, all] = sync(revised, known);
    await write(diff(before, after)); // nothing, mostly; a new built-in the person had typed already is seen all the same
    if (all.length !== seen.length) await db.meta.put({ key: "seen", value: all });
  });
