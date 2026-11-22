import { describe, expect, it } from "vitest";

import { plan, runCount } from "@/domain/batch";
import { NO_TRIGGERS } from "@/domain/loras";
import { EMPTY, phrase, type Recipe } from "@/domain/recipe";

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  ...EMPTY,
  cast: [{ ...EMPTY.cast[0], wear: [phrase("a red coat", ["a blue coat"])], who: [phrase("a woman")] }],
  ...over,
});

describe("batch", () => {
  it("counts one render per version and seed", () => {
    expect(runCount(recipe())).toBe(2);
    expect(runCount(recipe({ count: 3 }))).toBe(6);
  });
  it("puts each version into its own prompt", () => {
    const prompts = plan(recipe(), NO_TRIGGERS, 7).map((p) => p.prompt);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("a red coat");
    expect(prompts[1]).toContain("a blue coat");
  });
  it("shares a seed between the versions of one seed", () => {
    const seeds = plan(recipe({ count: 2 }), NO_TRIGGERS, 100).map((p) => p.seed);
    expect(seeds).toEqual([100, 100, 101, 101]);
  });
  it("labels what changed", () =>
    expect(plan(recipe(), NO_TRIGGERS, 1)[1].changes[0]).toContain("a blue coat"));
  it("stores each render's recipe with one seed and its version only", () => {
    const r = plan(recipe(), NO_TRIGGERS, 5)[1].recipe;
    expect(r.count).toBe(1);
    expect(runCount(r)).toBe(1);
  });
});
