import { describe, expect, it } from "vitest";

import { childCounts, family, kindOf, lineage } from "@/domain/lineage";
import type { Render } from "@/domain/render";

const r = (id: string, source?: string, more: Partial<Render> = {}): Render => ({
  id,
  source,
  createdAt: id.charCodeAt(0),
  seconds: 1,
  prompt: "",
  negative: "",
  unet: "m",
  family: "krea2",
  width: 8,
  height: 8,
  steps: 8,
  cfg: 1,
  seed: 1,
  loras: [],
  ...more,
});
// a → b (draft made big) → c, d (edits of b); e is unrelated; f's source was deleted
const all = [
  r("a", undefined, { draft: true }),
  r("b", "a"),
  r("c", "b", { edit: { target: "", prompt: "x" } }),
  r("d", "b"),
  r("e"),
  r("f", "gone"),
];

describe("lineage", () => {
  it("walks back to the first image", () =>
    expect(lineage(all, "c").chain.map((x) => x.id)).toEqual(["a", "b", "c"]));
  it("lists what an image was made into", () =>
    expect(lineage(all, "b").children.map((x) => x.id)).toEqual(["c", "d"]));
  it("says when the chain was cut by a deletion", () => {
    expect(lineage(all, "f").cut).toBe(true);
    expect(lineage(all, "c").cut).toBe(false);
  });
  it("finds the whole family from any member", () =>
    expect([...family(all, "d")].toSorted()).toEqual(["a", "b", "c", "d"]));
  it("counts children", () => expect(childCounts(all).get("b")).toBe(2));
  it("names each step", () => {
    expect(kindOf(all[0])).toBe("draft");
    expect(kindOf(all[2])).toBe("edit");
    expect(kindOf(all[4])).toBeNull();
  });
  it("survives a loop in the records", () =>
    expect(lineage([r("x", "y"), r("y", "x")], "x").chain).toHaveLength(2));
});
