// Saving straight into a folder on the computer, with the File System Access API. Chrome and Edge
// have it (and Chrome on Android); Safari, iOS and Firefox do not, and keep the zip and the share
// sheet. Each workspace remembers its folder; the browser asks again for write access after a restart.
import { loadImage } from "@/data/db/renders";
import { db } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { isRecord, isText } from "@/domain/parse";
import { withMetadata } from "@/domain/png";
import type { Render } from "@/domain/render";

export type Dir = FileSystemDirectoryHandle & {
  queryPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
};
const picker = (
  window as unknown as { showDirectoryPicker?: (o: { id: string; mode: "readwrite" }) => Promise<Dir> }
).showDirectoryPicker?.bind(window);

export const canPickFolder = !!picker && window.isSecureContext;

export async function chooseFolder(space: Space) {
  if (!picker) throw new Error("This browser cannot save into a folder.");
  const dir = await picker({ id: "studio", mode: "readwrite" }); // the id makes the picker open where it was last time
  await db.workspaces.update(space.id, { folder: dir });
  return dir;
}

export const forgetFolder = (space: Space) => db.workspaces.update(space.id, { folder: undefined });

/** The workspace's folder, writable, or null: none chosen, access refused, or the folder is gone. Needs a click or key press. */
export async function folderOf(space: Space) {
  const dir = (await db.workspaces.get(space.id))?.folder as Dir | undefined;
  if (!dir) return null;
  if (
    (await dir.queryPermission({ mode: "readwrite" })) !== "granted" &&
    (await dir.requestPermission({ mode: "readwrite" })) !== "granted"
  )
    return null;
  try {
    await dir.getFileHandle("studio-metadata.json"); // a moved or deleted folder fails here, a missing file does not
  } catch (e) {
    if (
      !(e instanceof DOMException) ||
      e.name !== "NotFoundError" ||
      !(await dir
        .keys()
        .next()
        .then(
          () => true,
          () => false,
        ))
    )
      return null;
  }
  return dir;
}

// An empty file is a write that failed halfway, not a saved image.
const exists = (dir: Dir, name: string) =>
  dir.getFileHandle(name).then(
    async (h) => (await h.getFile()).size > 0,
    () => false,
  );

async function write(dir: Dir, name: string, data: Blob | string) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try {
    await w.write(data);
    await w.close();
  } catch (e) {
    await w.abort().catch(() => {});
    await dir.removeEntry(name).catch(() => {}); // getFileHandle already created it, empty
    throw e;
  }
}

// The render's id in the name: two renders with the same seed are different files, and a second
// run over the same images finds them already there and skips them.
export const folderName = (r: Render) =>
  `studio-${r.characterName ? `${r.characterName.replace(/[^\w-]+/g, "_").slice(0, 60)}-` : ""}${r.seed}-${r.id.slice(0, 8)}.png`;

let queue: Promise<unknown> = Promise.resolve();

/** Writes the renders not yet in the folder and merges their settings into studio-metadata.json there. Returns how many were new.
 *  Saves run one after another: two at once would each rewrite the metadata from the same old copy. */
export function saveToFolder(
  space: Space,
  dir: Dir,
  renders: Render[],
  onProgress: (done: number) => void = () => {},
) {
  const run = queue.then(() => writeAll(space, dir, renders, onProgress));
  queue = run.catch(() => {});
  return run;
}

async function writeAll(space: Space, dir: Dir, renders: Render[], onProgress: (done: number) => void) {
  let added = 0;
  const meta = new Map<string, unknown>();
  try {
    const old: unknown = JSON.parse(
      await (await (await dir.getFileHandle("studio-metadata.json")).getFile()).text(),
    );
    for (const m of Array.isArray(old) ? (old as unknown[]) : [])
      if (isRecord(m) && isText(m.file)) meta.set(m.file, m);
  } catch {
    // no metadata file yet, or one edited into something else: start a new one
  }
  for (const [i, r] of renders.entries()) {
    const file = folderName(r);
    if (!(await exists(dir, file))) {
      await write(dir, file, await withMetadata(await loadImage(space, r.id), r));
      added++;
    }
    const { id: _, recipe: __, ...settings } = r;
    meta.set(file, { file, ...settings, createdAt: new Date(r.createdAt).toISOString() });
    onProgress(i + 1);
  }
  await write(dir, "studio-metadata.json", JSON.stringify([...meta.values()], null, 2));
  return added;
}
