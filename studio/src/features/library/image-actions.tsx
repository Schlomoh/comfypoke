// What can be done with one image, the same under the stage and in the viewer: the two or three things its kind is for,
// labeled, and the rest under "More" with the settings it was made with. A draft is for keeping or making big; a
// render for marking, editing and upscaling; a photo has no recipe to reuse.
import { useState } from "react";

import { useSpace } from "@/data/db/space";
import { describe } from "@/domain/format";
import type { Render } from "@/domain/render";
import { BestButton } from "@/features/library/best-button";
import { saveImage } from "@/features/library/files";
import { useImageActions } from "@/state/actions";
import { useGenerate } from "@/state/generate";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Sheet } from "@/ui/modal";
import { Note } from "@/ui/text";

/** A draft's two ways to become the real thing: keep exactly this picture (an upscale, with the dock's touch-up words
 * if any), or render it again at full size with the same seed, sharper but free to shift. */
function DraftActions({ render, className }: { render: Render; className?: string }) {
  const { upscaleMany } = useImageActions();
  const { rerender, sending } = useGenerate();
  return (
    <>
      <Button
        className={className}
        onClick={() => void upscaleMany([render])}
        title="Keep this picture exactly: upscale it with the dock's upscale settings"
      >
        Keep it
      </Button>
      <Button
        className={className}
        disabled={sending || !render.recipe}
        onClick={() => void rerender(render)}
        title="Render it again at the dock's size, same seed: sharper, the composition may shift"
      >
        Make big
      </Button>
    </>
  );
}

function More({ render, open, onClose }: { render: Render; open: boolean; onClose: () => void }) {
  const space = useSpace();
  const { reuse, edit, upscaleMany, remove } = useImageActions();
  const run = (f: () => unknown) => () => {
    onClose();
    void f();
  };
  return (
    <Sheet open={open} onClose={onClose} title="This image">
      <Note mono>
        {render.characterName && `${render.characterName} · `}
        {describe(render)} · {render.seconds}s
      </Note>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={run(() => reuse(render))} disabled={!!render.uploaded}>
          Reuse settings
        </Button>
        <Button onClick={run(() => saveImage(space, render))}>Save to device</Button>
        {render.draft && <Button onClick={run(() => edit(render))}>Edit</Button>}
        {render.draft && <Button onClick={run(() => upscaleMany([render]))}>Upscale</Button>}
        <Button variant="danger" onClick={run(() => remove(render))} className="col-span-2">
          Delete
        </Button>
      </div>
      {render.uploaded && <Note>A photo has no recipe to reuse.</Note>}
    </Sheet>
  );
}

/** `fill`: the buttons share the row's width (a phone, the viewer). */
export function ImageActions({ render, fill }: { render: Render; fill?: boolean }) {
  const { edit, upscaleMany } = useImageActions();
  const [more, setMore] = useState(false);
  const grow = cn(fill && "min-w-0 flex-1");
  return (
    <>
      <BestButton render={render} className="w-12 shrink-0" />
      {render.draft ? (
        <DraftActions render={render} className={grow} />
      ) : (
        <>
          <Button
            className={grow}
            onClick={() => edit(render)}
            title="Edit it on the stage: find, paint, dress or repaint (E)"
          >
            Edit
          </Button>
          <Button
            className={grow}
            onClick={() => void upscaleMany([render])}
            title="Upscale with the dock's upscale settings (U)"
          >
            Upscale
          </Button>
        </>
      )}
      <Button onClick={() => setMore(true)} aria-label="More: reuse, save, delete" className="w-12 shrink-0">
        ⋯
      </Button>
      <More render={render} open={more} onClose={() => setMore(false)} />
    </>
  );
}
