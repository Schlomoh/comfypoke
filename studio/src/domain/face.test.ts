import { describe, expect, it } from "vitest";

import { facePeople, keptMatch, matchLabel, referenceAt } from "@/domain/face";
import { EMPTY, newPerson, phrase, type Recipe } from "@/domain/recipe";
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

const r = (cast: Recipe["cast"]): Recipe => ({ ...EMPTY, cast });
const loras = (id: string | null) => (id ? [{ name: `${id}.safetensors`, strength: 1 }] : []);

describe("facePeople", () => {
  const mia = {
    ...newPerson("Mia"),
    id: "a",
    savedId: "s1",
    side: ["left" as const],
    face: "f1",
    who: [phrase("a woman")],
  };
  const jen = { ...newPerson("Jen"), id: "b", look: [phrase("red hair")] };
  it("is null for one person: the pass takes the largest face", () => {
    expect(facePeople(r([mia]), { lead: [], of: {} }, loras)).toBeNull();
  });
  it("gives each person their own words, LoRAs, side and photo", () => {
    const people = facePeople(r([mia, jen]), { lead: ["style"], of: { s1: ["m1a"] } }, loras);
    expect(people).toEqual([
      {
        text: expect.stringContaining("m1a") as string,
        loras: [{ name: "s1.safetensors", strength: 1 }],
        side: "left",
        face: "f1",
      },
      { text: expect.stringContaining("red hair") as string, loras: [], side: "", face: null },
    ]);
    expect(people?.[1].text).not.toContain("m1a");
    expect(people?.every((p) => p.text.startsWith("style, "))).toBe(true); // the stack's words lead, as in the prompt
  });
  it("says whose head the face photo goes on, among everyone's sides", () => {
    expect(referenceAt(r([jen, mia]))).toEqual({ slot: 1, sides: ["", "left"] });
    expect(referenceAt(r([mia]))).toBeNull(); // one person: the largest face
    expect(referenceAt(r([jen, { ...mia, face: null }]))).toBeNull(); // nobody has a photo
  });
  it("leaves out someone with nothing written", () => {
    expect(facePeople(r([mia, { ...newPerson("Empty"), id: "c" }]), { lead: [], of: {} }, loras)).toBeNull();
  });
});
