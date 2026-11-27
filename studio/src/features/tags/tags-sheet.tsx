// The workspace's tags, to rename (onto another tag's name, the two become one) or remove from every image.
import { useAtomValue, useSetAtom } from "jotai";

import { useSpace } from "@/data/db/space";
import { cleanTag, sameTag } from "@/domain/tags";
import { filterAtom, rendersAtom, tagsAtom } from "@/state/studio";
import { deleteTag, renameTag } from "@/state/tags";
import { Button } from "@/ui/button";
import { CommitInput } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { Note } from "@/ui/text";

export function TagsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const space = useSpace();
  const tags = useAtomValue(tagsAtom);
  const all = useAtomValue(rendersAtom) ?? [];
  const setFilter = useSetAtom(filterAtom);
  /** Renamed on the images, and in the library filter when it is picked there. */
  const rename = (from: string, to: string) => {
    setFilter((f) => ({ ...f, tags: f.tags.map((t) => (sameTag(t, from) ? to : t)) }));
    void renameTag(space, all, from, to);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tags">
      {tags.length === 0 && (
        <Note>No tags yet. Tag an image from its ⋯ menu, or select several in the library and tap Tag.</Note>
      )}
      <div className="flex flex-col gap-2">
        {tags.map(({ tag, count }) => (
          <div key={tag} className="flex items-center gap-1 border border-line bg-bg pl-2">
            <CommitInput
              bare
              value={tag}
              aria-label={`Rename ${tag}`}
              onCommit={(t) => cleanTag(t) && rename(tag, cleanTag(t))}
              className="min-w-0 flex-1"
            />
            <span className="font-mono text-[11px] text-faint tabular-nums">{count}</span>
            <Button
              variant="icon"
              size="square"
              aria-label={`Remove the tag ${tag}`}
              onClick={() => void deleteTag(space, all, tag)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      {tags.length > 0 && (
        <Note>Rename a tag to another&apos;s name to merge the two. Removing one leaves the images.</Note>
      )}
    </Sheet>
  );
}
