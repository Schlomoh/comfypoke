// Reading what storage or a file holds: never trusted, and older shapes made whole. Every reader takes
// `unknown` and keeps only what has the right type.
import {
  ASPECTS,
  EMPTY,
  legacyUnet,
  MAX_PEOPLE,
  MEGAPIXELS,
  phrase,
  SIDES,
  type Person,
  type Phrase,
  type Recipe,
  type StackLora,
} from "@/domain/recipe";
import { PERSON_ROWS, ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";

type Raw = Record<string, unknown>;
export const isText = (v: unknown): v is string => typeof v === "string";
export const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const record = (v: unknown): Raw => (isRecord(v) ? v : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const positiveOrNull = (v: unknown) => (finite(v) && v > 0 ? v : null);

export const isStack = (ls: unknown): ls is StackLora[] =>
  Array.isArray(ls) &&
  ls.every((l) => isRecord(l) && isText(l.name) && finite(l.strength) && typeof l.on === "boolean");

export function cleanPhrases(v: unknown): Phrase[] {
  return list(v)
    .filter(isRecord)
    .filter((p): p is Raw & { t: string } => isText(p.t) && p.t.trim() !== "")
    .map((p) => ({
      id: isText(p.id) ? p.id : crypto.randomUUID(),
      t: p.t,
      on: p.on !== false,
      versions: list(p.versions).filter(isText),
    }));
}

export function cleanRows<K extends RowId>(raw: unknown, rows: readonly { id: K }[]): Record<K, Phrase[]> {
  const r = record(raw);
  return Object.fromEntries(rows.map((row) => [row.id, cleanPhrases(r[row.id])])) as Record<K, Phrase[]>;
}

// Before people and versions the prompt was eight blocks of free text. Each comma-separated part
// becomes a phrase in the row it belongs to now.
export const LEGACY_ROW: Readonly<Record<string, RowId>> = {
  subject: "who",
  face: "look",
  outfit: "wear",
  pose: "doing",
  setting: "where",
  camera: "shot",
  style: "style",
  extra: "extra",
};

export function fromBlocks(blocks: unknown) {
  const out = Object.fromEntries(ROWS.map((r) => [r.id, [] as Phrase[]])) as Record<RowId, Phrase[]>;
  for (const [id, raw] of Object.entries(record(blocks))) {
    const row = LEGACY_ROW[id];
    const b = record(raw);
    if (!row || !isText(b.text)) continue;
    const parts = id === "extra" ? [b.text.trim()] : b.text.split(",").map((x) => x.trim());
    out[row].push(...parts.filter(Boolean).map((t) => ({ ...phrase(t), on: b.on !== false })));
  }
  return out;
}

function cleanPerson(raw: unknown, i: number): Person {
  const p = record(raw);
  const side = list(p.side);
  return {
    id: isText(p.id) ? p.id : crypto.randomUUID(),
    name: isText(p.name) && p.name.trim() ? p.name : `Person ${i + 1}`,
    savedId: isText(p.savedId) ? p.savedId : null,
    side: SIDES.filter((s) => side.includes(s)),
    depth: p.depth === "front" || p.depth === "back" ? p.depth : "auto",
    ...cleanRows(p, PERSON_ROWS),
  };
}

/** A stored or imported recipe made whole: old fields renamed, the old blocks turned into a person and a scene. */
export function parseRecipe(raw: unknown): Recipe {
  const r = record(raw);
  const legacy = r.blocks !== undefined && r.cast === undefined ? fromBlocks(r.blocks) : null;
  const castRaw = legacy ? [{ ...legacy, name: "Person 1", savedId: r.character ?? null }] : list(r.cast);
  const sceneRaw = legacy ?? record(r.scene);
  const scene = record(r.scene);
  const up = record(r.upscale);
  let unet = isText(r.model) ? legacyUnet(r.model) : EMPTY.unet;
  if (isText(r.unet)) unet = r.unet;
  return {
    ...EMPTY,
    cast: castRaw.length ? castRaw.slice(0, MAX_PEOPLE).map(cleanPerson) : EMPTY.cast,
    scene: {
      name: isText(scene.name) ? scene.name : "",
      savedId: isText(scene.savedId) ? scene.savedId : null,
      ...cleanRows(sceneRaw, SCENE_ROWS),
    },
    unet,
    family: isText(r.family) ? r.family : null,
    negative: isText(r.negative) ? r.negative : EMPTY.negative,
    aspect: ASPECTS.some((a) => a.label === r.aspect) && isText(r.aspect) ? r.aspect : EMPTY.aspect,
    mp: MEGAPIXELS.find((m) => m === r.mp) ?? EMPTY.mp,
    seed: finite(r.seed) ? r.seed : null,
    steps: positiveOrNull(r.steps),
    cfg: positiveOrNull(r.cfg),
    loras: isStack(r.loras) ? r.loras : [],
    count: finite(r.count) ? Math.min(4, Math.max(1, Math.round(r.count))) : EMPTY.count,
    sameSeed: r.sameSeed !== false,
    stopAfter: r.stopAfter === true,
    upscale: {
      auto: up.auto === true,
      megapixels: [2, 4, 8].find((m) => m === up.megapixels) ?? EMPTY.upscale.megapixels,
      prompt: isText(up.prompt) ? up.prompt : "",
      denoise: finite(up.denoise) ? Math.min(0.8, Math.max(0.05, up.denoise)) : EMPTY.upscale.denoise,
    },
  };
}
