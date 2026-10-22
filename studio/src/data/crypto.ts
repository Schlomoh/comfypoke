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
