// The transport helpers, and that they open what comfy_modal/seal.py seals (tests/seal_vectors.json).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  frameHeader,
  fromBase64,
  guard,
  keysOf,
  kidOf,
  lock,
  rawOf,
  sealWithPassword,
  newRaw,
  openWithPassword,
  sealWire,
  toBase64,
  transportKey,
  unlock,
  unsealJson,
  unsealWire,
  WrongPassword,
  wrapFor,
} from "@/data/crypto";

const vectors = JSON.parse(
  readFileSync(new URL("../../../tests/seal_vectors.json", import.meta.url), "utf8"),
) as {
  private: string;
  spki: string;
  python_sealed: string;
  python_frame_png: string;
};
const KID = "f0437f6ba51fad97"; // comfy_modal/seal.kid(vectors.spki)
const fixedRaw = () => new Uint8Array(Array(32).keys()).buffer;
const fixedKey = async () => (await keysOf(fixedRaw())).key;
const exportKey = (k: CryptoKey) => crypto.subtle.exportKey("raw", k);
const derive = async (raw: ArrayBuffer, kid: string) =>
  toBase64(await exportKey(await transportKey((await keysOf(raw)).base, kid)));
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

describe("transport crypto", () => {
  it("base64 round-trips bytes of every value, past one chunk", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("opens what Python sealed", async () => {
    expect(text(await unsealWire(await fixedKey(), fromBase64(vectors.python_sealed)))).toBe(
      "sealed by python",
    );
  });

  it("opens a frame Python sealed only as what its header says it is", async () => {
    const wire = fromBase64(vectors.python_frame_png);
    expect(text(await unsealWire(await fixedKey(), wire, frameHeader("png")))).toBe("png framed by python");
    await expect(unsealWire(await fixedKey(), wire, frameHeader("preview"))).rejects.toThrow();
    await expect(unsealWire(await fixedKey(), wire)).rejects.toThrow();
  });

  it("computes a key's id as the studio does", async () => {
    const id = await kidOf(vectors.spki);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).toBe(KID);
  });

  it("seals with a new iv each time, and refuses a changed byte", async () => {
    const { key } = await keysOf(newRaw());
    const data = new TextEncoder().encode("picture");
    const a = await sealWire(key, data);
    expect(toBase64(a)).not.toBe(toBase64(await sealWire(key, data)));
    expect(text(await unsealWire(key, a))).toBe("picture");
    a[a.length - 1] ^= 1;
    await expect(unsealWire(key, a)).rejects.toThrow();
  });

  it("derives one transport key per workspace key and deploy, not the key itself", async () => {
    const dataKey = newRaw();
    const raw = await derive(dataKey, "a");
    expect(await derive(dataKey, "a")).toBe(raw);
    expect(raw).not.toBe(toBase64(dataKey));
    expect(await derive(newRaw(), "a")).not.toBe(raw);
    expect(await derive(dataKey, "b")).not.toBe(raw);
  });

  it("keeps the workspace's keys in the page: neither can be exported", async () => {
    const { key, base } = await keysOf(newRaw());
    await expect(exportKey(key)).rejects.toThrow();
    await expect(exportKey(base)).rejects.toThrow();
  });

  it("locks the raw key with a password and gives it back only for that password", async () => {
    const raw = newRaw();
    const l = await lock(raw, "correct horse");
    expect(toBase64(await unlock(l, "correct horse"))).toBe(toBase64(raw));
    await expect(unlock(l, "wrong")).rejects.toBeInstanceOf(WrongPassword);
  });

  it("wraps a key that the holder of the private key unwraps", async () => {
    const key = await crypto.subtle.importKey("raw", fixedRaw(), "AES-GCM", true, ["encrypt", "decrypt"]);
    const oaep = { name: "RSA-OAEP", hash: "SHA-256" } as const;
    const priv = await crypto.subtle.importKey("pkcs8", fromBase64(vectors.private), oaep, false, [
      "unwrapKey",
    ]);
    const back = await crypto.subtle.unwrapKey(
      "raw",
      fromBase64(await wrapFor(vectors.spki, key)),
      priv,
      oaep,
      "AES-GCM",
      true,
      ["decrypt"],
    );
    expect(toBase64(await exportKey(back))).toBe(toBase64(await exportKey(key)));
  });
});

// Written by the code before keys became non-extractable (generateKey, exportKey, then PBKDF2 and AES-GCM over the
// raw key; a row sealed with the data key), at 1000 iterations to keep the test fast. Phones hold records like these.
const OLD = {
  password: "old phone pw",
  lock: {
    salt: "5mKGJSzS279zeHe/VWrWjA==",
    iterations: 1000,
    key: { iv: "Dj8LtDXL7R6BXu38", data: "ODc/8H9/dnv33p1nfwjQaevtit2Ccqsu+ZU1t6vOH0wk3nSEGAar+Cerccw6Xd69" },
  },
  raw: "JnZiQqZc4iAu1DXeK2V0jsI8e75lcdrC/NjVaKd8kxg=",
  row: {
    iv: "nbc7DLRfFwoU5xPA",
    data: "8jALABGnhNSOZhJv5FKaFzN+oZMNnEp3UPoWoPV8fKCQqiHR9uw+sCo/nYmJ0WveB+dnObrX",
  },
};
const oldLock = {
  salt: fromBase64(OLD.lock.salt),
  iterations: OLD.lock.iterations,
  key: { iv: fromBase64(OLD.lock.key.iv), data: fromBase64(OLD.lock.key.data).buffer },
};
const oldRow = { iv: fromBase64(OLD.row.iv), data: fromBase64(OLD.row.data).buffer };
const readRow = async (raw: ArrayBuffer) => unsealJson<{ made: string }>((await keysOf(raw)).key, oldRow);

describe("workspace keys", () => {
  it("opens what phones stored before: a raw key, and a password's lock", async () => {
    expect((await readRow(fromBase64(OLD.raw).buffer)).made).toBe("before non-extractable keys");
    expect((await readRow(await rawOf({ key: fromBase64(OLD.raw).buffer }, ""))).made).toBeTruthy();
    expect((await readRow(await rawOf({ lock: oldLock }, OLD.password))).made).toBeTruthy();
  });

  it("changes and removes a password without changing the key, and refuses a wrong current one", async () => {
    await expect(rawOf({ lock: oldLock }, "wrong")).rejects.toBeInstanceOf(WrongPassword);
    const changed = await guard(await rawOf({ lock: oldLock }, OLD.password), "new pw");
    expect(changed.key).toBeUndefined();
    await expect(rawOf(changed, OLD.password)).rejects.toBeInstanceOf(WrongPassword);
    expect((await readRow(await rawOf(changed, "new pw"))).made).toBeTruthy();
    const removed = await guard(await rawOf(changed, "new pw"), "");
    expect(removed.lock).toBeUndefined();
    expect((await readRow(await rawOf(removed, ""))).made).toBeTruthy();
    expect(
      (await readRow(await rawOf(await guard(await rawOf(removed, ""), "again"), "again"))).made,
    ).toBeTruthy();
  });
});

describe("password-sealed files", () => {
  it("round-trips a backup, reads as nothing without the password, and refuses the wrong one", async () => {
    const library = { version: 3, saved: [{ name: "Mara, red coat" }] };
    const sealed = await sealWithPassword(library, "long enough pw");
    expect(JSON.stringify(sealed)).not.toContain("Mara");
    expect(sealed.iterations).toBe(600_000);
    expect(await openWithPassword(sealed, "long enough pw")).toEqual(library);
    await expect(openWithPassword(sealed, "wrong")).rejects.toBeInstanceOf(WrongPassword);
    expect((await sealWithPassword(library, "long enough pw")).salt).not.toBe(sealed.salt);
  });
});
