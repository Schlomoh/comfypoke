// A saved character or scene: the rows of phrases it keeps, versions included.
import { cleanRows, fromBlocks, isRecord, isText } from "@/domain/parse";
import type { Phrase } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";

export type Saved = {
  id: string;
  name: string;
  kind: "person" | "scene";
  rows: Partial<Record<RowId, Phrase[]>>;
  updatedAt: number;
};

/** A saved entry as stored now. Characters from before people and versions kept free-text blocks and their own LoRAs; the blocks become rows, the LoRAs stay with the Model tab. */
export function toSaved(raw: unknown): Saved | null {
  if (!isRecord(raw) || !isText(raw.id) || !isText(raw.name)) return null;
  const kind = raw.kind === "scene" ? "scene" : "person";
  const rows = raw.blocks !== undefined && raw.rows === undefined ? fromBlocks(raw.blocks) : raw.rows;
  return {
    id: raw.id,
    name: raw.name,
    kind,
    rows: cleanRows(rows, kind === "scene" ? SCENE_ROWS : PERSON_ROWS),
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export const savedOnly = (xs: readonly unknown[]) =>
  xs
    .map(toSaved)
    .filter((x): x is Saved => x !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name));
