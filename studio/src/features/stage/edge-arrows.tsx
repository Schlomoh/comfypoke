// The arrows at an image's edges. Zoomed in, a drag pans the image, so these are how to get to the next one; at
// fit a finger swipes instead (except while painting), and with a mouse they show on hover.
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

const ARROWS = [
  [-1, "‹", "Previous image"],
  [1, "›", "Next image"],
] as const;

export function EdgeArrows({ shown, onStep }: { shown: boolean; onStep: (dir: 1 | -1) => void }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 items-center justify-between px-2",
        shown ? "flex" : "hidden opacity-0 group-hover:opacity-100 [@media(pointer:fine)]:flex",
      )}
    >
      {ARROWS.map(([dir, glyph, label]) => (
        <Pressable
          key={dir}
          aria-label={label}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onStep(dir)}
          className="pointer-events-auto grid size-11 place-items-center border border-line bg-bg/75 text-lg text-ink backdrop-blur-sm hover:border-edge"
        >
          {glyph}
        </Pressable>
      ))}
    </div>
  );
}
