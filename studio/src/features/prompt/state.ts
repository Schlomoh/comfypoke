// What the prompt editor remembers while the workspace is open: the tab in front, the sheet open over
// it, and the picker's settings, which follow the person from row to row.
import { atom } from "jotai";

import type { Key, RowRef } from "@/domain/cast";
import type { RowId } from "@/domain/rows";

/** The tab in front: a person's id or "scene"; null is the first person. */
export const castTabAtom = atom<Key | null>(null);

/** The sheet over the editor. A row sheet adds to its row, or versions to one phrase (`target`). */
export type Open = (RowRef & { kind: "row"; target: string | null }) | { kind: "link"; key: Key } | null;
export const openAtom = atom<Open>(null);

/** The subcategory last picked in each row. Nothing changes it but a tap on another one. */
export const subcategoryAtom = atom<Partial<Record<RowId, string>>>({});
/** The text a phrase had before it was emptied in its sheet, by id: Undo of its removal brings that back. */
export const emptiedAtom = atom<ReadonlyMap<string, string>>(new Map());

/** "Keep what I type as a preset": on until switched off, in every row. */
export const keepTypedAtom = atom(false);
