import { toggleBest } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";

export function BestButton({ render, className }: { render: Render; className?: string }) {
  const space = useSpace();
  return (
    <Button
      onClick={() => void toggleBest(space, render)}
      aria-pressed={!!render.best}
      aria-label="Best"
      title="Mark as best (B)"
      className={cn("text-base", render.best ? "text-warn" : "text-muted hover:text-ink", className)}
    >
      {render.best ? "★" : "☆"}
    </Button>
  );
}
