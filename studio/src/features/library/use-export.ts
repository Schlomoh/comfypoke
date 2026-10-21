// Saving many images into the workspace's folder, or downloading them as a zip, with the progress and
// the outcome both the selection bar and the Download section show.
import { useAtomValue } from "jotai";
import { useState } from "react";

import { useSpace } from "@/data/db/space";
import { useWorkspace } from "@/data/db/workspaces";
import { chooseFolder, folderOf, saveToFolder } from "@/data/folder";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { download, zipRenders } from "@/features/library/files";
import { libraryFilterAtom } from "@/state/studio";

function zipName(selected: boolean, { best, character }: { best: boolean; character: string }) {
  const day = new Date().toISOString().slice(0, 10);
  if (selected) return `studio-${day}-selected.zip`;
  return `studio-${day}${best ? "-best" : ""}${character ? `-${character}` : ""}.zip`;
}

/** `target` is what Save and Download work on: the selection while there is one, else what is shown. */
export function useExport(target: Render[], selected: boolean) {
  const space = useSpace();
  const filter = useAtomValue(libraryFilterAtom);
  const folder = useWorkspace(space.id)?.folder?.name ?? "";
  const [note, setNote] = useState("");
  const [zipping, setZipping] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const saveAll = async () => {
    setNote("");
    setSaving(0);
    try {
      const dir = await folderOf(space);
      if (!dir) return setNote("No write access to that folder. Choose it again.");
      const added = await saveToFolder(space, dir, target, setSaving);
      const skipped = added < target.length ? `, ${target.length - added} were already there` : "";
      setNote(`Saved ${added} new to ${dir.name}${skipped}.`);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  const choose = () =>
    chooseFolder(space).then(
      (dir) => setNote(`Save and Download now write to ${dir.name}.`),
      (e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setNote(errorText(e));
      },
    );

  const downloadAll = async () => {
    setZipping(0);
    try {
      download(await zipRenders(space, target, setZipping), zipName(selected, filter));
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setZipping(null);
    }
  };

  return { folder, note, zipping, saving, saveAll, downloadAll, choose };
}

export type Export = ReturnType<typeof useExport>;
