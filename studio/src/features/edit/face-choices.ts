// The faces an edit can keep: the Prompt tab's people with a face photo, the image's own people, then saved
// characters, so a photo from the device, which has no people of its own, can still get a face.
import { useAtomValue } from "jotai";

import { useSaved } from "@/data/db/saved";
import type { Render } from "@/domain/render";
import { recipeAtom } from "@/state/studio";

export type FaceChoice = { id: string; name: string; face: string };

export function useFaceChoices(render: Render | undefined): FaceChoice[] {
  const cast = useAtomValue(recipeAtom).cast;
  const saved = useSaved();
  const out: FaceChoice[] = [];
  for (const c of [...cast, ...(render?.recipe?.cast ?? []), ...saved])
    if (c.face && !out.some((o) => o.face === c.face)) out.push({ id: c.face, name: c.name, face: c.face }); // the face is the choice
  return out;
}
