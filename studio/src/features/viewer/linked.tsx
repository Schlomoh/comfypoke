// The images an image was made from and made into: its source, and its outfits, edits and upscales.
import { useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import { useImageActions } from "@/state/actions";
import { rendersAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Heading } from "@/ui/text";

/** What a render made from another one is: a new outfit, an edit or an upscale. */
function made(r: Render) {
  if (r.edit?.dress) return "outfit";
  return r.edit ? "edit" : "upscale";
}

export function Linked({ render }: { render: Render }) {
  const all = useAtomValue(rendersAtom) ?? [];
  const { open } = useImageActions();
  const source = render.source ? all.find((r) => r.id === render.source) : undefined;
  const upscales = all.filter((r) => r.source === render.id);
  if (!render.source && !upscales.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Heading>Linked</Heading>
      {render.source && !source && <p className="font-mono text-faint">source image deleted</p>}
      {source && (
        <Button variant="link" size="inline" className="justify-start px-0" onClick={() => open(source.id)}>
          ← source image, {source.width} × {source.height}
        </Button>
      )}
      {upscales.map((u) => (
        <Button
          key={u.id}
          variant="link"
          size="inline"
          className="justify-start px-0"
          onClick={() => open(u.id)}
        >
          → {made(u)}, {u.width} × {u.height}
        </Button>
      ))}
    </section>
  );
}
