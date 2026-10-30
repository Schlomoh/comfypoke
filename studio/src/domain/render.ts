// A render as the device keeps it: the settings it was sent with, how long it took, and what the person
// added to it later. An upscale or an edit is a render of its own that links back to its source.
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
  reference?: boolean; // made with a face reference photo
};

export type Upscale = { megapixels: number; prompt: string; denoise: number }; // prompt "" means no retouch
/** A repaint of part of an image: what was masked by name (besides what was painted), what it became, and with whose face. */
export type Edit = { target: string; prompt: string; face?: string };

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
  source?: string; // an upscale or an edit: the render it was made from
  upscale?: Upscale;
  edit?: Edit;
};

// What the server does not know about a job: the recipe behind a render, the render behind an upscale,
// and whether a render should be upscaled as soon as it is stored.
export type JobMeta = {
  recipe?: Recipe;
  characterName?: string;
  upscaleOf?: Render;
  upscale?: Upscale;
  editOf?: Render;
  edit?: Edit;
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
