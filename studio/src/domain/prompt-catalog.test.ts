import { describe, expect, it } from "vitest";

import { builtIns, fromLegacy, resetRow, revise, sync } from "@/domain/built-ins";
import { regender } from "@/domain/presets";
import { fill } from "@/domain/presets/gender";
import {
  addChunk,
  addSub,
  diff,
  NO_PRESETS,
  FIRST_SUB,
  has,
  merge,
  moveChunk,
  offered,
  removeChunks,
  renameChunk,
  renameSub,
  reorderSubs,
  subsOf,
  view,
  type Presets,
} from "@/domain/prompt-catalog";

const [seeded, seen] = sync(NO_PRESETS, []);
const names = (c: Presets, row: Parameters<typeof subsOf>[1]) => subsOf(c, row).map((s) => s.name);
const items = (c: Presets, name: string, gender: "woman" | "man" | "person" = "woman") =>
  view(c, "wear", gender)
    .find((s) => s.sub.name === name)
    ?.items.map((i) => i.text);
const idOf = (c: Presets, text: string) => c.chunks.find((x) => x.text === text)?.id as string;
const subId = (c: Presets, name: string) =>
  c.subs.find((s) => s.row === "wear" && s.name === name)?.id as string;

describe("seeding", () => {
  it("seeds every built-in once, groups of one name as one subcategory", () => {
    expect(seen).toHaveLength(builtIns().length);
    expect(names(seeded, "wear").filter((n) => n === "Underwear")).toHaveLength(1);
    expect(items(seeded, "Bras")?.[0]).toBe("lace balcony bra");
  });
  it("keeps a group to its genders", () => {
    expect(view(seeded, "wear", "man").map((s) => s.sub.name)).not.toContain("Bras");
    expect(offered(seeded, "who", "man").some((t) => t.includes("{"))).toBe(false);
  });
  it("adds only what was not seen: a removed one stays gone", () => {
    const less = removeChunks(seeded, [idOf(seeded, "lace balcony bra")]);
    expect(sync(less, seen)[0]).toEqual(less);
  });
  it("adds a new built-in where its group went, after a rename", () => {
    const renamed = renameSub(seeded, subId(seeded, "Bras"), "Tops");
    const dropped = seen.filter((k) => k !== "wear/Bras/plunge bra");
    const without = removeChunks(renamed, [idOf(renamed, "plunge bra")]);
    const [after] = sync(without, dropped);
    expect(items(after, "Tops")).toContain("plunge bra");
    expect(names(after, "wear")).not.toContain("Bras");
  });
});

describe("editing", () => {
  it("adds a typed one at the end of a subcategory, once per row", () => {
    const one = addChunk(seeded, "wear", "silk bra", { sub: subId(seeded, "Bras") });
    expect(items(one, "Bras")?.at(-1)).toBe("silk bra");
    expect(addChunk(one, "wear", " Silk  bra ", { sub: subId(one, "Sets") })).toBe(one);
    expect(has(one, "wear", "silk bra")).toBe(true);
  });
  it("starts a subcategory in a row without any", () => {
    const one = addChunk(seeded, "extra", "film grain");
    expect(view(one, "extra", "person").map((s) => [s.sub.name, s.items.map((i) => i.text)])).toEqual([
      [FIRST_SUB, ["film grain"]],
    ]);
  });
  it("renames a chunk in place, unless the row has the new text", () => {
    const out = renameChunk(seeded, idOf(seeded, "plunge bra"), "deep plunge bra", "woman");
    expect(items(out, "Bras")?.indexOf("deep plunge bra")).toBe(items(seeded, "Bras")?.indexOf("plunge bra"));
    expect(renameChunk(seeded, idOf(seeded, "plunge bra"), "boyshorts", "woman")).toBe(seeded);
    expect(items(renameChunk(seeded, idOf(seeded, "plunge bra"), "Plunge bra", "woman"), "Bras")).toContain(
      "Plunge bra",
    );
  });
  it("renames a gendered chunk for the gender it was read as only", () => {
    const tpl = seeded.chunks.find((c) => c.row === "who" && !c.only && c.text.includes("{their}"));
    const out = renameChunk(seeded, tpl?.id as string, "late thirties", "woman");
    expect(offered(out, "who", "woman")).toContain("late thirties");
    expect(offered(out, "who", "woman")).not.toContain(fill(tpl?.text as string, "woman"));
    expect(offered(out, "who", "man")).toContain(fill(tpl?.text as string, "man"));
    expect(offered(out, "who", "man")).not.toContain("late thirties");
  });
  it("moves a chunk to the end of another subcategory", () => {
    const out = moveChunk(seeded, idOf(seeded, "lace balcony bra"), subId(seeded, "Sets"));
    expect(items(out, "Sets")?.at(-1)).toBe("lace balcony bra");
    expect(items(out, "Bras")).not.toContain("lace balcony bra");
  });
  it("shows a new empty subcategory, and reorders", () => {
    const [made] = addSub(seeded, "wear", "Mine");
    expect(names(made, "wear").at(-1)).toBe("Mine");
    expect(items(made, "Mine")).toEqual([]);
    expect(names(reorderSubs(made, "wear", names(made, "wear").length - 1, 0), "wear")[0]).toBe("Mine");
  });
  it("merges a subcategory renamed onto another's name", () => {
    const out = renameSub(seeded, subId(seeded, "Bottoms"), "bras");
    expect(names(out, "wear")).not.toContain("Bottoms");
    expect(items(out, "Bras")).toContain("boyshorts");
  });
  it("resets a row to the built-ins, keeping what was typed", () => {
    let c = addChunk(seeded, "wear", "silk bra", { sub: subId(seeded, "Bras") });
    c = renameSub(removeChunks(c, [idOf(c, "boyshorts")]), subId(c, "Bras"), "Tops");
    const out = resetRow(c, "wear");
    expect(names(out, "wear")).toEqual([...names(seeded, "wear"), "Tops"]);
    expect(items(out, "Bottoms")).toContain("boyshorts");
    expect(items(out, "Tops")).toEqual(["silk bra"]); // kept under the name it had
  });
});

describe("legacy presets and backups", () => {
  it("puts old ones where they were, ungrouped ones in More, and takes removed built-ins out", () => {
    const out = fromLegacy(
      seeded,
      [
        { block: "wear", text: "silk bra", group: "Bras", at: 1 },
        { block: "wear", text: "old one", at: 2 },
        { block: "wear", text: "a grey suit", group: "Outfits", at: 3 },
        { block: "wear", text: "lace balcony bra", group: "Bras", hidden: true, at: 4 },
      ],
      true,
    );
    expect(items(out, "Bras")).toContain("silk bra");
    expect(items(out, "Bras")).not.toContain("lace balcony bra");
    expect(items(out, FIRST_SUB)).toEqual(["old one"]);
    expect(items(out, "Outfits", "man")).toEqual(["a grey suit"]);
  });
  it("merges another catalog by names and texts, only adding", () => {
    const theirs = addChunk(addSub(NO_PRESETS, "wear", "bras")[0], "wear", "silk bra");
    const out = merge(seeded, theirs);
    expect(names(out, "wear")).toEqual(names(seeded, "wear"));
    expect(items(out, "Bras")?.at(-1)).toBe("silk bra");
  });
  it("diffs both ways", () => {
    const after = moveChunk(addChunk(seeded, "wear", "x"), idOf(seeded, "plunge bra"), subId(seeded, "Sets"));
    const d = diff(seeded, after);
    expect(d.chunks).toHaveLength(2);
    expect(diff(after, seeded).dropChunks).toHaveLength(1);
  });
});

const forMen = (c: Presets) => offered(c, "wear", "man");

describe("genders", () => {
  it("keeps a typed text that only another gender's built-in has, for everyone", () => {
    const out = addChunk(seeded, "wear", "lace balcony bra");
    expect(forMen(out)).toContain("lace balcony bra");
    expect(offered(out, "wear", "woman").filter((t) => t === "lace balcony bra")).toHaveLength(1);
  });
  it("takes a gendered built-in removed before the catalog out for that gender only", () => {
    const tpl = seeded.chunks.find((c) => c.row === "who" && !c.only && c.text.includes("{their}"))
      ?.text as string;
    const hers = fill(tpl, "woman");
    const out = fromLegacy(seeded, [{ block: "who", text: hers, hidden: true, at: 1 }], true);
    expect(offered(out, "who", "woman")).not.toContain(hers);
    expect(offered(out, "who", "man")).toContain(fill(tpl, "man"));
  });
  it("makes no empty subcategory on a merge that adds nothing", () => {
    const theirs = addChunk(addSub(NO_PRESETS, "wear", "Lingerie")[0], "wear", "plunge bra");
    expect(names(merge(seeded, theirs), "wear")).toEqual(names(seeded, "wear"));
  });
});

const home = (c: Presets) => c.subs.find((s) => s.row === "where" && s.name === "Home")?.id as string;
const sub = (c: Presets, text: string) =>
  c.subs.find((s) => s.id === c.chunks.find((x) => x.text === text)?.sub)?.name;

describe("revisions", () => {
  const OLD = "{noun} in {their} thirties";
  const NEW = "in {their} thirties";
  const rev = [
    { from: `who/Age/${OLD}`, to: `who/Age/${NEW}` },
    { from: "where/Home/old bath", to: "where/Bathroom/old bath" },
    { from: "where/Home/gone", to: null },
  ];
  // a device that seeded the old texts
  const was = (c: Presets) =>
    c.chunks.map((x) =>
      x.builtIn === `who/Age/${NEW}` ? { ...x, text: OLD, builtIn: `who/Age/${OLD}` } : x,
    );
  const old0: Presets = { ...seeded, chunks: was(seeded) };
  const old1 = addChunk(
    addChunk(old0, "where", "old bath", { sub: home(old0), builtIn: "where/Home/old bath" }),
    "where",
    "gone",
    {
      sub: home(old0),
      builtIn: "where/Home/gone",
    },
  );
  const oldSeen = [...seen, `who/Age/${OLD}`, "where/Home/old bath", "where/Home/gone"];

  it("follows the new text and group for one left as it was, and drops one dropped", () => {
    const [out, keys] = revise(old1, oldSeen, rev);
    expect(offered(out, "who", "woman")).toContain("in her thirties");
    expect(offered(out, "who", "woman")).not.toContain("woman in her thirties");
    expect(sub(out, "old bath")).toBe("Bathroom");
    expect(offered(out, "where", "person")).not.toContain("gone");
    expect(keys).toContain(`who/Age/${NEW}`);
    expect(sync(out, keys)[0].chunks).toHaveLength(out.chunks.length); // nothing seeded twice
  });
  it("leaves one the person renamed, moved or removed, and adds no second one", () => {
    const id = idOf(old1, OLD);
    const renamed = renameChunk(old1, id, "{noun} in {their} early thirties", "woman");
    const moved = moveChunk(old1, idOf(old1, "old bath"), subId(old1, "Sets"));
    const [a, keys] = revise(renamed, oldSeen, rev);
    expect(offered(sync(a, keys)[0], "who", "man")).toEqual(
      offered(revise(old1, oldSeen, rev)[0], "who", "man"),
    );
    expect(offered(a, "who", "woman")).toContain("woman in her early thirties");
    expect(offered(a, "who", "woman")).not.toContain("in her thirties");
    expect(sub(revise(moved, oldSeen, rev)[0], "old bath")).toBe("Sets");
    const removed = removeChunks(old1, [id]);
    const [b, bKeys] = revise(removed, oldSeen, rev);
    expect(offered(sync(b, bKeys)[0], "who", "woman")).not.toContain("in her thirties");
  });
  it("takes out, for that gender, a built-in removed before the catalog under the text it had then", () => {
    const out = fromLegacy(
      seeded,
      [{ block: "who", text: "woman in her thirties", hidden: true, at: 1 }],
      true,
    );
    expect(offered(out, "who", "woman")).not.toContain("in her thirties");
    expect(offered(out, "who", "man")).toContain("in his thirties");
  });
  it("regenders a phrase from a built-in as it read before a revision, as the new one", () => {
    expect(regender("who", "woman in her thirties", "woman", "man")).toBe("in his thirties");
    expect(regender("who", "in her thirties", "woman", "man")).toBe("in his thirties");
  });
  it("is a no-op on a device that never had the old ones, and run twice", () => {
    expect(revise(seeded, seen, rev)[0]).toBe(seeded);
    const [once, k] = revise(old1, oldSeen, rev);
    expect(revise(once, k, rev)[0]).toEqual(once);
  });
});
