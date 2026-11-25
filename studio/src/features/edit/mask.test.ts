import { describe, expect, it } from "vitest";

import { hasArea, splitStrip, type Op } from "@/features/edit/mask";

const stroke = (erase = false): Op => ({ kind: "stroke", erase, size: 0.1, points: [[0.5, 0.5]] });

describe("hasArea", () => {
  it("is empty with no steps", () => expect(hasArea([])).toBe(false));
  it("has area after a brush stroke", () => expect(hasArea([stroke()])).toBe(true));
  it("has none after only erasing", () => expect(hasArea([stroke(true)])).toBe(false));
  it("has none after a clear", () => expect(hasArea([stroke(), { kind: "clear" }])).toBe(false));
  it("has area after inverting nothing", () => expect(hasArea([{ kind: "invert" }])).toBe(true));
});

describe("splitStrip", () => {
  // two 2×1 masks side by side: the first all found at 255, the second nothing
  const px = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  it("cuts the strip into one area each, coverage as alpha", () => {
    const [a, b] = splitStrip(px, 4, 1, 2);
    expect(Array.from(a ?? [])).toEqual([255, 255, 255, 255, 255, 255, 255, 128]);
    expect(b).toBeNull();
  });
});
