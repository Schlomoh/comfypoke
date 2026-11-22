// The Edit tab: edit the image on the stage. The mask (made from the bar under the image, listed here), then what
// goes in: with the body's shape kept, a person's Wearing row from the Prompt tab, one render per outfit; without,
// a few words repainted into the mask. Then the passes and what they run with. The bar at the bottom sends it.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { outfitPieces } from "@/domain/outfits";
import { MaskSummary } from "@/features/edit/mask-summary";
import { Passes } from "@/features/edit/passes";
import { editAtom } from "@/features/edit/state";
import { flash } from "@/features/prompt/flash";
import { Row } from "@/features/prompt/rows";
import { openAtom } from "@/features/prompt/state";
import { recipeAtom, stageAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Tip } from "@/ui/tip";

const HOLDS = [
  { value: "tight", label: "tight" },
  { value: "loose", label: "loose" },
  { value: "off", label: "free" },
] as const;

function Wearing() {
  const recipe = useAtomValue(recipeAtom);
  const [c, setC] = useAtom(editAtom);
  const setOpen = useSetAtom(openAtom);
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  const renders = outfitPieces(person);
  return (
    <>
      {recipe.cast.length > 1 && (
        <ChipRow>
          {recipe.cast.map((p) => (
            <Chip
              key={p.id}
              tone={p.id === person.id ? "picked" : "quiet"}
              onClick={() => setC((x) => ({ ...x, person: p.id }))}
            >
              {p.name || "unnamed"}
            </Chip>
          ))}
        </ChipRow>
      )}
      <Row
        phrases={person.wear}
        label={`What ${person.name || "they"} wear`}
        hint="clothes"
        onOpen={(shown) => {
          setOpen({ kind: "row", key: person.id, row: "wear", target: null });
          if (shown) setTimeout(() => flash(shown));
        }}
      />
      {/* each render spelled out: switched-on pieces are worn together, a piece's versions make more renders */}
      <ol className="flex flex-col gap-0.5 font-mono text-[11px] text-muted">
        {renders.length === 0 && (
          <li className="text-faint">Add what goes on: a piece of clothing per chip.</li>
        )}
        {renders.map((pieces, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- the renders are numbered by place
          <li key={i} className="break-words">
            <span className="text-faint">Render {i + 1}:</span> {pieces.join(" + ")}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <Segmented
          className="flex-1"
          value={c.hold}
          options={HOLDS}
          onChange={(hold) => setC((x) => ({ ...x, hold }))}
        />
        <Tip label="About the hold">
          Tight: the body&apos;s mesh pins the silhouette, the arms and the hands, for fitted clothes. Loose:
          the body stays, the outline may change, so a dress can flare and a hoodie hang. Free: no mesh, only
          the picture around the mask; the body may change with it.
        </Tip>
      </div>
    </>
  );
}

export function EditPanel() {
  const { render, job } = useAtomValue(stageAtom);
  const [c, setC] = useAtom(editAtom);
  const dress = c.mode === "dress";
  return (
    <div>
      {render ? (
        <MaskSummary key={render.id} render={render} />
      ) : (
        <p className="border-b border-line px-4 py-4 text-xs text-muted">
          {job ? "The stage shows a render on its way: edit it when it lands." : "No image to edit yet."}
        </p>
      )}
      <Section
        title="What goes in"
        tip="With the body's shape kept, the mask is dressed in a person's Wearing row from the Prompt tab, presets and saved characters included: the chips switched on are worn together, and each version of a chip makes another render. Without it, what you write is painted into the mask with any look."
      >
        <Checkbox
          on={dress}
          onChange={(on) => setC((x) => ({ ...x, mode: on ? "dress" : "repaint" }))}
          label={<span className="text-[13px]">Keep the body&apos;s shape</span>}
        />
        {dress ? (
          <Wearing />
        ) : (
          <Textarea
            value={c.repaint}
            onChange={(e) => setC((x) => ({ ...x, repaint: e.target.value }))}
            placeholder="only what goes inside the mask: a red silk scarf"
          />
        )}
      </Section>
      <Passes />
    </div>
  );
}
