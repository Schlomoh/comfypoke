import { describe, expect, it } from "vitest";

import {
  childCounts,
  family,
  groups,
  kindOf,
  lineage,
  placeIn,
  stacks,
  trail,
  visible,
} from "@/domain/lineage";
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

const ids = (xs: Render[]) => xs.map((x) => x.id);

describe("trail", () => {
  // o → A (upscale) → A1 (edit of A); o → B (upscale), made after A1
  const fork = [r("o"), r("p", "o"), r("q", "p"), r("s", "o")];
  it("goes depth first through a fork", () =>
    expect(ids(trail(stacks(fork)[0]))).toEqual(["o", "p", "q", "s"]));
  it("keeps a branch before the next sibling even when the sibling is older", () => {
    const late = [r("o"), r("p", "o"), r("s", "o"), r("t", "p")];
    expect(ids(trail(stacks(late)[0]))).toEqual(["o", "p", "t", "s"]);
  });
  it("is only the ones marked best once any are", () => {
    const marked = fork.map((x) => (x.id === "q" || x.id === "s" ? { ...x, best: true } : x));
    expect(ids(trail(stacks(marked)[0]))).toEqual(["q", "s"]);
  });
  it("is the whole stack with none marked", () => expect(trail(stacks([r("o")])[0])).toHaveLength(1));
});

describe("placeIn", () => {
  const order = ["o", "p", "q", "s"];
  it("is the index of an image in the sequence", () => expect(placeIn(["j", "q", "s"], order, "s")).toBe(2));
  it("puts a left-out image after the trail image before it", () =>
    expect(placeIn(["j", "q", "s", "x"], order, "p")).toBe(0.5));
  it("puts it before the next one when none comes before", () => {
    expect(placeIn(["q", "s"], order, "o")).toBe(-0.5);
    expect(placeIn(["x"], undefined, "o")).toBeUndefined();
  });
});
