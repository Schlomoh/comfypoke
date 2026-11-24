// What the next Generate is set to, as one line in the dock: the look, the size, how many renders, and what runs
// after each. A tap opens the Run sheet, where all of it is changed in one place.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { useSetups } from "@/data/db/setups";
import { runsSaid } from "@/domain/batch";
import { shortName } from "@/domain/format";
import { LookList } from "@/features/model/look-sheet";
import { useSetup } from "@/features/model/use-setup";
import { FacePassSection } from "@/features/run/face-pass";
import { FinishSection } from "@/features/run/finish";
import { GpuSection, SeedsSection } from "@/features/run/seeds-sheet";
import { SizeSection } from "@/features/run/size";
import { UpscaleSection } from "@/features/run/upscale";
import { recipeAtom, tabAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Sheet } from "@/ui/modal";
import { Pressable } from "@/ui/pressable";
import { Section } from "@/ui/section";

const FLUSH = "px-0 last:border-b-0"; // a section inside a sheet, which has its own padding

function RunSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const setTab = useSetAtom(tabAtom);
  return (
    <Sheet open={open} onClose={onClose} title="Run">
      <Section title="Look" className={FLUSH}>
        <LookList />
        <Button
          onClick={() => {
            setTab("look");
            onClose();
          }}
        >
          Change the model or LoRAs in Look
        </Button>
      </Section>
      <SizeSection className={FLUSH} />
      <Section title="Draft" className={FLUSH}>
        <Checkbox
          on={recipe.draft}
          onChange={(draft) => setRecipe((r) => ({ ...r, draft }))}
          label="Render small and quick, to find a direction; make the good ones big from the image"
        />
      </Section>
      <SeedsSection className={FLUSH} />
      <FinishSection className={FLUSH} />
      <FacePassSection className={FLUSH} />
      <UpscaleSection className={FLUSH} />
      <GpuSection className={FLUSH} />
    </Sheet>
  );
}

export function RunLine() {
  const recipe = useAtomValue(recipeAtom);
  const [open, setOpen] = useState(false);
  const { current, from } = useSetup();
  const setups = useSetups();
  const finishing = recipe.finish && setups.find((s) => s.id === recipe.finish?.setup);
  const look = current?.name ?? (from ? `${from.name}, changed` : shortName(recipe.unet));
  const parts = [
    look,
    `${recipe.aspect} · ${recipe.mp} MP`,
    runsSaid(recipe),
    recipe.draft && "draft",
    finishing && `finish ${finishing.name}`,
    recipe.facePass !== null && "face pass",
    recipe.upscale.auto && `upscale ${recipe.upscale.megapixels} MP`,
  ].filter(Boolean);
  return (
    <>
      <Pressable
        onClick={() => setOpen(true)}
        title="Look, size, seeds and what runs after each render"
        className="flex min-h-11 items-center gap-2 border border-line bg-bg px-3 hover:border-edge fine:min-h-8"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{parts.join(" · ")}</span>
        <span aria-hidden className="text-faint">
          ›
        </span>
      </Pressable>
      <RunSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
