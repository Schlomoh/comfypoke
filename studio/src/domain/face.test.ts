import { describe, expect, it } from "vitest";

import { keptMatch, matchLabel } from "@/domain/face";
import type { Render } from "@/domain/render";

describe("matchLabel", () => {
  it("reads the score in bands", () => {
    expect(matchLabel(0.72)).toBe("very close");
    expect(matchLabel(0.6)).toBe("very close");
    expect(matchLabel(0.45)).toBe("likely the same person");
    expect(matchLabel(0.3)).toBe("some likeness");
    expect(matchLabel(0.1)).toBe("looks like someone else");
    expect(matchLabel(-0.2)).toBe("looks like someone else");
  });
  it("says when a face was missing", () => {
    expect(matchLabel(null)).toBe("no face found in one of them");
  });
});

describe("keptMatch", () => {
  const r = { faceMatch: { face: "f1", score: 0.5 } } as Render;
  it("is the stored match against the same photo only", () => {
    expect(keptMatch(r, "f1")?.score).toBe(0.5);
    expect(keptMatch(r, "f2")).toBeUndefined();
    expect(keptMatch({} as Render, "f1")).toBeUndefined();
  });
});
