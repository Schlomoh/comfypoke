import { describe, expect, it } from "vitest";

import { sync } from "@/domain/built-ins";
import { compose } from "@/domain/compose";
import { blank, example } from "@/domain/example";
import { NO_TRIGGERS } from "@/domain/loras";
import { NO_PRESETS } from "@/domain/prompt-catalog";
import { EMPTY, phrase } from "@/domain/recipe";

describe("example", () => {
  it("fills Who, Look, Where and Shot with one preset each", () => {
    const r = example(EMPTY, sync(NO_PRESETS, [])[0], () => 0);
    const p = r.cast[0];
    expect([p.who, p.look, r.scene.where, r.scene.shot].map((xs) => xs.length)).toEqual([1, 1, 1, 1]);
    expect(p.who[0].t).toBe("in her early twenties");
    expect(compose(r, NO_TRIGGERS)).toMatch(/^A woman, in her early twenties/);
  });
  it("leaves a row its catalog has nothing for empty", () => {
    expect(example(EMPTY, NO_PRESETS).cast[0].who).toEqual([]);
  });
  it("is offered only while the four rows are empty, switched-off phrases included", () => {
    expect(blank(EMPTY)).toBe(true);
    const off = { ...EMPTY, scene: { ...EMPTY.scene, where: [{ ...phrase("attic"), on: false }] } };
    expect(blank(off)).toBe(false);
  });
});
