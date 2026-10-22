// A workspace's renders: the record, a thumbnail and the full image, each sealed and stored apart so
// the grid never reads a full image.
import { Dexie } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

import { sealBlob, sealJson, unsealBlob, unsealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import { currentGeneration, images, thumbs, useSpace, useUnsealed, type Space } from "@/data/db/space";
import type { Render } from "@/domain/render";

export async function putShot(space: Space, r: Render, image: Blob, thumb: Blob) {
  const [sealed, t, i] = await Promise.all([
    sealJson(space.key, r),
    sealBlob(space.key, thumb),
    sealBlob(space.key, image),
  ]);
  await db.transaction("rw", [db.workspaces, db.shots, db.thumbs, db.images], async () => {
    if (!(await db.workspaces.get(space.id))) return; // deleted while this render was finishing
    await db.shots.put({ id: r.id, ws: space.id, createdAt: r.createdAt, sealed });
    await db.thumbs.put({ id: r.id, sealed: t });
    await db.images.put({ id: r.id, sealed: i });
  });
}

async function thumbnail(blob: Blob, short = 360): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, short / Math.min(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
}

export async function saveRender(space: Space, r: Render, image: Blob) {
  await putShot(space, r, image, await thumbnail(image));
  // Safari clears site storage after seven days without a visit unless it grants persistence,
  // which it does for Home Screen apps; asking costs nothing elsewhere.
  navigator.storage?.persist?.().catch(() => {});
}

let updates = Promise.resolve();

/** Changes a stored render. Changes run one after another, each from the stored version, so two quick ★ taps cancel out. */
export function updateRender(space: Space, id: string, change: (r: Render) => Render) {
  const run = async () => {
    const row = await db.shots.get(id);
    if (!row) return;
    const next = change(await unsealJson<Render>(space.key, row.sealed));
    await db.shots.update(id, { sealed: await sealJson(space.key, next) });
  };
  updates = updates.then(run).catch(() => {});
  return updates;
}

export const toggleBest = (space: Space, r: Render) =>
  updateRender(space, r.id, (s) => ({ ...s, best: !s.best }));

export async function removeRender(id: string) {
  await db.transaction("rw", db.shots, db.thumbs, db.images, () =>
    Promise.all([db.shots.delete(id), db.thumbs.delete(id), db.images.delete(id)]),
  );
}

/** This workspace's renders, newest first; undefined while they are read. */
export function useRenders() {
  const space = useSpace();
  const rows = useLiveQuery(
    () =>
      db.shots
        .where("[ws+createdAt]")
        .between([space.id, Dexie.minKey], [space.id, Dexie.maxKey])
        .reverse()
        .toArray(),
    [space.id],
  );
  return useUnsealed(rows) as Render[] | undefined;
}

export async function loadImage(space: Space, id: string) {
  let blob = images.get(id);
  if (!blob) {
    const gen = currentGeneration();
    const row = await db.images.get(id);
    if (!row) throw new Error("This image is no longer on this device.");
    blob = await unsealBlob(space.key, row.sealed, "image/png");
    if (gen !== currentGeneration()) return blob;
  }
  images.delete(id);
  images.set(id, blob);
  const oldest = images.keys().next();
  if (images.size > 8 && !oldest.done) images.delete(oldest.value);
  return blob;
}

/** A render's full image, keeping the previous one on screen while the next is decrypted. */
export function useImage(id?: string) {
  const space = useSpace();
  const [img, setImg] = useState<Blob>();
  // with no image asked for, the last one is let go: the next one shown starts blank, not as the one
  // before it (the stage between a job and the render it became)
  if (!id && img) setImg(undefined);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadImage(space, id).then(
      (b) => live && setImg(b),
      () => {}, // deleted while it loaded
    );
    return () => {
      live = false;
    };
  }, [space, id]);
  return id ? img : undefined;
}

async function thumbUrl(space: Space, id: string) {
  const gen = currentGeneration();
  const row = await db.thumbs.get(id);
  if (!row) throw new Error("gone");
  const url = URL.createObjectURL(await unsealBlob(space.key, row.sealed, "image/jpeg"));
  if (gen !== currentGeneration()) URL.revokeObjectURL(url); // closed meanwhile; closeSpace already let go of this promise
  return url;
}

export function useThumb(id: string) {
  const space = useSpace();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    let p = thumbs.get(id);
    if (!p) {
      p = thumbUrl(space, id);
      thumbs.set(id, p);
      p.catch(() => thumbs.delete(id)); // deleted while it loaded
    }
    p.then(
      (u) => live && setUrl(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [space, id]);
  return url;
}

/** An object URL for a blob, revoked when the blob changes or the component goes: a URL keeps its blob in memory. */
export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    // oxlint-disable-next-line react/set-state-in-effect -- the URL is a resource this effect owns and revokes
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return blob ? url : undefined;
}
