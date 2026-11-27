// Edits of the prompt catalog that say what they did, with Undo.
import { editPresets } from "@/data/db/prompt-catalog";
import type { Presets } from "@/domain/prompt-catalog";
import { notify } from "@/ui/notify";

export async function editPresetsSaying(said: string, edit: (c: Presets) => Presets) {
  const undo = await editPresets(edit);
  if (!undo) return notify("Nothing changed: this row has that one already");
  notify(said, { action: { label: "Undo", run: () => void undo() } });
}
