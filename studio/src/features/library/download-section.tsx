// Download what the library shows (or the selection): into the workspace's folder where the browser
// can, else as a zip.
import { useSpace } from "@/data/db/space";
import { canPickFolder, forgetFolder } from "@/data/folder";
import type { Export } from "@/features/library/use-export";
import { Button } from "@/ui/button";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

export function DownloadSection({ count, selected, out }: { count: number; selected: boolean; out: Export }) {
  const space = useSpace();
  const { folder, note, zipping, saving } = out;
  const what = selected ? "selected" : "shown";
  return (
    <Section title="Download" className="border-t border-b-0">
      {canPickFolder && (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={folder}>
            {folder ? `→ ${folder}` : "no folder chosen"}
          </span>
          <Button onClick={() => void out.choose()}>{folder ? "Change" : "Choose folder"}</Button>
          {folder && (
            <Button variant="quiet" onClick={() => void forgetFolder(space)}>
              Forget
            </Button>
          )}
        </div>
      )}
      {folder && (
        <Button variant="primary" onClick={() => void out.saveAll()} disabled={!count || saving != null}>
          {saving != null ? `Saving ${saving}/${count}` : `Save ${count} ${what} to ${folder}`}
        </Button>
      )}
      <Button onClick={() => void out.downloadAll()} disabled={!count || zipping != null}>
        {zipping != null ? `Zipping ${zipping}/${count}` : `Download ${count} ${what} as zip`}
      </Button>
      {note && (
        <p role="status" className="font-mono text-xs text-ink">
          {note}
        </p>
      )}
      <Note>
        {selected ? "The selected images" : "The images the filters above show"}, each PNG with its prompt and
        settings written in, plus metadata.json. Neither the files nor the zip are encrypted.
        {canPickFolder
          ? " With a folder chosen, Save and S write there too, and images already in it are skipped."
          : " Saving straight into a folder needs Chrome or Edge."}
      </Note>
    </Section>
  );
}
