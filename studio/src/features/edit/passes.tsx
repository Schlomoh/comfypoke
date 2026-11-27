// The passes an edit runs, as chips. Both modes draw with a Z-Image look (its controlnet inpaints, and in People holds a
// fitted body) and finish with an optional other look over what it drew. People then redraws faces with a look; Repaint
// can keep a face photo by a head swap on a Krea 2 finish. A tap opens the pass's choice in place. A look is the Look
// tab as it is, the image's own model, or a saved look.
import { useAtom, useAtomValue } from "jotai";
import { useState, type ReactNode } from "react";

import { FACE_FAMILIES } from "@/data/api";
import { useFaceChoices } from "@/features/edit/face-choices";
import { editAtom, type EditChoice } from "@/features/edit/state";
import { usePasses } from "@/features/edit/use-passes";
import { SaveSetup } from "@/features/model/setups";
import { stageAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Labeled, Select } from "@/ui/field";
import { Popover } from "@/ui/popover";
import { Section } from "@/ui/section";
import { SliderRow } from "@/ui/slider";
import { Note } from "@/ui/text";

type Option = { value: string; label: string };

/** A pass as a chip: what it runs with, and its choice behind a tap. */
function PassChip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Popover
      trigger={<span className="truncate">{label}</span>}
      role="dialog"
      align="start"
      size="inline"
      panel="w-72 gap-2 p-3"
      className="max-w-full min-w-0 text-xs"
    >
      {children}
    </Popover>
  );
}

function PassSelect(p: {
  label: string;
  value: string;
  options: Option[];
  off?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Labeled label={p.label}>
      <Select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        {p.off && <option value="off">{p.off}</option>}
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Labeled>
  );
}

export function Passes() {
  const { render } = useAtomValue(stageAtom);
  const [c, setC] = useAtom(editAtom);
  const [saving, setSaving] = useState(false);
  const { choose } = usePasses(render);
  const faces = useFaceChoices(render);
  const set = (patch: Partial<EditChoice>) => setC((x) => ({ ...x, ...patch }));
  const dresser = choose(c.dresser, "zimage");
  const finish = choose(c.finish);
  const finishing = c.finish !== "off" && !!finish.picked;
  const people = c.mode === "people";
  const faceWith = choose(c.faceWith);
  // the head swap runs on the finish's model
  const canFace =
    !people &&
    finishing &&
    !!finish.picked &&
    FACE_FAMILIES.includes(finish.picked.pass.family) &&
    faces.length > 0;
  const face = faces.find((f) => f.id === c.face);

  return (
    <Section
      title="Passes"
      tip="What runs, in order. A Z-Image look draws what the mask covers: its controlnet inpaints, and holds a person's fitted body. A finish goes over only that, lightly, with another look's fabric, skin and light. Without one it is the quickest, about 7 s on a warm GPU. Faces are redrawn last, each with its person's words and LoRAs; 0.35 keeps the face and sharpens it. Repaint can keep a face photo by a head swap, on a Krea 2 finish only."
      right={
        <Button variant="link" size="inline" onClick={() => setSaving(!saving)}>
          {saving ? "done" : "save as a look"}
        </Button>
      }
    >
      {saving && <SaveSetup placeholder="name Look as it is" />}
      <div className="flex flex-wrap gap-1.5">
        <PassChip label={`${people ? "dress" : "draw"} with ${dresser.picked?.name ?? "no Z-Image look"}`}>
          <PassSelect
            label={`${people ? "Dress" : "Draw"} with (Z-Image)`}
            value={dresser.value}
            options={dresser.opts}
            onChange={(v) => set({ dresser: v })}
          />
        </PassChip>
        <PassChip
          label={finishing ? `finish: ${finish.picked?.name} at ${c.strength.toFixed(2)}` : "no finish"}
        >
          <PassSelect
            label="Finish with"
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
        </PassChip>
        {people && (
          <PassChip label={`faces: ${faceWith.picked?.name ?? "…"} at ${c.faceStrength.toFixed(2)}`}>
            <PassSelect
              label="Redraw faces with"
              value={faceWith.value}
              options={faceWith.opts}
              onChange={(v) => set({ faceWith: v })}
            />
            <SliderRow
              label="Strength"
              min={0.15}
              max={0.6}
              step={0.05}
              value={c.faceStrength}
              onValue={(faceStrength) => set({ faceStrength })}
            />
          </PassChip>
        )}
        {canFace && (
          <PassChip label={`face: ${face?.name ?? "none"}`}>
            <PassSelect
              label="Keep a face"
              value={c.face}
              options={[{ value: "", label: "none" }, ...faces.map((f) => ({ value: f.id, label: f.name }))]}
              onChange={(v) => set({ face: v })}
            />
          </PassChip>
        )}
      </div>
      {!dresser.opts.length && <Note tone="warn">Save a Z-Image look to draw and dress with.</Note>}
    </Section>
  );
}
