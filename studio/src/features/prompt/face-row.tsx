// A person's face photo: a head swap after each render puts it on them (graphs._headswap) while the
// rows decide the rest. It is stored sealed on this device and sent only with a render.
import { useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";

import { FACE_FAMILIES } from "@/data/api";
import { addFace, dropFace, useFace } from "@/data/db/faces";
import { useObjectUrl } from "@/data/db/renders";
import { useSaved } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { useCatalog } from "@/data/queries";
import { faceFor, withPerson } from "@/domain/cast";
import { resolve } from "@/domain/catalog";
import { errorText } from "@/domain/format";
import type { Person } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Heading, Note } from "@/ui/text";

function note(person: Person, used: Person | undefined, family: string | undefined) {
  if (family && !FACE_FAMILIES.includes(family))
    return "Face photos work with Krea 2 only; this model leaves it out.";
  if (person.face && used && used.id !== person.id)
    return `One face per render: ${used.name}'s is the one used.`;
  if (!person.face) return "A clear, front-facing head shot works best. It stays on this device, encrypted.";
  return null;
}

export function FaceRow({ person }: { person: Person }) {
  const space = useSpace();
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const saved = useSaved();
  // what else points at a photo: it is deleted once nothing does, a face is not something to leave lying around
  const others = () => [
    ...saved.map((s) => s.face),
    ...recipe.cast.filter((c) => c.id !== person.id).map((c) => c.face),
  ];
  const file = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(useFace(person.face));
  const set = (face: string | null) => setRecipe((r) => withPerson(r, person.id, (p) => ({ ...p, face })));

  const pick = async (f: File) => {
    try {
      const was = person.face;
      set(await addFace(space, f));
      if (was) await dropFace(was, others());
    } catch (e) {
      notify(`Could not read that photo: ${errorText(e)}`, { bad: true });
    }
  };
  const remove = async () => {
    const was = person.face;
    if (!was) return;
    set(null);
    const restore = await dropFace(was, others());
    notify(`Removed ${person.name}'s face photo`, {
      action: {
        label: "Undo",
        run: () => {
          restore();
          set(was);
        },
      },
    });
  };
  const text = note(person, faceFor(recipe), resolve(recipe, catalog).family?.id);

  return (
    <div className="flex flex-col gap-1.5">
      <Heading>Face</Heading>
      <ChipRow>
        {person.face ? (
          <>
            {url ? (
              <img
                src={url}
                alt={`${person.name}'s face`}
                className="size-14 border border-line object-cover"
              />
            ) : (
              <span className="size-14 border border-line bg-panel" />
            )}
            <Button onClick={() => file.current?.click()}>Change</Button>
            <Button variant="quiet" onClick={() => void remove()}>
              Remove
            </Button>
          </>
        ) : (
          <Chip tone="add" text="body" onClick={() => file.current?.click()}>
            + face photo
          </Chip>
        )}
      </ChipRow>
      <Input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
      {text && <Note>{text}</Note>}
    </div>
  );
}
