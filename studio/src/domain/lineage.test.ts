import { describe, expect, it } from "vitest";

import { childCounts, family, groups, kindOf, lineage, stacks, visible } from "@/domain/lineage";
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

describe("stacks", () => {
  it("puts a root and everything made from it in one stack, newest member first", () => {
    const ss = stacks(all);
    const ofA = ss.find((s) => s.root.id === "a");
    expect(ofA?.members.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(ofA?.cover.id).toBe("d");
    expect(ss.map((s) => s.root.id)).toEqual(["f", "e", "a"]);
  });
  it("covers with the newest best", () => {
    const ss = stacks([r("a"), r("b", "a", { best: true }), r("c", "a")]);
    expect(ss[0].cover.id).toBe("b");
  });
  it("starts a stack at an image whose source is filtered out", () => {
    expect(stacks([r("b", "a"), r("c", "b")]).map((s) => s.root.id)).toEqual(["b"]);
  });
});

describe("groups", () => {
  it("groups stacks from one Generate in the order of their first", () => {
    const ss = stacks([r("a", undefined, { batch: "x" }), r("b"), r("c", undefined, { batch: "x" })]);
    expect(groups(ss).map((g) => g.stacks.map((s) => s.root.id))).toEqual([["c", "a"], ["b"]]);
  });
});

describe("visible", () => {
  const batch = [
    r("a", undefined, { batch: "x", best: true }),
    r("b", undefined, { batch: "x", passed: true }),
    r("c", undefined, { batch: "x", passed: true }),
  ];
  it("folds the picked-over stacks of a batch until it is unfolded", () => {
    expect(visible(stacks(batch), new Set()).map((s) => s.root.id)).toEqual(["a"]);
    expect(visible(stacks(batch), new Set(["x"]))).toHaveLength(3);
  });
});
