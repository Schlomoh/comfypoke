// Metadata written into a PNG on its way out (save, folder, zip), as tEXt chunks after IHDR:
// "parameters" in the plain-text shape most image tools read, and "studio" with the whole record
// as JSON. The copy stored on the device stays as the worker made it.
import type { Render } from "./db";

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function textChunk(key: string, value: string) {
  // tEXt is what tools read and it is Latin-1, so anything outside printable ASCII is written as a
  // \uXXXX escape: valid inside the JSON chunk, and readable enough in the plain-text one.
  const latin = (s: string) =>
    Uint8Array.from(s.replace(/[^\x20-\x7e\n]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`), (ch) => ch.charCodeAt(0));
  const data = new Uint8Array([...latin(key), 0, ...latin(value)]);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The readable summary: prompt, then the settings on one line. */
export function parameters(r: Render) {
  const loras = (r.loras ?? []).map((l) => `${l.name}:${l.strength}`).join(", ");
  const settings = [
    r.steps && `Steps: ${r.steps}`,
    r.cfg && `CFG scale: ${r.cfg}`,
    `Seed: ${r.seed}`,
    `Size: ${r.width}x${r.height}`,
    `Model: ${r.unet ?? r.model}`,
    r.family && `Family: ${r.family}`,
    loras && `LoRAs: ${loras}`,
    r.upscale && `Upscaled: SeedVR2 ${r.upscale.megapixels} MP${r.upscale.prompt ? `, touch-up "${r.upscale.prompt}" at ${r.upscale.denoise}` : ""}`,
  ].filter(Boolean);
  return `${r.prompt}${r.negative ? `\nNegative prompt: ${r.negative}` : ""}\n${settings.join(", ")}`;
}

export async function withMetadata(png: Blob, r: Render) {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const ihdrEnd = 8 + 8 + new DataView(bytes.buffer).getUint32(8) + 4; // signature, IHDR length+type, data, crc
  const { recipe: _, ...record } = r; // the UI's state at send time is noise in a file
  return new Blob([bytes.subarray(0, ihdrEnd), textChunk("parameters", parameters(r)), textChunk("studio", JSON.stringify(record)), bytes.subarray(ihdrEnd)], {
    type: "image/png",
  });
}
