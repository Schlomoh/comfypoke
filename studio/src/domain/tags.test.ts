import { describe, expect, it } from "vitest";

import { applyFilter, inEffect, NO_FILTER, toggleTag } from "@/domain/library-filter";
import type { Render } from "@/domain/render";
import { retag, tagState, vocabulary } from "@/domain/tags";

const r = (id: string, more: Partial<Render> = {}): Render => ({
  id,
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

describe("tags", () => {
  it("counts tags whatever their case, spelled as first written, most used first", () =>
    expect(vocabulary([r("a", { tags: ["Beach"] }), r("b", { tags: ["beach ", "red"] })])).toEqual([
      { tag: "Beach", count: 2 },
      { tag: "red", count: 1 },
    ]));
  it("adds and removes, and leaves an image alone when nothing changes", () => {
    const a = r("a", { tags: ["Beach"] });
    expect(retag(a, ["beach"])).toBe(a);
    expect(retag(a, ["red", "Red"]).tags).toEqual(["Beach", "red"]);
    expect(retag(a, [], ["BEACH"]).tags).toBeUndefined();
  });
  it("says whether a tag is on all, some or none", () => {
    const rs = [r("a", { tags: ["x"] }), r("b")];
    expect([tagState(rs, "x"), tagState(rs.slice(0, 1), "x"), tagState(rs, "y")]).toEqual([
      "some",
      "all",
      "none",
    ]);
  });
});

const ids = (rs: Render[]) => rs.map((x) => x.id);

describe("the library filter", () => {
  // a → b (an edit of a); c alone
  const all = [
    r("a", { tags: ["beach"], characterName: "Ana" }),
    r("b", { source: "a", tags: ["red"], best: true, characterName: "Ana" }),
    r("c", { tags: ["beach"], characterName: "Bo" }),
  ];
  it("shows a whole stack when its images carry every picked tag between them", () => {
    expect(ids(applyFilter(all, { ...NO_FILTER, tags: ["beach"] }))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilter(all, { ...NO_FILTER, tags: ["beach", "red"] }))).toEqual(["a", "b"]);
  });
  it("keeps best and character per image", () => {
    expect(ids(applyFilter(all, { ...NO_FILTER, tags: ["beach"], best: true }))).toEqual(["b"]);
    expect(ids(applyFilter(all, { ...NO_FILTER, tags: ["beach"], character: "Bo" }))).toEqual(["c"]);
  });
  it("drops what no image has any more, and toggles tags", () => {
    expect(inEffect({ best: true, character: "Cy", tags: ["Beach", "gone"] }, all)).toEqual({
      best: true,
      character: "",
      tags: ["Beach"],
    });
    expect(toggleTag(toggleTag(NO_FILTER, "x"), "X").tags).toEqual([]);
  });
});
