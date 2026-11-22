// A saved character or scene: the rows of phrases it keeps, versions included.
import { cleanGender, cleanRows, fromBlocks, isRecord, isText } from "@/domain/parse";
import type { Gender } from "@/domain/presets/gender";
import type { Phrase } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";

export type CharacterLora = { name: string; strength: number };

/** A character's LoRAs by family, keeping only well-formed entries. */
function cleanLoras(v: unknown): Record<string, CharacterLora[]> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, CharacterLora[]> = {};
  for (const [family, ls] of Object.entries(v)) {
    const ok = Array.isArray(ls)
      ? ls.flatMap((l) =>
          isRecord(l) && isText(l.name) && typeof l.strength === "number" && Number.isFinite(l.strength)
            ? [{ name: l.name, strength: l.strength }]
            : [],
        )
      : [];
    if (ok.length) out[family] = ok;
  }
  return Object.keys(out).length ? out : undefined;
}

export type Saved = {
  id: string;
  name: string;
  kind: "person" | "scene";
  gender?: Gender; // a character's; a scene has none
  face?: string; // a character's face photo, by its id in data/db/faces.ts
  loras?: Record<string, CharacterLora[]>; // a character's own LoRAs, by model family (domain/loras.ts)
  rows: Partial<Record<RowId, Phrase[]>>;
  updatedAt: number;
};

/** A saved entry as stored now. Characters from before people and versions kept free-text blocks and their own LoRAs; the blocks become rows, the LoRAs stay with the Model tab. */
export function toSaved(raw: unknown): Saved | null {
  if (!isRecord(raw) || !isText(raw.id) || !isText(raw.name)) return null;
  const kind = raw.kind === "scene" ? "scene" : "person";
  const rows = raw.blocks !== undefined && raw.rows === undefined ? fromBlocks(raw.blocks) : raw.rows;
  const clean: Partial<Record<RowId, Phrase[]>> = cleanRows(
    rows,
    kind === "scene" ? SCENE_ROWS : PERSON_ROWS,
  );
  return {
    id: raw.id,
    name: raw.name,
    kind,
    ...(kind === "person" ? { gender: cleanGender(raw.gender, clean.who) } : {}),
    ...(kind === "person" && isText(raw.face) ? { face: raw.face } : {}),
    ...(kind === "person" && cleanLoras(raw.loras) ? { loras: cleanLoras(raw.loras) } : {}),
    rows: clean,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export const savedOnly = (xs: readonly unknown[]) =>
  xs
    .map(toSaved)
    .filter((x): x is Saved => x !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name));
