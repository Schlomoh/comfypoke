import { describe, expect, it } from "vitest";

import { compose } from "@/domain/compose";
import {
  handedOver,
  moved,
  NO_TRIGGERS,
  reassign,
  runnable,
  syncCastLoras,
  triggersOf,
  withLora,
} from "@/domain/loras";
import { EMPTY, newPerson, phrase, type StackLora } from "@/domain/recipe";

const mia = {
  id: "mia",
  loras: { krea2: [{ name: "mia_v3", strength: 0.9 }], zimage: [{ name: "mia_z", strength: 0.7 }] },
};
const grain: StackLora = { name: "film_grain", strength: 0.6, on: true };
const cast = [{ savedId: "mia" }];

describe("syncCastLoras", () => {
  it("adds a character's LoRA for the family at the top", () => {
    expect(syncCastLoras([grain], cast, [mia], "krea2")).toEqual([
      { name: "mia_v3", strength: 0.9, on: true, from: "mia" },
      grain,
    ]);
  });
  it("keeps the place and strength it was given, and returns the same array when nothing changes", () => {
    const placed = [grain, { name: "mia_v3", strength: 0.5, on: true, from: "mia" }];
    expect(syncCastLoras(placed, cast, [mia], "krea2")).toBe(placed);
  });
  it("swaps the family's LoRA and drops it when the person leaves", () => {
    const krea = syncCastLoras([grain], cast, [mia], "krea2");
    expect(syncCastLoras(krea, cast, [mia], "zimage").map((l) => l.name)).toEqual(["mia_z", "film_grain"]);
    expect(syncCastLoras(krea, [], [mia], "krea2")).toEqual([grain]);
  });
  it("drops what a deleted character brought", () => {
    const placed = [grain, { name: "mia_v3", strength: 0.5, on: true, from: "mia" }];
    expect(syncCastLoras(placed, cast, [], "krea2")).toEqual([grain]);
  });
  it("never touches the stack's own LoRAs", () => {
    expect(syncCastLoras([grain], [{ savedId: null }], [mia], "krea2")).toEqual([grain]);
  });
});

describe("triggers", () => {
  const notes = [
    { name: "mia_v3", trigger: "m1a woman" },
    { name: "film_grain", trigger: "grainy film" },
  ];
  it("splits a character's from the stack's, in order", () => {
    const loras = syncCastLoras([grain], cast, [mia], "krea2");
    expect(triggersOf(loras, notes)).toEqual({ lead: ["grainy film"], of: { mia: ["m1a woman"] } });
  });
  it("puts a character's trigger into that person's words", () => {
    const p = { ...newPerson("Mia"), savedId: "mia", wear: [phrase("a red coat")] };
    const prompt = compose({ ...EMPTY, cast: [p] }, { lead: ["grainy film"], of: { mia: ["m1a woman"] } });
    expect(prompt).toBe("grainy film. A m1a woman, wearing a red coat.");
    expect(compose({ ...EMPTY, cast: [p] }, NO_TRIGGERS)).toBe("A woman, wearing a red coat.");
  });
});

describe("runnable", () => {
  it("loads each file once, the first in stack order", () => {
    const twice = [
      { name: "mia_v3", strength: 0.9, on: true, from: "mia" },
      { name: "mia_v3", strength: 1, on: true },
    ];
    expect(runnable(twice, [], "krea2")).toEqual([{ name: "mia_v3", strength: 0.9 }]);
    expect(triggersOf(twice, [{ name: "mia_v3", trigger: "m1a" }])).toEqual({
      lead: [],
      of: { mia: ["m1a"] },
    });
  });
});

describe("moved", () => {
  it("moves one item and ignores moves past the ends", () => {
    expect(moved(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moved(["a", "b"], 1, 5)).toEqual(["a", "b"]);
  });
});

describe("reassign", () => {
  const mine: StackLora = { name: "mia_v3", strength: 0.4, on: false };
  const stack = [grain, mine, { name: "glow", strength: 1, on: true }];
  it("gives a LoRA of the look to a character in its place, with its strength and switch", () => {
    expect(reassign(stack, { name: "mia_v3", to: "mia" })).toEqual([
      grain,
      { ...mine, from: "mia" },
      stack[2],
    ]);
  });
  it("drops the copy the cast sync already added for the new owner", () => {
    const synced = [{ name: "mia_v3", strength: 0.9, on: true, from: "mia" }, ...stack];
    expect(reassign(synced, { name: "mia_v3", to: "mia" })).toEqual([
      grain,
      { ...mine, from: "mia" },
      stack[2],
    ]);
  });
  it("gives a character's LoRA back to the look, without its owner", () => {
    const hers = [grain, { ...mine, from: "mia" }];
    expect(reassign(hers, { name: "mia_v3", from: "mia" })).toEqual([grain, mine]);
    expect(reassign(hers, { name: "mia_v3", from: "mia" })[1]).not.toHaveProperty("from");
  });
  it("leaves the stack alone when the LoRA is not there or stays with its owner", () => {
    expect(reassign(stack, { name: "nope", to: "mia" })).toBe(stack);
    expect(reassign(stack, { name: "mia_v3" })).toBe(stack);
  });
});

describe("handedOver and withLora", () => {
  it("waits until the new owner lists it and the old one does not", () => {
    expect(handedOver({ name: "film_grain", to: "mia" }, [mia], "krea2")).toBe(false);
    const after = { ...mia, loras: withLora(mia.loras, "krea2", "film_grain", 0.6) };
    expect(handedOver({ name: "film_grain", to: "mia" }, [after], "krea2")).toBe(true);
    expect(handedOver({ name: "mia_v3", from: "mia" }, [mia], "krea2")).toBe(false);
    const gone = { ...mia, loras: withLora(mia.loras, "krea2", "mia_v3", null) };
    expect(handedOver({ name: "mia_v3", from: "mia" }, [gone], "krea2")).toBe(true);
    expect(gone.loras.zimage).toEqual(mia.loras.zimage);
  });
});
