// The transport helpers, and that they open what comfy_modal/seal.py seals (tests/seal_vectors.json).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  exportKey,
  fromBase64,
  importKey,
  newKey,
  sealWire,
  toBase64,
  transportKey,
  unsealWire,
  wrapFor,
} from "@/data/crypto";

const vectors = JSON.parse(
  readFileSync(new URL("../../../tests/seal_vectors.json", import.meta.url), "utf8"),
) as {
  private: string;
  spki: string;
  python_sealed: string;
};
const fixedKey = () => importKey(new Uint8Array(Array(32).keys()).buffer);
const derive = async (k: CryptoKey, kid: string) => toBase64(await exportKey(await transportKey(k, kid)));
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

  it("seals with a new iv each time, and refuses a changed byte", async () => {
    const key = await newKey();
    const data = new TextEncoder().encode("picture");
    const a = await sealWire(key, data);
    expect(toBase64(a)).not.toBe(toBase64(await sealWire(key, data)));
    expect(text(await unsealWire(key, a))).toBe("picture");
    a[a.length - 1] ^= 1;
    await expect(unsealWire(key, a)).rejects.toThrow();
  });

  it("derives one transport key per workspace key and deploy, not the key itself", async () => {
    const dataKey = await newKey();
    const raw = await derive(dataKey, "a");
    expect(await derive(dataKey, "a")).toBe(raw);
    expect(raw).not.toBe(toBase64(await exportKey(dataKey)));
    expect(await derive(await newKey(), "a")).not.toBe(raw);
    expect(await derive(dataKey, "b")).not.toBe(raw);
  });

  it("wraps a key that the holder of the private key unwraps", async () => {
    const key = await fixedKey();
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
