// One Jotai store per open workspace: switching workspaces starts from nothing, and the draft it opens
// with is the recipe.
import { createStore, Provider } from "jotai";
import { useState, type ReactNode } from "react";

import { SpaceContext, type Space } from "@/data/db/space";
import type { Recipe } from "@/domain/recipe";
import { recipeAtom } from "@/state/studio";

export function WorkspaceProvider({
  space,
  draft,
  children,
}: {
  space: Space;
  draft: Recipe;
  children: ReactNode;
}) {
  const [store] = useState(() => {
    const s = createStore();
    s.set(recipeAtom, draft);
    return s;
  });
  return (
    <SpaceContext value={space}>
      <Provider store={store}>{children}</Provider>
    </SpaceContext>
  );
}
