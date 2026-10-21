// What is being built: the people in the picture and its scene as rows of phrases, the model settings
// and the LoRAs. A phrase is one idea; its versions are alternatives, each rendered separately. The
// working copy is each workspace's draft, sealed in IndexedDB like the rest of it (db.ts).
import { useEffect, useRef, useState } from "react";

export const PERSON_ROWS = [
  { id: "who", label: "Who", hint: "who she is" },
  { id: "look", label: "Look", hint: "face, hair" },
  { id: "wear", label: "Wearing", hint: "clothes" },
  { id: "doing", label: "Doing", hint: "pose, expression" },
] as const;
export const SCENE_ROWS = [
  { id: "where", label: "Where", hint: "setting" },
  { id: "shot", label: "Shot", hint: "framing, light" },
  { id: "style", label: "Style", hint: "medium, finish" },
  { id: "extra", label: "Extra", hint: "anything else, verbatim" },
] as const;
export type PersonRow = (typeof PERSON_ROWS)[number]["id"];
export type SceneRow = (typeof SCENE_ROWS)[number]["id"];
export type RowId = PersonRow | SceneRow;
export const ROWS: readonly { id: RowId; label: string; hint: string }[] = [...PERSON_ROWS, ...SCENE_ROWS];

// The built-in presets by row and subcategory: women, real-life scenes, underwear and lingerie
// campaigns. One idea each. Your own presets are in IndexedDB and shown first, as Yours.
export const PRESETS: Record<RowId, Record<string, string[]>> = {
  who: {
    Age: ["woman in her early twenties", "woman in her mid twenties", "woman in her thirties", "woman in her forties"],
    Build: ["slim build", "athletic build", "curvy build", "petite frame", "tall and long-legged", "plus-size figure", "soft natural body"],
    Skin: ["fair skin with freckles", "light olive skin", "warm tan skin", "golden brown skin", "deep brown skin", "natural skin texture, visible pores"],
    Background: ["Scandinavian features", "Mediterranean features", "East Asian features", "South Asian features", "Latina features", "Black woman", "mixed heritage"],
    Presence: ["natural, approachable look", "confident model presence", "relaxed and candid", "editorial poise"],
  },
  look: {
    Hair: ["long straight hair", "long loose waves", "shoulder-length wavy hair", "sleek bob", "pixie cut", "curly hair", "high ponytail", "messy low bun", "hair tucked behind one ear"],
    "Hair color": ["platinum blonde", "honey blonde", "light brown", "chestnut brown", "dark brown", "jet black", "auburn", "copper red"],
    Face: ["green eyes", "hazel eyes", "brown eyes", "light freckles", "defined brows", "soft smile lines"],
    Makeup: ["no-makeup look", "dewy natural makeup", "soft glam makeup", "bold red lips", "nude lip gloss", "subtle winged liner"],
    Details: ["delicate gold necklace", "small hoop earrings", "fine-line tattoo on the forearm", "short natural nails", "manicured nude nails"],
  },
  wear: {
    Bras: ["lace balcony bra", "cotton triangle bralette", "seamless t-shirt bra", "plunge bra", "strapless bandeau", "longline lace bralette", "soft-cup sports bra"],
    Bottoms: ["high-waisted briefs", "cotton bikini briefs", "lace briefs", "seamless briefs", "high-cut briefs", "boyshorts"],
    Sets: ["matching lace lingerie set", "ribbed cotton bralette and briefs", "satin slip dress", "lace bodysuit", "silk camisole and shorts", "ribbed loungewear set"],
    Layers: ["oversized white button-down shirt", "open silk robe", "cropped knit cardigan", "loose linen shirt", "cotton bathrobe"],
    Color: ["in black", "in ivory", "in white", "in nude tones", "in sage green", "in dusty rose", "in navy"],
    Fabric: ["ribbed cotton", "fine lace", "soft satin", "sheer mesh panels", "brushed modal", "silk"],
  },
  doing: {
    Standing: ["standing, weight on one hip", "standing with arms relaxed", "leaning against a wall", "walking toward the camera", "turned away, looking over the shoulder", "standing by the window"],
    Sitting: ["sitting on the edge of the bed", "sitting cross-legged on the floor", "curled up on the sofa", "perched on a stool"],
    Hands: ["hands in her hair", "adjusting a strap", "hand resting on her hip", "holding a coffee mug", "fingers touching her collarbone"],
    Expression: ["soft smile", "confident gaze into the camera", "laughing naturally", "calm, neutral expression", "looking away, relaxed"],
  },
  where: {
    Home: ["sunlit bedroom with white linen", "minimalist bathroom with marble", "cozy living room sofa", "kitchen in morning light", "walk-in wardrobe"],
    Studio: ["seamless white backdrop", "warm beige backdrop", "textured plaster wall", "soft grey backdrop", "colored paper backdrop"],
    Hotel: ["boutique hotel room", "by a tall window with sheer curtains", "hotel bed with crisp sheets"],
    Outdoor: ["beach at golden hour", "rooftop terrace", "poolside on a sun lounger", "garden with soft shade"],
  },
  shot: {
    Framing: ["full body shot", "three-quarter body shot", "waist-up shot", "close-up of the fabric detail", "back view"],
    Angle: ["eye-level camera", "slightly low angle", "overhead shot", "mirror reflection"],
    Light: ["soft window light", "golden hour sunlight", "bright high-key studio light", "soft diffused flash", "moody low-key light", "dappled shadows"],
    Lens: ["50mm lens", "85mm lens, shallow depth of field", "35mm, environmental"],
  },
  style: {
    Photo: ["e-commerce catalog photo", "lingerie campaign editorial", "candid lifestyle photo", "film photo with natural grain", "instant film snapshot"],
    Finish: ["true-to-life colors", "natural skin texture, no retouching", "muted pastel grade", "warm color grade", "high-contrast black and white"],
  },
  extra: {},
};

export type Phrase = { id: string; t: string; on: boolean; versions: string[] };
export type Side = "left" | "center" | "right";
export type Depth = "auto" | "front" | "back";
export const SIDES: Side[] = ["left", "center", "right"];
export const MAX_PEOPLE = 5;
// savedId links a person to a saved character (a scene to a saved scene); null is a new one
export type Person = { id: string; name: string; savedId: string | null; side: Side[]; depth: Depth } & Record<PersonRow, Phrase[]>;
export type Scene = { name: string; savedId: string | null } & Record<SceneRow, Phrase[]>;
export type StackLora = { name: string; strength: number; on: boolean };

export const phrase = (t: string, versions: string[] = []): Phrase => ({ id: crypto.randomUUID(), t, on: true, versions });
export const newPerson = (name: string): Person => ({ id: crypto.randomUUID(), name, savedId: null, side: [], depth: "auto", who: [], look: [], wear: [], doing: [] });
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

// ---- the composer: deterministic sentences, as Krea 2 reads its prompt with Qwen3-VL ----------------------

const cap = (s: string) => s && s[0].toUpperCase() + s.slice(1);
const NUM = ["", "One person", "Two people", "Three people", "Four people", "Five people"];
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1));
const article = (s: string) => (/^(a|an|the|one|two)\b/i.test(s) ? s : (/^[aeiou]/i.test(s) ? "an " : "a ") + s);

export function place(p: Person) {
  const side = p.side.length === 3 ? "across the frame" : p.side.map((s) => (s === "center" ? "in the center" : `on the ${s}`)).join(" and ");
  const depth = p.depth === "back" ? "in the background" : p.depth === "front" ? "in the foreground" : "";
  return [depth, side].filter(Boolean).join(" ");
}

/** The prompt sent. pick gives the text for a phrase: its own, or one of its versions. */
export function compose(r: Recipe, triggers: string[], pick: (p: Phrase) => string = (p) => p.t) {
  const on = (ps: Phrase[]) => ps.filter((p) => p.on && p.t.trim()).map((p) => pick(p).trim().replace(/[\s.,;]+$/, ""));
  // only people with something written count: a tab just added is nobody yet
  const described = r.cast.filter((c) => PERSON_ROWS.some((row) => on(c[row.id]).length));
  const many = described.length > 1;
  const people = described.map((c) => {
    const parts = [on(c.who), on(c.look), on(c.wear), on(c.doing)];
    const look = parts[1].length ? ` with ${and(parts[1])}` : "";
    const body = [(parts[0].join(", ") || "person") + look, parts[2].length && `wearing ${and(parts[2])}`, parts[3].join(", ")].filter(Boolean).join(", ");
    const where = many ? place(c) : "";
    return cap(where ? `${where}, ${article(body)}` : article(body)) + ".";
  });
  const where = on(r.scene.where).join(", ");
  const scene = [where && `In ${article(where)}.`, ...[on(r.scene.shot), on(r.scene.style)].map((x) => x.join(", ")).filter(Boolean).map((s) => cap(s) + ".")];
  const extra = on(r.scene.extra).map((s) => cap(s) + ".");
  const lead = triggers.filter(Boolean).map((t) => t.trim().replace(/[\s.]+$/, "") + "."); // verbatim: case can matter to a LoRA
  return [...lead, many ? NUM[described.length] + "." : "", ...people, ...scene, ...extra].filter(Boolean).join(" ");
}

// ---- versions: every phrase with versions is one axis; the renders are every combination ---------------

export type Axis = { owner: string; row: string; phrase: Phrase; values: string[] };
export function axes(r: Recipe): Axis[] {
  const out: Axis[] = [];
  const add = (owner: string, row: string, p: Phrase) => p.on && p.versions.length && out.push({ owner, row, phrase: p, values: [p.t, ...p.versions] });
  r.cast.forEach((c) => PERSON_ROWS.forEach((row) => c[row.id].forEach((p) => add(c.name, row.label, p))));
  SCENE_ROWS.forEach((row) => r.scene[row.id].forEach((p) => add("Scene", row.label, p)));
  return out;
}
/** One map of phrase id to text per render, before seeds. */
export function combos(r: Recipe) {
  let acc = [new Map<string, string>()];
  for (const a of axes(r)) acc = acc.flatMap((m) => a.values.map((v) => new Map([...m, [a.phrase.id, v]])));
  return acc;
}
/** The recipe one render was made with: each phrase as the version it used, with no versions left. Reuse gets exactly that. */
export function collapse(r: Recipe, choice: Map<string, string>): Recipe {
  const fix = (ps: Phrase[]) => ps.map((p) => ({ ...p, t: choice.get(p.id) ?? p.t, versions: [] }));
  return {
    ...r,
    cast: r.cast.map((c) => ({ ...c, who: fix(c.who), look: fix(c.look), wear: fix(c.wear), doing: fix(c.doing) })),
    scene: { ...r.scene, where: fix(r.scene.where), shot: fix(r.scene.shot), style: fix(r.scene.style), extra: fix(r.scene.extra) },
  };
}

// ---- reading what storage or a file holds: never trusted, and older shapes made whole --------------------

const isText = (v: unknown): v is string => typeof v === "string";
export const isStack = (ls: unknown): ls is StackLora[] =>
  Array.isArray(ls) && ls.every((l) => l && isText(l.name) && Number.isFinite(l.strength) && typeof l.on === "boolean");

export function cleanPhrases(v: unknown): Phrase[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p) => p && isText(p.t) && p.t.trim())
    .map((p) => ({ id: isText(p.id) ? p.id : crypto.randomUUID(), t: p.t, on: p.on !== false, versions: Array.isArray(p.versions) ? p.versions.filter(isText) : [] }));
}
export function cleanRows<K extends RowId>(raw: unknown, rows: readonly { id: K }[]): Record<K, Phrase[]> {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(rows.map((row) => [row.id, cleanPhrases(r[row.id])])) as Record<K, Phrase[]>;
}

// Before people and versions the prompt was eight blocks of free text. Each comma-separated part
// becomes a phrase in the row it belongs to now.
export const LEGACY_ROW: Record<string, RowId> = { subject: "who", face: "look", outfit: "wear", pose: "doing", setting: "where", camera: "shot", style: "style", extra: "extra" };
export function fromBlocks(blocks: unknown) {
  const out = Object.fromEntries(ROWS.map((r) => [r.id, [] as Phrase[]])) as Record<RowId, Phrase[]>;
  for (const [id, b] of Object.entries((blocks ?? {}) as Record<string, { text?: unknown; on?: unknown }>)) {
    const row = LEGACY_ROW[id];
    if (!row || !isText(b?.text)) continue;
    const parts = id === "extra" ? [b.text.trim()] : b.text.split(",").map((x) => x.trim());
    out[row].push(...parts.filter(Boolean).map((t) => ({ ...phrase(t), on: b.on !== false })));
  }
  return out;
}

function cleanPerson(raw: any, i: number): Person {
  return {
    id: isText(raw?.id) ? raw.id : crypto.randomUUID(),
    name: isText(raw?.name) && raw.name.trim() ? raw.name : `Person ${i + 1}`,
    savedId: isText(raw?.savedId) ? raw.savedId : null,
    side: Array.isArray(raw?.side) ? SIDES.filter((s) => raw.side.includes(s)) : [],
    depth: raw?.depth === "front" || raw?.depth === "back" ? raw.depth : "auto",
    ...cleanRows(raw, PERSON_ROWS),
  };
}

/** A stored or imported recipe made whole: old fields renamed, the old blocks turned into a person and a scene. */
export function parseRecipe(saved: any): Recipe {
  saved = { ...(saved ?? {}) };
  if (saved.model && !saved.unet) saved.unet = legacyUnet(saved.model);
  delete saved.model;
  if (saved.blocks && !saved.cast) {
    const rows = fromBlocks(saved.blocks);
    saved.cast = [{ ...rows, name: "Person 1", savedId: saved.character ?? null }];
    saved.scene = rows;
  }
  delete saved.blocks;
  delete saved.character;
  const up = saved.upscale ?? {};
  const cast = Array.isArray(saved.cast) && saved.cast.length ? saved.cast.slice(0, MAX_PEOPLE).map(cleanPerson) : EMPTY.cast;
  return {
    ...EMPTY,
    ...saved,
    cast,
    scene: { name: isText(saved.scene?.name) ? saved.scene.name : "", savedId: isText(saved.scene?.savedId) ? saved.scene.savedId : null, ...cleanRows(saved.scene, SCENE_ROWS) },
    loras: isStack(saved.loras) ? saved.loras : [],
    sameSeed: saved.sameSeed !== false,
    stopAfter: saved.stopAfter === true,
    upscale: {
      auto: up.auto === true,
      megapixels: [2, 4, 8].includes(up.megapixels) ? up.megapixels : EMPTY.upscale.megapixels,
      prompt: isText(up.prompt) ? up.prompt : "",
      denoise: Number.isFinite(up.denoise) ? Math.min(0.8, Math.max(0.05, up.denoise)) : EMPTY.upscale.denoise,
    },
  };
}

/** Renders and recipes from before the model list knew only "turbo" and "raw". */
export const legacyUnet = (model?: string) => (model === "raw" ? "krea2_raw_bf16.safetensors" : "krea2_turbo_bf16.safetensors");

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
