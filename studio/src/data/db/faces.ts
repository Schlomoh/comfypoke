// Face reference photos: what a character looks like, kept sealed with the workspace like its renders.
// A person or saved character points at one by id; renders send it along for the head swap (graphs._headswap).
import { useEffect, useState } from "react";

import { sealBlob, unsealBlob } from "@/data/crypto";
import { db } from "@/data/db/schema";
import { useSpace, type Space } from "@/data/db/space";

const LONG_SIDE = 768; // the server scales it to 384 square anyway; this keeps a crop's detail and the request small

/** A photo as stored: upright, at most LONG_SIDE on its long side, JPEG. */
async function shrink(file: Blob) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

export async function addFace(space: Space, file: Blob) {
  const id = crypto.randomUUID();
  await db.faces.put({ id, ws: space.id, sealed: await sealBlob(space.key, await shrink(file)) });
  return id;
}

export async function loadFace(space: Space, id: string) {
  const row = await db.faces.get(id);
  if (!row || row.ws !== space.id) throw new Error("This face photo is no longer on this device.");
  return unsealBlob(space.key, row.sealed, "image/jpeg");
}

/** Deletes a face photo unless one of `kept` still points at it. Returns what puts it back as it was, for Undo. */
export async function dropFace(id: string, kept: readonly (string | null | undefined)[]) {
  if (kept.includes(id)) return () => {};
  const row = await db.faces.get(id);
  await db.faces.delete(id);
  return () => void (row && db.faces.put(row));
}

/** A face photo to show, or undefined while it is read or when it is gone. */
export function useFace(id: string | null) {
  const space = useSpace();
  const [loaded, setLoaded] = useState<{ id: string; blob?: Blob }>();
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadFace(space, id).then(
      (blob) => live && setLoaded({ id, blob }),
      () => live && setLoaded({ id }),
    );
    return () => {
      live = false;
    };
  }, [space, id]);
  return id && loaded?.id === id ? loaded.blob : undefined; // never the previous photo while the next one loads
}
