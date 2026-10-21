// The open workspace, and what has been decrypted from it. Closing it forgets all of that, so a closed
// workspace leaves nothing readable in memory.
import { createContext, useContext, useEffect, useState } from "react";

import { unsealJson } from "@/data/crypto";
import type { Row } from "@/data/db/schema";

export type Space = { id: string; key: CryptoKey };

export const SpaceContext = createContext<Space | null>(null);
export function useSpace() {
  const space = useContext(SpaceContext);
  if (!space) throw new Error("useSpace outside an open workspace");
  return space;
}

// Bumped by closeSpace: a decrypt that finishes after the workspace closed must not refill the caches.
let generation = 0;
export const currentGeneration = () => generation;

/** Sealed rows, decrypted once per version of each row. */
const unsealed = new Map<string, { iv: string; value: unknown }>();
/** The last few full images: the stage and the viewer show the same one, and browsing back and forth should not wait on IndexedDB. */
export const images = new Map<string, Blob>();
/** Thumbnail object URLs, kept while the workspace is open: the grid remounts often. The promise is cached so each is decrypted once. */
export const thumbs = new Map<string, Promise<string>>();

export function closeSpace() {
  generation++;
  unsealed.clear();
  images.clear();
  for (const p of thumbs.values())
    p.then(
      (url) => URL.revokeObjectURL(url),
      () => {},
    );
  thumbs.clear();
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Rows of this workspace, decrypted; undefined until they are. */
export function useUnsealed(rows: Row[] | undefined): unknown[] | undefined {
  const space = useSpace();
  const [out, setOut] = useState<unknown[]>();
  useEffect(() => {
    if (!rows) return;
    let live = true;
    const read = async (row: Row) => {
      const iv = hex(row.sealed.iv); // every write seals with a new iv
      const hit = unsealed.get(row.id);
      if (hit?.iv === iv) return hit.value;
      const gen = generation;
      const value = await unsealJson<unknown>(space.key, row.sealed);
      if (gen === generation) unsealed.set(row.id, { iv, value });
      return value;
    };
    Promise.all(rows.map(read)).then(
      (v) => live && setOut(v),
      () => {}, // a row rewritten while it was read: the live query brings the new one
    );
    return () => {
      live = false;
    };
  }, [rows, space]);
  return out;
}
