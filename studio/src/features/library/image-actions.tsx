// What can be done with one image, the same under the stage and in the viewer: the two or three things its kind is for,
// labeled, and the rest in a menu under "⋯"; the settings it was made with are in the viewer's info. Upscale is always the first: the same
// picture, bigger. A draft's second is Re-render (full size, same seed), anything else's is Edit.
import { useAtomValue } from "jotai";

import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { BestButton } from "@/features/library/best-button";
import { saveImage } from "@/features/library/files";
import { useImageActions } from "@/state/actions";
import { useGenerate } from "@/state/generate";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { MenuItem, Popover } from "@/ui/popover";

/** Render a draft again at the dock's size with the same seed: sharper than an upscale, though the composition may
 * shift. An upscale keeps the picture exactly. */
function Rerender({ render, className }: { render: Render; className?: string }) {
  const { rerender, sending } = useGenerate();
  return (
    <Button
      className={className}
      disabled={sending || !render.recipe}
      onClick={() => void rerender(render)}
      title="Render it again at full size with the same seed: sharper, the composition may shift"
    >
      Re-render
    </Button>
  );
}

/** Upscale asks first: it is a GPU job of its own, and the size and touch-up come from the dock, out of sight here. */
function UpscaleConfirm({ render, className }: { render: Render; className?: string }) {
  const { upscaleMany } = useImageActions();
  const { megapixels, prompt } = useAtomValue(recipeAtom).upscale;
  return (
    <Popover
      trigger="Upscale"
      align="start"
      role="dialog"
      data-upscale
      className={className}
      title="Upscale: this picture exactly, bigger (U)"
    >
      <p className="line-clamp-4 px-3 py-2 text-xs text-muted">
        This picture at {megapixels} MP
        {prompt.trim() ? `, touched up: “${prompt.trim()}”` : ", as it is"}. Set in the dock under + then.
      </p>
      <MenuItem onClick={() => void upscaleMany([render])} className="text-ink">
        Upscale
      </MenuItem>
      <MenuItem>Cancel</MenuItem>
    </Popover>
  );
}

function More({ render }: { render: Render }) {
  const space = useSpace();
  const { reuse, edit, remove } = useImageActions();
  return (
    <Popover trigger="⋯" aria-label="More: reuse, save, delete" className="w-12 shrink-0">
      <MenuItem onClick={() => reuse(render)} disabled={!!render.uploaded}>
        Reuse settings
      </MenuItem>
      <MenuItem onClick={() => void saveImage(space, render)}>Save to device</MenuItem>
      {render.draft && <MenuItem onClick={() => edit(render)}>Edit</MenuItem>}
      <MenuItem onClick={() => void remove(render)} className="text-bad">
        Delete
      </MenuItem>
    </Popover>
  );
}

/** `fill`: the buttons share the row's width (a phone, the viewer). */
export function ImageActions({ render, fill }: { render: Render; fill?: boolean }) {
  const { edit } = useImageActions();
  const wide = cn(fill && "min-w-0 flex-1");
  return (
    <>
      <BestButton render={render} className="w-12 shrink-0" />
      <UpscaleConfirm render={render} className={wide} />
      {render.draft ? (
        <Rerender render={render} className={wide} />
      ) : (
        <Button
          className={wide}
          onClick={() => edit(render)}
          title="Edit it on the stage: find, paint, dress or repaint (E)"
        >
          Edit
        </Button>
      )}
      <More render={render} />
    </>
  );
}
