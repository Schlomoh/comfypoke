// A model setup: which model file, in which family, with which steps, CFG and LoRAs. Saved from the Model tab under
// a name, applied back to it, and picked for each pass of an edit (dress, finish, repaint).
import { isRecord, isText } from "@/domain/parse";
import type { Recipe } from "@/domain/recipe";
import { legacyUnet } from "@/domain/recipe";
import type { Lora, Render } from "@/domain/render";

/** What a pass of the server runs with; steps and cfg null mean the model's own defaults. */
export type Pass = { unet: string; family: string; steps: number | null; cfg: number | null; loras: Lora[] };
export type Setup = Pass & { id: string; name: string; at: number };

/** Always there, before any of yours: the stock model of each family. */
export const BUILT_IN: readonly Setup[] = [
  {
    id: "zimage-turbo",
    name: "Z-Image Turbo",
    unet: "z_image_turbo_bf16.safetensors",
    family: "zimage",
    steps: null,
    cfg: null,
    loras: [],
    at: 0,
  },
  {
    id: "krea2-turbo",
    name: "Krea 2 Turbo",
    unet: "krea2_turbo_bf16.safetensors",
    family: "krea2",
    steps: null,
    cfg: null,
    loras: [],
    at: 0,
  },
];

/** The Model tab as it is, under a name; only the LoRAs switched on come along. */
export const setupOf = (r: Recipe, family: string, name: string): Setup => ({
  id: crypto.randomUUID(),
  name,
  unet: r.unet,
  family,
  steps: r.steps,
  cfg: r.cfg,
  loras: r.loras.filter((l) => l.on).map(({ name: n, strength }) => ({ name: n, strength })),
  at: Date.now(),
});

/** A setup into the Model tab; `suggested` is the family the model list gives its file, left implicit when it matches. */
export const applySetup = (r: Recipe, s: Setup, suggested?: string): Recipe => ({
  ...r,
  unet: s.unet,
  family: s.family === suggested ? null : s.family,
  steps: s.steps,
  cfg: s.cfg,
  loras: s.loras.map((l) => ({ ...l, on: true })),
});

/** Only what the server runs a pass with: a setup's name and id stay on the device. */
export const toPass = ({ unet, family, steps, cfg, loras }: Pass): Pass => ({
  unet,
  family,
  steps,
  cfg,
  loras,
});

/** What a render was made with, as a pass: edits run with the image's own model unless another is picked. */
export const passOf = (r: Render): Pass => ({
  unet: r.unet ?? legacyUnet(r.model),
  family: r.family,
  steps: r.steps,
  cfg: r.cfg,
  loras: r.loras ?? [],
});

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseSetup(raw: unknown): Setup | null {
  if (!isRecord(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.unet) || !isText(raw.family))
    return null;
  if (!raw.name.trim() || !/\.(safetensors|gguf)$/.test(raw.unet) || !raw.family) return null;
  const loras = Array.isArray(raw.loras) ? raw.loras : [];
  return {
    id: raw.id,
    name: raw.name,
    unet: raw.unet,
    family: raw.family,
    steps: isNum(raw.steps) ? raw.steps : null,
    cfg: isNum(raw.cfg) ? raw.cfg : null,
    loras: loras.flatMap((l) =>
      isRecord(l) && isText(l.name) && isNum(l.strength) ? [{ name: l.name, strength: l.strength }] : [],
    ),
    at: isNum(raw.at) ? raw.at : Date.now(),
  };
}
