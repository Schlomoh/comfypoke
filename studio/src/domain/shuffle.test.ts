import { describe, expect, it } from "vitest";

import { EMPTY, phrase, type Recipe } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS } from "@/domain/rows";
import { fresh, rowKey, SCENE, surprises, withVersion } from "@/domain/shuffle";

const coat = phrase("a red coat");
const ana = { ...EMPTY.cast[0], name: "Ana", wear: [coat] };
const recipe: Recipe = { ...EMPTY, cast: [ana] };
const presets = [
  { block: "wear", text: "a red coat" },
  { block: "wear", text: "a green parka" },
  { block: "where", text: "a beach" },
];

describe("fresh and withVersion", () => {
  it("offers only the presets the row does not have yet", () =>
    expect(fresh([{ ...coat, versions: ["jeans"] }], ["a red coat", "jeans", "boots", " boots "])).toEqual([
      "boots",
    ]));
  it("adds a version to the first switched-on phrase", () => {
    const off = { ...phrase("hat"), on: false };
    const out = withVersion([off, coat], "a parka");
    expect(out[0]).toBe(off);
    expect(out[1].versions).toEqual(["a parka"]);
  });
  it("starts an empty row with the preset", () =>
    expect(withVersion([], "boots").map((p) => p.t)).toEqual(["boots"]));
});

const rowsOf = (r: Recipe) => [
  ...PERSON_ROWS.map((row) => JSON.stringify(r.cast[0][row.id].map((p) => p.t))),
  ...SCENE_ROWS.map((row) => JSON.stringify(r.scene[row.id].map((p) => p.t))),
];
const allRows = [
  ...PERSON_ROWS.map((row) => rowKey(ana.id, row.id)),
  ...SCENE_ROWS.map((row) => rowKey(SCENE, row.id)),
];

describe("surprises", () => {
  it("changes exactly one row per render, says which, and is one render each", () => {
    const out = surprises(recipe, presets, 3);
    expect(out).toHaveLength(3);
    for (const s of out) {
      const changed = rowsOf(s.recipe).filter((x, i) => x !== rowsOf(recipe)[i]);
      expect(changed).toHaveLength(1);
      expect(s.recipe.count).toBe(1);
      expect(s.label).toMatch(/: /);
    }
  });
  it("offers your own presets for a row, not ones it has", () => {
    const onlyWear = { ...recipe, pinned: allRows.filter((k) => k !== rowKey(ana.id, "wear")) };
    const out = surprises(onlyWear, presets, 5);
    expect(
      out.every((s) => s.recipe.cast[0].wear.length === 1 && s.recipe.cast[0].wear[0].t !== "a red coat"),
    ).toBe(true);
    expect(out.every((s) => s.label.startsWith("Ana · wearing: "))).toBe(true);
  });
  it("never makes the same change twice, and stops when they run out", () => {
    const where = { ...recipe, pinned: allRows.filter((k) => k !== rowKey(SCENE, "where")) };
    const few = surprises(where, presets, 1000);
    expect(new Set(few.map((s) => s.label)).size).toBe(few.length);
    expect(few.length).toBeLessThan(1000);
  });
  it("changes each row once before any row twice", () => {
    const two = {
      ...recipe,
      pinned: allRows.filter((k) => k !== rowKey(SCENE, "where") && k !== rowKey(ana.id, "wear")),
    };
    const [a, b] = surprises(two, presets, 2).map((s) => s.label.split(":")[0]);
    expect(a).not.toBe(b);
  });
  it("leaves pinned rows alone, and makes none when every row is pinned", () =>
    expect(surprises({ ...recipe, pinned: allRows }, presets, 3)).toEqual([]));
  it("drops versions, so each surprise is one render", () => {
    const many = { ...recipe, cast: [{ ...ana, wear: [{ ...coat, versions: ["jeans"] }] }] };
    const [s] = surprises({ ...many, pinned: [rowKey(ana.id, "wear")] }, presets, 1);
    expect(s.recipe.cast[0].wear[0].versions).toEqual([]);
  });
});
