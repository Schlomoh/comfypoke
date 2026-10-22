// What is being built: the people in the picture and its scene as rows of phrases, the model settings
// and the LoRAs. A phrase is one idea; its versions are alternatives, each rendered separately.
import type { PersonRow, SceneRow } from "@/domain/rows";

export type Phrase = { id: string; t: string; on: boolean; versions: string[] };
export type Side = "left" | "center" | "right";
export type Depth = "auto" | "front" | "back";
export const SIDES: Side[] = ["left", "center", "right"];
export const MAX_PEOPLE = 5;
// savedId links a person to a saved character (a scene to a saved scene); null is a new one
export type Person = {
  id: string;
  name: string;
  savedId: string | null;
  side: Side[];
  depth: Depth;
} & Record<PersonRow, Phrase[]>;
export type Scene = { name: string; savedId: string | null } & Record<SceneRow, Phrase[]>;
export type StackLora = { name: string; strength: number; on: boolean };

export const phrase = (t: string, versions: string[] = []): Phrase => ({
  id: crypto.randomUUID(),
  t,
  on: true,
  versions,
});
export const newPerson = (name: string): Person => ({
  id: crypto.randomUUID(),
  name,
  savedId: null,
  side: [],
  depth: "auto",
  who: [],
  look: [],
  wear: [],
  doing: [],
});
const emptyScene = (): Scene => ({ name: "", savedId: null, where: [], shot: [], style: [], extra: [] });

export const ASPECTS = [
  { label: "1:1", w: 1, h: 1 },
  { label: "4:5", w: 4, h: 5 },
  { label: "2:3", w: 2, h: 3 },
  { label: "9:16", w: 9, h: 16 },
  { label: "3:2", w: 3, h: 2 },
  { label: "16:9", w: 16, h: 9 },
] as const;
export const MEGAPIXELS = [0.25, 0.5, 1, 1.5, 2] as const;

/** Pixels for an aspect at a megapixel count as ComfyUI counts them (1024×1024 each), sides in
 *  multiples of 16 within what the server accepts. At 1 MP this is the 1024×1024 the models train at. */
const side = (v: number) => Math.max(256, Math.min(2048, Math.round(v / 16) * 16));

export function size(aspect: string, mp: number) {
  const a = ASPECTS.find((x) => x.label === aspect) ?? ASPECTS[0];
  const w = Math.sqrt((mp * 1024 * 1024 * a.w) / a.h);
  return { width: side(w), height: side((w * a.h) / a.w) };
}

/** The nearest aspect and megapixel setting for a render's pixel size, for Reuse of renders without a recipe. */
export function fromSize(width: number, height: number) {
  const ratio = Math.log(width / height);
  const aspect = ASPECTS.toSorted(
    (x, y) => Math.abs(Math.log(x.w / x.h) - ratio) - Math.abs(Math.log(y.w / y.h) - ratio),
  )[0];
  const mp = (width * height) / (1024 * 1024);
  return { aspect: aspect.label, mp: MEGAPIXELS.toSorted((x, y) => Math.abs(x - mp) - Math.abs(y - mp))[0] };
}

export type Recipe = {
  cast: Person[];
  scene: Scene;
  unet: string;
  family: string | null; // null: the family the model list suggests for unet
  negative: string;
  aspect: string;
  mp: number;
  seed: number | null; // null: a new random seed per render
  steps: number | null; // null: the model's default
  cfg: number | null;
  loras: StackLora[];
  count: number; // seeds: every version renders once per seed
  sameSeed: boolean; // the versions share their seeds, so only the changed phrase differs between them
  stopAfter: boolean; // the GPU stops once the queue this sends is done
  upscale: UpscaleSettings;
};
// auto: every new render is upscaled once it is stored; prompt "" upscales without a retouch
export type UpscaleSettings = { auto: boolean; megapixels: number; prompt: string; denoise: number };

export const EMPTY: Recipe = {
  cast: [{ ...newPerson("Person 1"), id: "p1" }],
  scene: emptyScene(),
  unet: "krea2_turbo_bf16.safetensors",
  family: null,
  negative: "blurry, washed out, plastic skin",
  aspect: "4:5",
  mp: 1,
  seed: null,
  steps: null,
  cfg: null,
  loras: [],
  count: 1,
  sameSeed: true,
  stopAfter: false,
  upscale: { auto: false, megapixels: 4, prompt: "", denoise: 0.3 },
};

/** Renders and recipes from before the model list knew only "turbo" and "raw". */
export const legacyUnet = (model?: string) =>
  model === "raw" ? "krea2_raw_bf16.safetensors" : "krea2_turbo_bf16.safetensors";
