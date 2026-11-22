import type { Render } from "@/domain/render";
import { useImageActions } from "@/state/actions";
// A draft's two ways to become the real thing: keep exactly this picture (an upscale, with the Model tab's touch-up
// words if any), or render it again at full size with the same seed, sharper but free to shift.
import { useGenerate } from "@/state/generate";
import { Button } from "@/ui/button";

export function DraftButtons({ render, className }: { render: Render; className?: string }) {
  const { upscaleMany } = useImageActions();
  const { rerender, sending } = useGenerate();
  return (
    <>
      <Button
        className={className}
        onClick={() => void upscaleMany([render])}
        title="Keep this picture exactly: upscale it with the Model tab's settings"
      >
        Keep it
      </Button>
      <Button
        className={className}
        disabled={sending || !render.recipe}
        onClick={() => void rerender(render)}
        title="Render it again at the Model tab's size, same seed: sharper, the composition may shift"
      >
        Make big
      </Button>
    </>
  );
}
