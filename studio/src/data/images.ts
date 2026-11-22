// Images cross to the GPU sealed with the workspace's transport key (data/crypto.ts, comfy_modal/seal.py): the
// studio in between relays ciphertext and never holds a key that opens it. Each request carries the key wrapped
// for this deploy's worker; after a deploy the studio answers Stale, and the new public key is fetched.
//
// Each image goes to the studio once: it is hashed here, sealed and uploaded only when the studio may not have it,
// and from then on sent as {ref}. The studio keeps them in memory, so after it restarts a reference fails with
// Gone; `withImages` then forgets what was sent and runs the request once more, uploading again.
import { api, Gone, Stale, type ImageRef, type WrappedKey } from "@/data/api";
import { fromBase64, sealWire, toBase64, transportKey, unsealWire, wrapFor } from "@/data/crypto";
import type { Space } from "@/data/db/space";

/** What a request needs to send images: the key they are sealed with, the same wrapped for the worker, and the
 * hashes of the images already uploaded under it, by their studio refs. */
export type Transport = { key: CryptoKey; wire: WrappedKey; sent: Map<string, string> };

let transports = new WeakMap<CryptoKey, Promise<Transport>>(); // workspace key: its transport for this deploy
let server: Promise<{ kid: string; spki: string }> | undefined; // the worker's public key

function transportOf(space: Space) {
  let t = transports.get(space.key);
  if (!t) {
    t = (async () => {
      const pub = await (server ??= api.transport());
      const key = await transportKey(space.key, pub.kid);
      return {
        key,
        wire: { kid: pub.kid, key: await wrapFor(pub.spki, key) },
        sent: new Map<string, string>(),
      };
    })();
    t.catch(() => forget()); // a failed fetch is tried again next time
    transports.set(space.key, t);
  }
  return t;
}

function forget() {
  transports = new WeakMap();
  server = undefined;
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The PNG's own size: a retouch's VAE crops to its grid, so the server's estimate can be a few pixels off. */
export async function pngSize(blob: Blob) {
  const head = new DataView(await blob.slice(16, 24).arrayBuffer());
  return { width: head.getUint32(0), height: head.getUint32(4) };
}

const isPng = async (blob: Blob) => new Uint8Array(await blob.slice(0, 1).arrayBuffer())[0] === 0x89;

/** A PNG (or a JPEG face photo) as the studio's reference to its sealed copy. */
export async function imageRef(t: Transport, image: Blob): Promise<ImageRef> {
  const hash = await sha256(image);
  let ref = t.sent.get(hash);
  if (!ref) {
    const sealed = new Blob([await sealWire(t.key, await image.arrayBuffer())], {
      type: "application/octet-stream",
    });
    ({ ref } = await api.putImage(sealed, (await isPng(image)) ? await pngSize(image) : undefined));
    t.sent.set(hash, ref);
  }
  return { ref };
}

/** Runs a request that sends images, once more after the studio lost them or the worker's key changed. */
export async function withImages<T>(space: Space, send: (t: Transport) => Promise<T>): Promise<T> {
  try {
    return await send(await transportOf(space));
  } catch (e) {
    if (!(e instanceof Gone || e instanceof Stale)) throw e;
    forget();
    return send(await transportOf(space));
  }
}

/** An image or preview the worker sealed (base64, as the job's events carry it), opened. */
export async function openImage(space: Space, sealed: string, type = "image/png") {
  return new Blob([await unsealWire((await transportOf(space)).key, fromBase64(sealed))], { type });
}

/** The same, as base64: what data URLs and the mask code take. */
export const openBase64 = async (space: Space, sealed: string) =>
  toBase64(await unsealWire((await transportOf(space)).key, fromBase64(sealed)));

/** A sealed JPEG preview, opened and handed on as a data URL; one that does not open is skipped, being only a preview. */
export function openPreview(space: Space, sealed: string, show: (url: string) => void) {
  openBase64(space, sealed).then(
    (b64) => show(`data:image/jpeg;base64,${b64}`),
    () => {},
  );
}
