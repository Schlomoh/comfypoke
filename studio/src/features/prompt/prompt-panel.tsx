// The prompt as the people in the picture and its scene. A tab is a person (or the scene), linked to a
// saved character (or scene) or new, and says which. Each row holds phrases, one idea each; a phrase
// can carry versions, and every version is its own render. The prompt underneath is what is sent.
import { useAtom, useSetAtom } from "jotai";

import { placeholderName, type Key } from "@/domain/cast";
import { newPerson } from "@/domain/recipe";
import { CastTabs } from "@/features/prompt/cast-tabs";
import { flash } from "@/features/prompt/flash";
import { LinkSheet } from "@/features/prompt/link-sheet";
import { PromptPreview } from "@/features/prompt/prompt-preview";
import { RowSheet } from "@/features/prompt/row-sheet";
import { Rows } from "@/features/prompt/rows";
import { castTabAtom, openAtom } from "@/features/prompt/state";
import { recipeAtom } from "@/state/studio";

export function PromptPanel() {
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const [tab, setTab] = useAtom(castTabAtom);
  const setOpen = useSetAtom(openAtom);
  // the tab as it can be shown: a Reuse can replace the people
  const key: Key =
    tab === "scene" || recipe.cast.some((c) => c.id === tab) ? (tab ?? recipe.cast[0].id) : recipe.cast[0].id;

  const addPerson = () => {
    const p = newPerson(placeholderName(recipe));
    setRecipe((r) => ({ ...r, cast: [...r.cast, p] }));
    setTab(p.id);
    requestAnimationFrame(() =>
      document.getElementById(`tab-${p.id}`)?.scrollIntoView({ inline: "nearest", block: "nearest" }),
    );
  };

  return (
    <div>
      <CastTabs
        active={key}
        onTab={(k) => (k === key ? setOpen({ kind: "link", key: k }) : setTab(k))}
        onMenu={() => setOpen({ kind: "link", key })}
        onAdd={addPerson}
      />
      <Rows
        tab={key}
        onOpen={(row, shown) => {
          // the sheet always opens adding a new phrase; a tapped chip only brings its card into view
          setOpen({ kind: "row", key, row, target: null });
          if (shown) setTimeout(() => flash(shown)); // a click's update has committed by then
        }}
      />
      <PromptPreview />
      <RowSheet />
      <LinkSheet />
    </div>
  );
}
