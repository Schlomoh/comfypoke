// Workspaces: each its own data key, kept raw or sealed with a password.
import { Dexie } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";

import { exportKey, importKey, lock, newKey, unlock } from "@/data/crypto";
import { db, type Workspace } from "@/data/db/schema";
import { closeSpace, type Space } from "@/data/db/space";

const guard = async (key: CryptoKey, password: string) =>
  password
    ? { lock: await lock(key, password), key: undefined }
    : { key: await exportKey(key), lock: undefined };

export async function createWorkspace(name: string, password: string): Promise<Space> {
  const key = await newKey();
  const id = crypto.randomUUID();
  await db.workspaces.add({
    id,
    name,
    createdAt: Date.now(),
    opened: Date.now(),
    ...(await guard(key, password)),
  });
  return { id, key };
}

const keyOf = async (w: Workspace, password: string) => {
  if (w.lock) return unlock(w.lock, password);
  if (!w.key) throw new Error("This workspace has no key.");
  return importKey(w.key);
};

/** Throws WrongPassword for a protected workspace and the wrong password. */
export async function openWorkspace(w: Workspace, password = ""): Promise<Space> {
  const key = await keyOf(w, password);
  await db.workspaces.update(w.id, { opened: Date.now() });
  return { id: w.id, key };
}

/** Sets, changes or (with "") removes the password. The data key stays, so nothing is re-encrypted. */
export const setPassword = async (space: Space, password: string) =>
  db.workspaces.update(space.id, await guard(space.key, password));
export const renameWorkspace = (id: string, name: string) => db.workspaces.update(id, { name });

export async function deleteWorkspace(id: string) {
  await db.transaction(
    "rw",
    [db.workspaces, db.shots, db.thumbs, db.images, db.chars, db.drafts, db.pending],
    async () => {
      const shots = await db.shots.where("ws").equals(id).primaryKeys();
      await Promise.all([
        db.thumbs.bulkDelete(shots),
        db.images.bulkDelete(shots),
        db.shots.bulkDelete(shots),
      ]);
      await Promise.all([
        db.chars.where("ws").equals(id).delete(),
        db.pending.where("ws").equals(id).delete(),
      ]);
      await Promise.all([db.drafts.delete(id), db.workspaces.delete(id)]);
    },
  );
}

/** The deep purge. Without inputs: every generated image in every workspace (protected ones too:
 *  deleting needs no key) and every job in flight. With inputs: the whole database and the app's
 *  settings, so the next load starts as a new device. Returns the ids of the jobs that were in
 *  flight, for the server to drop. The browser frees the space; it is not a secure erase. */
export async function purge(inputs: boolean) {
  const jobs = await db.pending.toCollection().primaryKeys();
  closeSpace();
  if (inputs) {
    db.close();
    await Dexie.delete("studio");
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("studio.")) localStorage.removeItem(k);
    } catch {
      // storage blocked: nothing of ours is in it then
    }
  } else {
    await db.transaction("rw", [db.shots, db.thumbs, db.images, db.pending, db.renders], () =>
      Promise.all([
        db.shots.clear(),
        db.thumbs.clear(),
        db.images.clear(),
        db.pending.clear(),
        db.renders.clear(),
      ]),
    );
    window.dispatchEvent(new Event("studio-purged")); // job cards still holding an image let go of it
  }
  return jobs;
}

export const useWorkspaces = () => useLiveQuery(() => db.workspaces.toArray(), []);
export const useWorkspace = (id: string) => useLiveQuery(() => db.workspaces.get(id), [id]);

/** Images per workspace, for the start screen. */
export const useImageCounts = () =>
  useLiveQuery(async () => {
    const counts = new Map<string, number>();
    for (const ws of (await db.shots.orderBy("ws").keys()) as string[])
      counts.set(ws, (counts.get(ws) ?? 0) + 1);
    return counts;
  }, []);
export const useImageCount = (ws?: string) =>
  useLiveQuery(() => (ws ? db.shots.where("ws").equals(ws).count() : db.shots.count()), [ws]) ?? 0;
