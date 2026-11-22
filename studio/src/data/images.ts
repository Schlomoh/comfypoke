// Each image goes to the studio once: it is hashed here, uploaded only when the studio may not have it, and from
// then on sent as {ref}. The studio keeps them in memory, so after it restarts a reference fails with Gone;
// `withImages` then forgets what was sent and runs the request once more, uploading again.
import { api, Gone, type ImageRef } from "@/data/api";

const sent = new Set<string>(); // hashes the studio has been sent this session

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function imageRef(png: Blob): Promise<ImageRef> {
  const ref = await sha256(png);
  if (!sent.has(ref)) {
    await api.putImage(png);
    sent.add(ref);
  }
  return { ref };
}

/** Runs a request that refers to images, once more after the studio lost them. */
export async function withImages<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (!(e instanceof Gone)) throw e;
    sent.clear();
    return send();
  }
}
