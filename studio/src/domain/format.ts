// How things are written on screen and in file names.
import type { Render } from "@/domain/render";

export const shortName = (file: string) => file.replace(/\.(safetensors|gguf)$/, "");

/** What precision and packing a file name says, which a person does not need to read: bf16, fp8_e4m3fn, q8_0. */
const PACKING = /^(bf16|fp16|fp32|fp8|fp4|e4m3fn|e5m2|scaled|q\d(_\w+)?|gguf|pruned|ema|nf4|int8|mixed)$/i;

/** A model file as a name to read: "krea2_turbo_bf16.safetensors" is "Krea2 Turbo". The file stays in the record. */
export function modelName(file: string) {
  const words = shortName(file.split("/").at(-1) ?? file)
    .replace(/[_-]q\d+(_[a-z0-9]+)*$/i, "") // a GGUF quantization: Q8_0, Q4_K_M
    .split(/[_\-\s]+/)
    .filter((w) => w && !PACKING.test(w));
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : shortName(file);
}

type Described = {
  unet?: string;
  model?: string;
  width: number;
  height: number;
  seed: number;
  steps?: number;
  cfg?: number;
  uploaded?: string;
};
// unet, steps and cfg are missing on renders saved before the model panel existed
export const describe = (p: Described) =>
  p.uploaded
    ? `photo · ${p.width}×${p.height}`
    : [
        p.unet ? modelName(p.unet) : p.model,
        `${p.width}×${p.height}`,
        p.steps && `${p.steps} st`,
        p.cfg && `cfg ${p.cfg}`,
        `seed ${p.seed}`,
      ]
        .filter(Boolean)
        .join(" · ");

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const duration = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

const safe = (name: string) => name.replace(/[^\w-]+/g, "_").slice(0, 60);
// a photo by its own name and its id: photos have no seed to tell them apart
export const fileName = (r: Render) =>
  r.uploaded
    ? `photo-${safe(r.uploaded.replace(/\.[^.]+$/, ""))}-${r.id.slice(0, 8)}${r.upscale ? "-up" : ""}`
    : `studio-${r.characterName ? `${safe(r.characterName)}-` : ""}${r.seed}${r.upscale ? "-up" : ""}`;

/** The middle value: a cold boot skews a mean, not a median. */
export const median = (xs: readonly number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
