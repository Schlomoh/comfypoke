// Which model, in which family, and the negative prompt when its CFG uses one.
import { useAtomValue, useSetAtom } from "jotai";

import { useCatalog } from "@/data/queries";
import { resolve, type Model } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import { recipeAtom } from "@/state/studio";
import { Select, Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Note } from "@/ui/text";

const option = (m: Model) => (
  <option key={m.file} value={m.file}>
    {shortName(m.file)}
  </option>
);

export function ModelSection() {
  const recipe = useAtomValue(recipeAtom);
  const setRecipe = useSetAtom(recipeAtom);
  const { catalog } = useCatalog();
  const { model, family, defaults, negative } = resolve(recipe, catalog);

  return (
    <>
      <Section
        title="Model"
        right={
          model &&
          !model.verified && <span className="font-mono text-[10.5px] text-warn uppercase">unverified</span>
        }
      >
        <Select
          mono
          value={recipe.unet}
          onChange={(e) => {
            const unet = e.target.value;
            setRecipe((r) => ({ ...r, unet, family: null, steps: null, cfg: null }));
          }}
        >
          {!model && catalog.models.length > 0 && (
            <option value={recipe.unet}>{shortName(recipe.unet)} (not on the volume)</option>
          )}
          <optgroup label="Verified">{catalog.models.filter((m) => m.verified).map(option)}</optgroup>
          <optgroup label="Unverified, at your own risk">
            {catalog.models.filter((m) => !m.verified).map(option)}
          </optgroup>
        </Select>
        <div className="flex items-center gap-2">
          <span className="w-14 label">Family</span>
          <Segmented
            className="flex-1"
            value={family?.id ?? ""}
            options={catalog.families.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) =>
              setRecipe((r) => ({ ...r, family: v === model?.family ? null : v, steps: null, cfg: null }))
            }
          />
        </div>
        <Note mono>
          {defaults?.steps} steps · CFG {defaults?.cfg} ·{" "}
          {negative ? "negative prompt on" : "no negative prompt (CFG 1)"}
          {recipe.family && " · family set by hand"}
        </Note>
        {model && !model.verified && (
          <Note tone="warn">
            Not tested in the studio. It runs with the {family?.label} text encoder, VAE and sampler, guessed
            from the file name. If the file is another kind of model, the render fails after the GPU has
            loaded it, and that time is billed.
          </Note>
        )}
      </Section>
      {negative && (
        <Section title="Negative prompt">
          <Textarea
            value={recipe.negative}
            onChange={(e) => {
              const text = e.target.value;
              setRecipe((r) => ({ ...r, negative: text }));
            }}
            rows={2}
          />
        </Section>
      )}
    </>
  );
}
