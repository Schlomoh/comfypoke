// What the next run is set to, one chip each, above Generate: the setup, the size, how many, draft, and what follows
// each render (a finish, an upscale). A tap opens that one setting; nothing else about the run is on screen.
import { useAtom, useSetAtom } from "jotai";
import { useState } from "react";

import { useSetups } from "@/data/db/setups";
import { shortName } from "@/domain/format";
import { useSetup } from "@/features/model/use-setup";
import { FinishSection } from "@/features/run/finish";
import { SizeSection } from "@/features/run/size";
import { UpscaleSection } from "@/features/run/upscale";
import { layerAtom, recipeAtom, tabAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Sheet } from "@/ui/modal";

type Open = "setup" | "size" | "then" | null;

const FLUSH = "px-0 last:border-b-0"; // a section inside a sheet, which has its own padding

function SetupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setups, isOn, apply } = useSetup();
  const setTab = useSetAtom(tabAtom);
  return (
    <Sheet open={open} onClose={onClose} title="Setup">
      <ChipRow>
        {setups.map((s) => (
          <Chip
            key={s.id}
            tone={isOn(s) ? "picked" : "quiet"}
            onClick={() => {
              apply(s);
              onClose();
            }}
          >
            {s.name}
          </Chip>
        ))}
      </ChipRow>
      <Button
        onClick={() => {
          setTab("look");
          onClose();
        }}
      >
        Change the model or LoRAs in Look
      </Button>
    </Sheet>
  );
}

export function RunChips() {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const setLayer = useSetAtom(layerAtom);
  const [open, setOpen] = useState<Open>(null);
  const { current, from } = useSetup();
  const setups = useSetups();
  const finishing = recipe.finish && setups.find((s) => s.id === recipe.finish?.setup);
  const then = [
    finishing && `→ ${finishing.name}`,
    recipe.upscale.auto && `↑ ${recipe.upscale.megapixels} MP`,
  ]
    .filter(Boolean)
    .join(" · ");
  const close = () => setOpen(null);
  const chip = "shrink-0 whitespace-nowrap";
  return (
    <>
      <div className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4">
        <Chip className={chip} onClick={() => setOpen("setup")} title="The model and LoRAs this run uses">
          {current?.name ?? (from ? `${from.name} · changed` : shortName(recipe.unet))}
          <span aria-hidden className="text-faint">
            ▾
          </span>
        </Chip>
        <Chip className={chip} onClick={() => setOpen("size")} title="Aspect and size">
          {recipe.aspect} · {recipe.mp} MP
        </Chip>
        <Chip className={chip} onClick={() => setLayer("renders")} title="Seeds, and every render this sends">
          ×{recipe.count}
        </Chip>
        <Chip
          className={chip}
          tone={recipe.draft ? "picked" : "quiet"}
          aria-pressed={recipe.draft}
          onClick={() => setRecipe((r) => ({ ...r, draft: !r.draft }))}
          title="Draft: small and quick, to find a direction; make the good ones big from the stage"
        >
          draft
        </Chip>
        <Chip
          className={chip}
          tone={then ? "plain" : "add"}
          onClick={() => setOpen("then")}
          title="A finish pass and an upscale after each render"
        >
          {then || "+ then"}
        </Chip>
      </div>
      <SetupSheet open={open === "setup"} onClose={close} />
      <Sheet open={open === "size"} onClose={close} title="Size">
        <SizeSection className={FLUSH} />
      </Sheet>
      <Sheet open={open === "then"} onClose={close} title="After each render">
        <FinishSection className={FLUSH} />
        <UpscaleSection className={FLUSH} />
      </Sheet>
    </>
  );
}
