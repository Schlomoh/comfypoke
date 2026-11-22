import { describe, expect, it } from "vitest";

import { hasArea, type Op } from "@/features/edit/mask";

const stroke = (erase = false): Op => ({ kind: "stroke", erase, size: 0.1, points: [[0.5, 0.5]] });

describe("hasArea", () => {
  it("is empty with no steps", () => expect(hasArea([])).toBe(false));
  it("has area after a brush stroke", () => expect(hasArea([stroke()])).toBe(true));
  it("has none after only erasing", () => expect(hasArea([stroke(true)])).toBe(false));
  it("has none after a clear", () => expect(hasArea([stroke(), { kind: "clear" }])).toBe(false));
  it("has area after inverting nothing", () => expect(hasArea([{ kind: "invert" }])).toBe(true));
});
