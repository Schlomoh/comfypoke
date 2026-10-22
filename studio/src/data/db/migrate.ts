// Renders, characters, the draft and pending jobs from before workspaces move into one called Default.
// WebCrypto cannot run inside a Dexie upgrade, so this runs once per page before the start screen.
import { importKey } from "@/data/crypto";
import { saveDraft } from "@/data/db/drafts";
import { addPending } from "@/data/db/pending";
import { putShot } from "@/data/db/renders";
import { putSaved } from "@/data/db/saved";
import { db } from "@/data/db/schema";
import { createWorkspace } from "@/data/db/workspaces";
import { isRecord, isText, parseRecipe } from "@/domain/parse";
import { toSaved } from "@/domain/saved";

let migrating: Promise<void> | undefined;

/** Once per page: two runs at the same time would each create a Default. */
export const migrate = () =>
  (migrating ??= (
    navigator.locks ? navigator.locks.request("studio-migrate", moveLegacy) : moveLegacy()
  ).catch((e: unknown) => {
    migrating = undefined; // a reload tries again
    throw e;
  }));

const parsed = (text: string | null): unknown => (text ? JSON.parse(text) : null);

async function moveLegacy() {
  const draft = localStorage.getItem("studio.recipe");
  const jobs = localStorage.getItem("studio.jobs");
  if (!draft && !jobs && !(await db.renders.count()) && !(await db.characters.count())) return;
  const old = (await db.workspaces.toArray()).find((w) => w.name === "Default" && w.key); // an earlier run that stopped halfway
  const space = old?.key
    ? { id: old.id, key: await importKey(old.key) }
    : await createWorkspace("Default", "");
  // One render at a time, each moved in its own transaction: a library can be larger than memory, and an interrupted run resumes.
  for (const id of await db.renders.toCollection().primaryKeys()) {
    const legacy = await db.renders.get(id);
    if (!legacy) continue;
    const { image, thumb, ...r } = legacy;
    await putShot(space, r, image, thumb);
    await db.renders.delete(id);
  }
  for (const c of await db.characters.toArray()) {
    const saved = toSaved(c);
    if (saved) await putSaved(space, saved);
    await db.characters.delete(c.id);
  }
  if (draft) {
    await saveDraft(space, parseRecipe(parsed(draft)));
    localStorage.removeItem("studio.recipe");
  }
  const list = parsed(jobs);
  if (Array.isArray(list)) {
    for (const e of list as unknown[]) {
      if (isText(e)) await addPending(space, e, {});
      else if (isRecord(e) && isText(e.id)) {
        const { id, ...meta } = e;
        await addPending(space, id, meta);
      }
    }
    localStorage.removeItem("studio.jobs");
  }
}
