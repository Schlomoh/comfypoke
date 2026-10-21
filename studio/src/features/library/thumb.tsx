// The library's tiles: a finished render, or a job still running (or failed) ahead of them.
import { useThumb } from "@/data/db/renders";
import { isUpscale, progress, type Job } from "@/domain/job";
import type { Render } from "@/domain/render";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";
import { Progress } from "@/ui/text";

const tile = "relative aspect-square overflow-hidden bg-panel outline-offset-[-2px]";

export function Thumb({
  render,
  active,
  selected,
  onSelect,
}: {
  render: Render;
  active: boolean;
  selected?: boolean; // undefined: not selecting
  onSelect: (r: Render) => void;
}) {
  const url = useThumb(render.id);
  const picking = selected !== undefined;
  return (
    <Pressable
      data-render={render.id}
      onClick={() => onSelect(render)}
      role={picking ? "checkbox" : undefined}
      aria-checked={picking ? selected : undefined}
      aria-label={render.title ?? render.prompt}
      className={cn(tile, ((active && !picking) || selected) && "outline-2 outline-ink")}
    >
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          className={cn("size-full object-cover", picking && !selected && "opacity-60")}
        />
      )}
      {render.best && (
        <span className="absolute top-0 right-0 bg-bg/80 px-1 text-[11px] leading-4 text-warn" aria-hidden>
          ★
        </span>
      )}
      {render.upscale && (
        <span
          className="absolute bottom-0 left-0 bg-bg/80 px-1 font-mono text-[10px] leading-4 text-ink"
          aria-hidden
        >
          ↑{render.upscale.megapixels}MP
        </span>
      )}
      {picking && (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 grid size-5 place-items-center border text-[11px]",
            selected ? "border-ink bg-ink text-bg" : "border-ink/70 bg-bg/60",
          )}
          aria-hidden
        >
          {selected && "✓"}
        </span>
      )}
    </Pressable>
  );
}

export function Pending({
  job,
  active,
  onFocus,
}: {
  job: Job;
  active: boolean;
  onFocus: (id: string) => void;
}) {
  return (
    <Pressable
      onClick={() => onFocus(job.id)}
      data-render={job.id}
      aria-label={job.error ? "failed render" : "render in progress"}
      className={cn(tile, active && "outline-2 outline-ink")}
    >
      {job.preview && <img src={job.preview} alt="" className="size-full object-cover opacity-60" />}
      {isUpscale(job) && (
        <span className="absolute top-1 left-1 font-mono text-[10px] text-ink">upscaling</span>
      )}
      <Progress value={job.error ? 1 : progress(job)} tone={job.error ? "bad" : "ink"} />
    </Pressable>
  );
}
