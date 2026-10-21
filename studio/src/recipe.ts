// What is being built: the prompt blocks, model settings and LoRAs. The chips listed here are only
// the presets a new device starts with; after that they are the user's, in IndexedDB. The working copy
// is each workspace's draft, sealed in IndexedDB like the rest of it (db.ts).
import { useEffect, useRef, useState } from "react";

export const BLOCKS = [
  { id: "subject", label: "Subject", character: true, hint: "who: age, build, origin, defining traits",
    chips: ["young adult woman", "middle-aged man", "elderly person", "athletic build", "slender build", "freckled skin"] },
  { id: "face", label: "Face & hair", character: true, hint: "eyes, hair, marks that make them recognizable",
    chips: ["short undercut hair", "long wavy auburn hair", "braided silver hair", "green eyes", "scar across the left eyebrow", "light stubble"] },
  { id: "outfit", label: "Outfit", character: true, hint: "clothing, materials, accessories",
    chips: ["worn leather armor", "tailored charcoal suit", "oversized knit sweater", "techwear jacket with straps", "flowing linen robe"] },
  { id: "pose", label: "Pose & expression", character: false, hint: "what they are doing and feeling",
    chips: ["neutral expression", "slight smile", "determined look", "looking over the shoulder", "arms crossed", "walking toward the camera"] },
  { id: "setting", label: "Setting", character: false, hint: "where, when, weather",
    chips: ["plain grey studio backdrop", "rain-soaked neon street at night", "misty pine forest", "sunlit kitchen", "desert ruins at dusk"] },
  { id: "camera", label: "Camera & light", character: false, hint: "framing, lens, lighting",
    chips: ["close-up portrait", "medium shot", "full body shot", "three-quarter view", "85mm lens, shallow depth of field", "soft overcast light", "hard rim light", "golden hour"] },
  { id: "style", label: "Style", character: false, hint: "medium and finish",
    chips: ["film photo, natural grain", "editorial photography", "digital painting", "anime illustration", "character turnaround sheet, white background"] },
  { id: "extra", label: "Extra", character: false, hint: "anything else, verbatim", chips: [] },
] as const;

export type BlockId = (typeof BLOCKS)[number]["id"];
export type Block = { text: string; on: boolean };
export type Blocks = Record<BlockId, Block>;
export type StackLora = { name: string; strength: number; on: boolean };

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
export function size(aspect: string, mp: number) {
  const a = ASPECTS.find((x) => x.label === aspect) ?? ASPECTS[0];
  const w = Math.sqrt((mp * 1024 * 1024 * a.w) / a.h);
  const side = (v: number) => Math.max(256, Math.min(2048, Math.round(v / 16) * 16));
  return { width: side(w), height: side((w * a.h) / a.w) };
}

/** The nearest aspect and megapixel setting for a render's pixel size, for Reuse of renders without a recipe. */
export function fromSize(width: number, height: number) {
  const ratio = Math.log(width / height);
  const aspect = [...ASPECTS].sort((x, y) => Math.abs(Math.log(x.w / x.h) - ratio) - Math.abs(Math.log(y.w / y.h) - ratio))[0];
  const mp = (width * height) / (1024 * 1024);
  return { aspect: aspect.label, mp: [...MEGAPIXELS].sort((x, y) => Math.abs(x - mp) - Math.abs(y - mp))[0] };
}

export type Recipe = {
  blocks: Blocks;
  character: string | null; // id of the saved character the character blocks came from
  unet: string;
  family: string | null; // null: the family the model list suggests for unet
  negative: string;
  aspect: string;
  mp: number;
  seed: number | null; // null: a new random seed per render
  steps: number | null; // null: the model's default
  cfg: number | null;
  loras: StackLora[];
  count: number;
  upscale: UpscaleSettings;
};
// auto: every new render is upscaled once it is stored; prompt "" upscales without a retouch
export type UpscaleSettings = { auto: boolean; megapixels: number; prompt: string; denoise: number };

const isText = (v: unknown): v is string => typeof v === "string";
const isBlock = (b: unknown): b is Block =>
  !!b && isText((b as Block).text) && typeof (b as Block).on === "boolean";
export const isStack = (ls: unknown): ls is StackLora[] =>
  Array.isArray(ls) &&
  ls.every((l) => l && isText(l.name) && Number.isFinite(l.strength) && typeof l.on === "boolean");

/** Only the known blocks, and only well-formed ones: what an imported file or old storage holds is not trusted. */
export function cleanBlocks(raw: unknown): Partial<Blocks> {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(BLOCKS.filter((b) => isBlock(r[b.id])).map((b) => [b.id, r[b.id]]));
}

const empty = (): Blocks => Object.fromEntries(BLOCKS.map((b) => [b.id, { text: "", on: true }])) as Blocks;

export const EMPTY: Recipe = {
  blocks: empty(),
  character: null,
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
  upscale: { auto: false, megapixels: 4, prompt: "", denoise: 0.3 },
};

/** Krea 2 reads its prompt with Qwen3-VL, which follows sentences better than a pile of tags. */
export function compose(blocks: Blocks, triggers: string[]) {
  const sentences = BLOCKS.map((b) => blocks[b.id])
    .filter((b) => b.on)
    .map((b) => b.text.trim().replace(/[\s.,;]+$/, ""))
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + t.slice(1));
  const parts = [...triggers.filter(Boolean), ...sentences]; // trigger words verbatim: case can matter to a LoRA
  return parts.length ? parts.join(". ") + "." : "";
}

// A preset counts as present only as whole comma-separated phrases, so "red" is not found in
// "bored", and "smile" not in "slight smile". A saved section may itself contain commas.
const phrase = (p: string) => new RegExp(`(^|,)\\s*${p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?=,|$)`, "i");

/** Whether a preset's text is already in a section (case and spacing aside). */
export const hasPhrase = (text: string, p: string) => phrase(p).test(text.trim());

/** A preset chip is a toggle: it adds its text to the section, or takes it back out. */
export function togglePhrase(text: string, p: string) {
  const t = text.trim();
  if (!hasPhrase(t, p)) return t ? `${t.replace(/[\s,]+$/, "")}, ${p.trim()}` : p.trim();
  return t.replace(phrase(p), "$1").replace(/\s*,\s*(,\s*)+/g, ", ").replace(/^[\s,]+|[\s,]+$/g, "");
}

export function characterBlocks(blocks: Blocks): Partial<Blocks> {
  return Object.fromEntries(BLOCKS.filter((b) => b.character).map((b) => [b.id, blocks[b.id]]));
}

/** Renders and recipes from before the model list knew only "turbo" and "raw". */
export const legacyUnet = (model?: string) => (model === "raw" ? "krea2_raw_bf16.safetensors" : "krea2_turbo_bf16.safetensors");

/** A stored or imported recipe made whole: old fields renamed, unknown blocks and malformed LoRAs dropped. */
export function parseRecipe(saved: any): Recipe {
  if (saved?.model && !saved.unet) saved.unet = legacyUnet(saved.model);
  delete saved?.model;
  const up = saved?.upscale ?? {};
  return {
    ...EMPTY,
    ...saved,
    blocks: { ...empty(), ...cleanBlocks(saved?.blocks) },
    loras: isStack(saved?.loras) ? saved.loras : [],
    upscale: {
      auto: up.auto === true,
      megapixels: [2, 4, 8].includes(up.megapixels) ? up.megapixels : EMPTY.upscale.megapixels,
      prompt: isText(up.prompt) ? up.prompt : "",
      denoise: Number.isFinite(up.denoise) ? Math.min(0.8, Math.max(0.05, up.denoise)) : EMPTY.upscale.denoise,
    },
  };
}

/** The recipe being edited, written back through `save` once typing pauses. */
export function useRecipe(initial: Recipe, save: (r: Recipe) => void) {
  const [recipe, setRecipe] = useState(initial);
  const latest = useRef({ recipe, save, dirty: false });
  latest.current = { recipe, save, dirty: latest.current.recipe !== recipe || latest.current.dirty };
  useEffect(() => {
    const t = setTimeout(() => {
      save(recipe);
      latest.current.dirty = false;
    }, 300);
    return () => clearTimeout(t);
  }, [recipe, save]);
  useEffect(() => {
    const flush = () => latest.current.dirty && (latest.current.save(latest.current.recipe), (latest.current.dirty = false));
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // closing the workspace within 300 ms of an edit
    };
  }, []);
  return [recipe, setRecipe] as const;
}
