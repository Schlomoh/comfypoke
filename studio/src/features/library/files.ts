// Images on their way off the device: one saved (into the workspace's folder, the share sheet or a
// download), or many as a zip.
import { Zip, ZipPassThrough, strToU8 } from "fflate";

import { loadImage } from "@/data/db/renders";
import type { Space } from "@/data/db/space";
import { canPickFolder, folderOf, saveToFolder } from "@/data/folder";
import { errorText, fileName } from "@/domain/format";
import { withMetadata } from "@/domain/png";
import type { Render } from "@/domain/render";
import { notify } from "@/ui/notify";

export async function saveImage(space: Space, r: Render) {
  try {
    const dir = canPickFolder ? await folderOf(space).catch(() => null) : null;
    // a folder that cannot be written to falls back to a plain download, so S never does nothing
    if (
      dir &&
      (await saveToFolder(space, dir, [r]).then(
        () => true,
        () => false,
      ))
    )
      return notify(`Saved to ${dir.name}`);
    const file = new File([await withMetadata(await loadImage(space, r.id), r)], `${fileName(r)}.png`, {
      type: "image/png",
    });
    if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
      // the share sheet is how a phone puts an image into its photo library; it is its own feedback
      return navigator.share({ files: [file] }).catch(() => {});
    }
    download(file);
    notify(`Downloaded ${file.name}`);
  } catch (e) {
    notify(`Could not save: ${errorText(e)}`, { bad: true });
  }
}

export function download(file: Blob & { name?: string }, name = file.name ?? "download") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // iOS may take a while to start reading a large zip
}

/** The renders as one zip: the PNGs with their metadata written in (stored, not compressed again) and metadata.json beside them. */
export async function zipRenders(space: Space, renders: Render[], onProgress: (done: number) => void) {
  const parts: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    parts.push(chunk);
  });
  const add = (name: string, data: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };
  const meta = [];
  for (const [i, r] of renders.entries()) {
    const file = `${String(i + 1).padStart(4, "0")}-${fileName(r)}.png`;
    add(file, new Uint8Array(await (await withMetadata(await loadImage(space, r.id), r)).arrayBuffer()));
    const { id: _, recipe: __, ...settings } = r;
    meta.push({ file, ...settings, createdAt: new Date(r.createdAt).toISOString() });
    onProgress(i + 1);
  }
  add("metadata.json", strToU8(JSON.stringify(meta, null, 2)));
  zip.end();
  return new Blob(parts as BlobPart[], { type: "application/zip" });
}
