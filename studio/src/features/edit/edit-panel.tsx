// The Edit tab: edit the image on the stage. The mask first (find-section.tsx, and painting on the stage), then
// what goes in: a person's Wearing row from the Prompt tab, each outfit one render, or a few words for a repaint.
// Each pass says which model runs it: the Model tab, the image's own, or a saved setup. The bar at the bottom sends it.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { FACE_FAMILIES } from "@/data/api";
import type { Hold } from "@/domain/render";
import { useFaceChoices } from "@/features/edit/face-choices";
import { FindSection } from "@/features/edit/find-section";
import { editAtom, type EditChoice } from "@/features/edit/state";
import { usePasses } from "@/features/edit/use-passes";
import { SaveSetup } from "@/features/model/setups";
import { flash } from "@/features/prompt/flash";
import { Row } from "@/features/prompt/rows";
import { openAtom } from "@/features/prompt/state";
import { recipeAtom, stageAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Labeled, Select, Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { SliderRow } from "@/ui/slider";
import { Note } from "@/ui/text";

const HOLDS = [
  { value: "tight", label: "tight" },
  { value: "loose", label: "loose" },
  { value: "off", label: "off" },
] as const;
const HOLD_NOTE: Record<Hold, string> = {
  tight: "The body's mesh pins the silhouette, the arms and the hands: fitted clothes.",
  loose: "The body stays, the outline may change: a dress can flare, a hoodie hang.",
  off: "No mesh, only the picture around the mask: freest, and the body may change with it.",
};

function Wearing() {
  const recipe = useAtomValue(recipeAtom);
  const [c, setC] = useAtom(editAtom);
  const setOpen = useSetAtom(openAtom);
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
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
      <Note>
        The Wearing row of the Prompt tab, presets and saved characters included: each version is one render.
      </Note>
    </>
  );
}

function PassSelect({
  label,
  value,
  options,
  onChange,
  off,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  off?: string; // the choice that skips the pass, when it can be skipped
}) {
  return (
    <Labeled label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {off && <option value="off">{off}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Labeled>
  );
}

function Passes() {
  const { render } = useAtomValue(stageAtom);
  const [c, setC] = useAtom(editAtom);
  const [saving, setSaving] = useState(false);
  const { choose } = usePasses(render);
  const faces = useFaceChoices(render);
  const set = (patch: Partial<EditChoice>) => setC((x) => ({ ...x, ...patch }));
  const dresser = choose(c.dresser, "zimage");
  const finish = choose(c.finish);
  const repaint = choose(c.repaintWith);
  const finishing = c.finish !== "off" && !!finish.picked;
  const dressLast = finishing ? finish.picked : null; // the head swap runs on the last pass's model
  const last = c.mode === "dress" ? dressLast : repaint.picked;
  const canFace = !!last && FACE_FAMILIES.includes(last.pass.family) && faces.length > 0;

  return (
    <Section
      title="Models"
      right={
        <Button variant="link" size="inline" onClick={() => setSaving(!saving)}>
          {saving ? "done" : "save Look as a setup"}
        </Button>
      }
    >
      {saving && <SaveSetup placeholder="name Look as it is" />}
      {c.mode === "dress" ? (
        <>
          <PassSelect
            label="1 · Dress with (Z-Image: its controlnet holds the body)"
            value={dresser.value}
            options={dresser.opts}
            onChange={(v) => set({ dresser: v })}
          />
          {!dresser.opts.length && <Note tone="warn">Save a Z-Image setup to dress with.</Note>}
          <Segmented value={c.hold} options={HOLDS} onChange={(hold) => set({ hold })} />
          <Note>{HOLD_NOTE[c.hold]}</Note>
          <PassSelect
            label="2 · Finish with"
            value={c.finish === "off" ? "off" : finish.value}
            options={finish.opts}
            off="no finish: as Z-Image drew it"
            onChange={(v) => set({ finish: v })}
          />
          {finishing && (
            <SliderRow
              label="Strength"
              min={0.1}
              max={0.8}
              step={0.05}
              value={c.strength}
              onValue={(strength) => set({ strength })}
            />
          )}
          <Note>
            {finishing
              ? "Repaints only the new clothes, lightly: this model's fabric, skin and light on Z-Image's shape. 0.35 held the body in tests."
              : "The quickest: about 7 s on a warm GPU."}
          </Note>
        </>
      ) : (
        <PassSelect
          label="Repaint with"
          value={repaint.value}
          options={repaint.opts}
          onChange={(v) => set({ repaintWith: v })}
        />
      )}
      {canFace && (
        <Labeled label="Keep a face">
          <Select value={c.face} onChange={(e) => set({ face: e.target.value })}>
            <option value="">none</option>
            {faces.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Labeled>
      )}
    </Section>
  );
}

export function EditPanel() {
  const { render, job } = useAtomValue(stageAtom);
  const [c, setC] = useAtom(editAtom);
  return (
    <div>
      {render ? (
        <FindSection key={render.id} render={render} />
      ) : (
        <Note className="border-b border-line px-4 py-4">
          {job ? "The stage shows a render on its way: edit it when it lands." : "No image to edit yet."}
        </Note>
      )}
      <Section title="What goes in">
        <Segmented
          value={c.mode}
          options={[
            { value: "dress", label: "dress" },
            { value: "repaint", label: "repaint" },
          ]}
          onChange={(mode) => setC((x) => ({ ...x, mode }))}
        />
        {c.mode === "dress" ? (
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
