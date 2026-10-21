// A workspace's draft: the recipe being edited, sealed, written back as it changes.
import { sealJson, unsealJson } from "@/data/crypto";
import { db } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { parseRecipe } from "@/domain/parse";
import type { Recipe } from "@/domain/recipe";

export async function loadDraft(space: Space) {
  const row = await db.drafts.get(space.id);
  return parseRecipe(row ? await unsealJson<unknown>(space.key, row.sealed) : {});
}

export const saveDraft = async (space: Space, r: Recipe) =>
  db.drafts.put({ ws: space.id, sealed: await sealJson(space.key, r) });
