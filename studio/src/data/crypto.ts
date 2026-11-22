// Every workspace has a random AES-GCM key and everything in it is sealed with that key. A
// password does not lock a screen, it seals that key: without the password the workspace's
// images, prompts and characters are ciphertext in IndexedDB, to anyone holding the device.
// Without a password the key is stored next to the data, so both kinds share one code path.

export type Sealed = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };
export type Lock = { salt: Uint8Array<ArrayBuffer>; iterations: number; key: Sealed }; // the data key, sealed with the password's key

const AES = { name: "AES-GCM", length: 256 } as const;
const ITERATIONS = 600_000; // OWASP's PBKDF2-SHA256 figure; about half a second on a phone

export const newKey = () => crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
export const exportKey = (key: CryptoKey) => crypto.subtle.exportKey("raw", key);
export const importKey = (raw: ArrayBuffer) =>
  crypto.subtle.importKey("raw", raw, AES, true, ["encrypt", "decrypt"]);

export async function seal(key: CryptoKey, data: BufferSource): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, data: await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data) };
}

export const unseal = (key: CryptoKey, s: Sealed) =>
  crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv }, key, s.data);
export const sealJson = (key: CryptoKey, value: unknown) =>
  seal(key, new TextEncoder().encode(JSON.stringify(value)));
export const unsealJson = async <T>(key: CryptoKey, s: Sealed) =>
  JSON.parse(new TextDecoder().decode(await unseal(key, s))) as T;
export const sealBlob = async (key: CryptoKey, blob: Blob) => seal(key, await blob.arrayBuffer());
export const unsealBlob = async (key: CryptoKey, s: Sealed, type: string) =>
  new Blob([await unseal(key, s)], { type });

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, AES, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function lock(dataKey: CryptoKey, password: string): Promise<Lock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt,
    iterations: ITERATIONS,
    key: await seal(await passwordKey(password, salt, ITERATIONS), await exportKey(dataKey)),
  };
}

export class WrongPassword extends Error {}

export async function unlock(l: Lock, password: string) {
  try {
    return await importKey(await unseal(await passwordKey(password, l.salt, l.iterations), l.key));
  } catch {
    throw new WrongPassword("Wrong password."); // AES-GCM refuses to decrypt with the wrong key
  }
}

// ---- images in transit (comfy_modal/seal.py) ----------------------------------------------------------------
// Images cross to the GPU worker sealed with a transport key: derived with HKDF from the workspace's key and the
// deploy's key id, so it needs no storage of its own, opens nothing in IndexedDB and changes with every deploy, and
// sent wrapped with the worker's RSA-OAEP public key, which only the worker can unwrap. A sealed image is iv then ciphertext and tag, as AES-GCM writes them.

const OAEP = { name: "RSA-OAEP", hash: "SHA-256" } as const;
export async function transportKey(dataKey: CryptoKey, kid: string) {
  const base = await crypto.subtle.importKey("raw", await exportKey(dataKey), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`comfypoke studio transport v1 ${kid}`),
    },
    base,
    AES,
    true, // extractable: it is wrapped for the worker
    ["encrypt", "decrypt"],
  );
}

/** `key` wrapped with the worker's public key (base64 SubjectPublicKeyInfo DER, from /api/transport). */
export async function wrapFor(spki: string, key: CryptoKey) {
  const pub = await crypto.subtle.importKey("spki", fromBase64(spki), OAEP, false, ["wrapKey"]);
  return toBase64(await crypto.subtle.wrapKey("raw", key, pub, OAEP));
}

export async function sealWire(key: CryptoKey, data: BufferSource) {
  const { iv, data: ct } = await seal(key, data);
  const out = new Uint8Array(iv.byteLength + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.byteLength);
  return out;
}

export const unsealWire = (key: CryptoKey, wire: Uint8Array<ArrayBuffer>) =>
  unseal(key, { iv: wire.slice(0, 12), data: wire.slice(12).buffer });

export function toBase64(data: ArrayBuffer | Uint8Array<ArrayBuffer>) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
