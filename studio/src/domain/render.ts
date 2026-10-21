// A render as the device keeps it: the settings it was sent with, how long it took, and what the person
// added to it later. An upscale is a render of its own that links back to its source.
import type { Recipe } from "@/domain/recipe";

export type Lora = { name: string; strength: number };
export type Params = {
  unet: string; // the diffusion model file
  family: string; // which encoder, VAE and sampling it runs with
  prompt: string;
  negative: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  loras: Lora[];
};

export type Upscale = { megapixels: number; prompt: string; denoise: number }; // prompt "" means no retouch

export type Render = Params & {
  id: string;
  createdAt: number;
  seconds: number;
  recipe?: Recipe; // what the UI looked like when it was sent, for Reuse
  model?: string; // renders from before unet/family: "turbo", "raw" or "krea2-turbo"
  characterName?: string;
  best?: boolean;
  // yours to edit in the inspector; the fields above are the record of how it was made
  title?: string;
  notes?: string;
  tags?: string[];
  source?: string; // an upscale: the render it was made from
  upscale?: Upscale;
};

// What the server does not know about a job: the recipe behind a render, the render behind an upscale,
// and whether a render should be upscaled as soon as it is stored.
export type JobMeta = {
  recipe?: Recipe;
  characterName?: string;
  upscaleOf?: Render;
  upscale?: Upscale;
  then?: Upscale;
};

/** Every upscale made from these renders, and from those upscales, with the renders themselves. */
export function withUpscales(ids: Iterable<string>, all: readonly Render[]) {
  const out = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of all)
      if (r.source && out.has(r.source) && !out.has(r.id)) {
        out.add(r.id);
        grew = true;
      }
  }
  return out;
}
