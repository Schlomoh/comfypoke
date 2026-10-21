// How things are written on screen and in file names.
import type { Render } from "@/domain/render";

export const shortName = (file: string) => file.replace(/\.safetensors$/, "");

type Described = {
  unet?: string;
  model?: string;
  width: number;
  height: number;
  seed: number;
  steps?: number;
  cfg?: number;
};
// unet, steps and cfg are missing on renders saved before the model panel existed
export const describe = (p: Described) =>
  [
    p.unet ? shortName(p.unet) : p.model,
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
export const fileName = (r: Render) =>
  `studio-${r.characterName ? `${safe(r.characterName)}-` : ""}${r.seed}${r.upscale ? "-up" : ""}`;

/** The middle value: a cold boot skews a mean, not a median. */
export const median = (xs: readonly number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
