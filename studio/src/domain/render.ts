// A render as the device keeps it: the settings it was sent with, how long it took, and what the person
// added to it later. An upscale or an edit is a render of its own that links back to its source.
import type { Recipe } from "@/domain/recipe";
import type { Pass } from "@/domain/setup";

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
  finish?: (Omit<Pass, "loras"> & { loras: Lora[]; denoise: number }) | null; // a second pass with another setup
  face_pass?: number | null; // the face pass's strength, when one ran
};

export type Upscale = { megapixels: number; prompt: string; denoise: number }; // prompt "" means no retouch
/** How a dressing holds the body still: its fitted mesh tight, loose, or not at all. */
export type Hold = "tight" | "loose" | "off";
/** A dressing as recorded: the hold, the setup that dressed it, and the one that finished it (a name, or from the first
 * builds true for Krea 2 Turbo) at what strength. */
export type Dress = {
  hold: Hold;
  dresser?: string;
  finish: string | boolean | null;
  strength?: number;
  who?: string; // the saved character dressed, for Keep outfit
  pieces?: string[]; // the outfit as its Wearing chips
};
/** A repaint of part of an image: what was masked by name (besides what was painted), what it became, and with whose
 * face; with `dress`, the clothes were replaced by graphs.dress rather than repainted. */
export type Edit = {
  target: string;
  prompt: string;
  face?: string;
  dress?: Dress;
  setup?: string;
  people?: EditedPerson[];
}; // setup: a repaint's, when not the image's own
/** One person of a People edit, as recorded: their name then, their saved character, the outfit they got, and whether
 * their face was redrawn. */
export type EditedPerson = { name: string; who?: string; outfit?: string[]; face: boolean };

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
  source?: string; // an upscale, an edit or a draft made big: the render it was made from
  uploaded?: string; // a photo brought in from the device, by its file name: its settings are the model edits run with
  upscale?: Upscale;
  edit?: Edit;
  draft?: boolean; // small and quick, made to be made big (state/generate.ts rerender, or an upscale)
  batch?: string; // the renders one Generate sent: compared and picked among (features/pick)
  passed?: boolean; // passed over when picking: dimmed in the library
  faceMatch?: FaceMatch; // how much its face looks like a character's face photo, once asked (domain/face.ts)
};
/** A face match as kept: against which face photo, and the score, null when either had no face. */
export type FaceMatch = { face: string; score: number | null };

/** The model an uploaded photo is repainted and dressed with: there is no render behind it to take one from. */
const UPLOAD_MODEL = { unet: "krea2_turbo_bf16.safetensors", family: "krea2", steps: 8, cfg: 1 };

/** The record of a photo brought in from the device, so it can be edited, dressed and upscaled like a render. */
export function uploadedRender(name: string, width: number, height: number): Render {
  return {
    ...UPLOAD_MODEL,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    seconds: 0,
    prompt: "",
    negative: "",
    width,
    height,
    seed: 0,
    loras: [],
    uploaded: name,
  };
}

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
  batch?: string;
  draft?: boolean;
  from?: Render; // the draft a render was made big from
  title?: string; // what the library calls it: a draft made big keeps the draft's
};

/** Every upscale and edit made from these renders, and from those, with the renders themselves. A render made big
 * from a draft is its own image and stays when the draft goes. */
export function withUpscales(ids: Iterable<string>, all: readonly Render[]) {
  const out = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of all)
      if (r.source && (r.upscale || r.edit) && out.has(r.source) && !out.has(r.id)) {
        out.add(r.id);
        grew = true;
      }
  }
  return out;
}
