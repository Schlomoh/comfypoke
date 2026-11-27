// Which mask the bar under the stage edits: the image's own in Repaint, and in People the selected person's, or none
// until a face is tapped.
import { useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import { selectedAtom } from "@/features/edit/people/state";
import { editAtom, maskKey, type EditChoice } from "@/features/edit/state";

/** The key, from the mode and the selection as they are (also for the keyboard, outside React). */
export function keyOf(
  mode: EditChoice["mode"],
  selected: { id: string; index: number } | null,
  renderId: string,
) {
  if (mode === "repaint") return maskKey(renderId);
  return selected?.id === renderId ? maskKey(renderId, selected.index) : null;
}

export function useMaskKey(render: Render | undefined) {
  const mode = useAtomValue(editAtom).mode;
  const selected = useAtomValue(selectedAtom);
  return render ? keyOf(mode, selected, render.id) : null;
}
