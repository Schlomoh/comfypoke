// "Start from an example" on an empty workspace's stage: Who, Look, Where and Shot filled with presets (domain/example.ts).
import { useSetAtom } from "jotai";

import { usePresets } from "@/data/db/prompt-catalog";
import { example } from "@/domain/example";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";

export function ExampleButton() {
  const setRecipe = useSetAtom(recipeAtom);
  const presets = usePresets();
  return (
    <Button disabled={!presets} onClick={() => presets && setRecipe((r) => example(r, presets))}>
      Start from an example
    </Button>
  );
}
