// People's action for the bar at the bottom: everyone picked on the image, in one render per outfit version side by side
// (domain/people.ts) and per take. Each dressed person wears their nth outfit over their part, kept as the Prompt tab
// writes them unless that is switched off; each face is redrawn with the picked look, its person's words and LoRAs.
import { useAtomValue } from "jotai";

import type { PeopleRequest } from "@/data/api";
import { useLoraNotes } from "@/data/db/presets";
import { portrait } from "@/domain/compose";
import { FACE_PEOPLE, facePerson } from "@/domain/face";
import { ownedBy, triggersOf } from "@/domain/loras";
import { outfitPieces } from "@/domain/outfits";
import { peopleSaid, sideBySide } from "@/domain/people";
import type { Person } from "@/domain/recipe";
import type { EditedPerson } from "@/domain/render";
import { toPass } from "@/domain/setup";
import { hasArea, maskPng } from "@/features/edit/mask";
import { MASK_PART, peopleAtom, type PersonRow } from "@/features/edit/people/state";
import { editAtom, masksAtom } from "@/features/edit/state";
import { PARTS } from "@/features/edit/use-find";
import { usePasses } from "@/features/edit/use-passes";
import { useJobs } from "@/state/jobs";
import { recipeAtom, stageAtom } from "@/state/studio";

type Picked = PersonRow & { person: Person };
/** The part as the server takes it: SAM's words for it, or "mask". */
const partOf = (part: string) =>
  part === MASK_PART ? "mask" : (PARTS.find(([label]) => label === part)?.[1] ?? part);

export function usePeopleEdit() {
  const { render, job } = useAtomValue(stageAtom);
  const recipe = useAtomValue(recipeAtom);
  const c = useAtomValue(editAtom);
  const rows = useAtomValue(peopleAtom)[render?.id ?? ""];
  const ops = useAtomValue(masksAtom)[render?.id ?? ""] ?? [];
  const notes = useLoraNotes();
  const { choose } = usePasses(render);
  const { people } = useJobs();

  const picked = (rows ?? []).flatMap((r): Picked[] => {
    const person = recipe.cast.find((p) => p.id === r.pick.who);
    return person ? [{ ...r, person }] : [];
  });
  const dressed = picked.filter((p) => p.pick.outfit);
  const redrawn = picked.filter((p) => p.pick.face && p.found);
  const sent = picked.filter((p) => dressed.includes(p) || redrawn.includes(p)); // the others stay as they are
  const runs = sideBySide(dressed.map((p) => outfitPieces(p.person)));
  const count = dressed.length || redrawn.length ? runs.length * c.takes : 0;
  const dresser = choose(c.dresser, "zimage").picked;
  const finish = c.finish === "off" ? null : choose(c.finish).picked;
  const look = choose(c.faceWith).picked;
  const names = dressed.map((p) => p.person.name || "them");

  const blocked = (() => {
    if (job) return "wait for this one to finish, or pick an image";
    if (!render) return "no image to edit yet";
    if (!rows) return "finding the people on the image";
    if (!count) return "pick someone to dress or a face to redraw";
    if (sent.length > FACE_PEOPLE) return `at most ${FACE_PEOPLE} people in one edit`;
    const bare = dressed.find((p) => !outfitPieces(p.person).length);
    if (bare) return `say what ${bare.person.name || "they"} wear`;
    if (dressed.some((p) => p.pick.part === MASK_PART) && !hasArea(ops))
      return "paint or find the mask first";
    if (dressed.length && !dresser) return "save a Z-Image look to dress with";
    if (redrawn.length && !look) return "pick a look to redraw faces with";
    return null;
  })();

  /** Each face with its person's words and LoRAs. A stack that knows whose each LoRA is (the Look tab's, or the image's
   * own recipe) gives every face only its own character's and the shared ones; a saved look's LoRAs go to everyone. */
  const face = (p: Person) => {
    if (!look) return { text: "", loras: [] };
    const family = look.pass.family;
    let stack = look.pass.loras.map((l) => ({ ...l, on: true }));
    if (c.faceWith === "tab") stack = recipe.loras;
    else if (c.faceWith === "own" && render?.recipe) stack = render.recipe.loras;
    const f = facePerson(p, triggersOf(stack, notes, family), (id) => ownedBy(stack, notes, family, id));
    return { text: f.text, loras: f.loras };
  };
  const wear = (p: Person, pieces: string[]) => (c.portrait && portrait(p, pieces)) || pieces.join(", ");

  const send = async () => {
    if (blocked || !render) return;
    const mask = dressed.some((p) => p.pick.part === MASK_PART)
      ? await maskPng(ops, render.width, render.height)
      : null;
    const dress =
      dressed.length && dresser
        ? {
            hold: c.hold,
            dresser: dresser.pass,
            finish: finish ? { ...toPass(finish.pass), denoise: c.strength } : null,
          }
        : null;
    const faceWith = redrawn.length && look ? { ...look.pass, negative: "", denoise: c.faceStrength } : null;
    for (const outfits of runs)
      for (let take = 0; take < c.takes; take++) {
        const worn = new Map(dressed.map((p, i) => [p, outfits[i]]));
        const request: Omit<PeopleRequest, "image" | "mask"> = {
          seed: null,
          people: sent.map((p) => ({
            box: p.found?.box ?? null,
            ...face(p.person),
            outfit: worn.has(p) ? wear(p.person, worn.get(p) ?? []) : null,
            part: worn.has(p) ? partOf(p.pick.part) : "",
            redraw: redrawn.includes(p),
          })),
          dress,
          face: faceWith,
          stop_after: recipe.stopAfter,
        };
        const record: EditedPerson[] = sent.map((p) => ({
          name: p.person.name,
          who: p.person.savedId ?? undefined,
          outfit: worn.get(p),
          face: p.pick.face && !!p.found,
        }));
        const one = dressed.length === 1 ? dressed[0] : null; // one dressed: an outfit like Dress made, to keep or reuse
        await people(
          render,
          {
            target: "people",
            prompt: peopleSaid(names, redrawn.length),
            people: record,
            ...(one && dresser
              ? {
                  dress: {
                    hold: c.hold,
                    dresser: dresser.name,
                    finish: finish?.name ?? null,
                    strength: finish ? c.strength : undefined,
                    pieces: worn.get(one),
                    who: one.person.savedId ?? undefined,
                  },
                }
              : {}),
          },
          request,
          mask,
        );
      }
  };

  return {
    send,
    blocked,
    count,
    dressing: dressed.length > 0,
    label: `${peopleSaid(names, redrawn.length) || "nothing picked"}${c.takes > 1 ? ` × ${c.takes}` : ""}`,
    button: `${dressed.length ? "Dress" : "Redraw"}${count > 1 ? ` ${count}` : ""}`,
  };
}
