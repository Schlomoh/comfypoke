// The mask so far, as its steps: what was found or tapped, painted, erased, inverted or cleared, each one taken out
// with its ×. Strokes in a row are one step here. An image without a mask can take its source's. Below them, what is still being found and the body's state.
import { useAtom, useAtomValue } from "jotai";

import { status } from "@/domain/job";
import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import { masksAtom, showBodyAtom, tapsAtom } from "@/features/edit/state";
import { useFinding } from "@/features/edit/use-find";
import { usePreview } from "@/state/preview";
import { rendersAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { ChipRow, Tag } from "@/ui/chip";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

const stage = (s: string) => status({ id: "", startedAt: 0, step: 0, steps: 0, stage: s });

const labelOf = (op: Op) => {
  if (op.kind === "found") return op.text;
  if (op.kind === "stroke") return op.erase ? "erased" : "painted";
  return op.kind === "invert" ? "inverted" : "cleared";
};

/** The steps grouped for showing: strokes of one kind in a row are one group. */
function grouped(ops: Op[]) {
  const out: { label: string; ops: Op[] }[] = [];
  for (const op of ops) {
    const last = out.at(-1);
    if (op.kind === "stroke" && last?.ops[0].kind === "stroke" && last.label === labelOf(op))
      last.ops.push(op);
    else out.push({ label: labelOf(op), ops: [op] });
  }
  return out;
}

/** The steps of the mask `maskKey` (features/edit/state maskKey) on `render`, under `title`. */
export function MaskSummary({
  render,
  maskKey: key,
  title,
}: {
  render: Render;
  maskKey: string;
  title: string;
}) {
  const [masks, setMasks] = useAtom(masksAtom);
  const [bodyOf] = useAtom(showBodyAtom);
  const [taps, setTaps] = useAtom(tapsAtom);
  const body = usePreview(`body:${render.id}`);
  const finding = useFinding(key);
  const groups = grouped(masks[key] ?? []);
  const showBody = bodyOf === render.id;
  // steps are fractions of the image, so the source's mask fits any image of its shape: an upscale, an edit. Only the
  // image's own: people are numbered by the faces found on each image, which need not agree.
  const source = (useAtomValue(rendersAtom) ?? []).find((r) => r.id === render.source);
  const sameShape = !!source && Math.abs(source.width / source.height - render.width / render.height) < 0.01;
  const carried = sameShape && key === render.id ? (masks[source.id] ?? []) : [];
  return (
    <Section
      title={title}
      tip="What the edit changes. Paint it, tap a thing for SAM 3.1 to find it, or find it by words, all from the bar under the image; the eraser takes away. Each step can be taken out here. Body shows the body dressing holds to, under the mask."
    >
      {groups.length === 0 && finding.length === 0 && (
        <Note>Nothing yet: paint, tap or find on the image.</Note>
      )}
      {groups.length === 0 && carried.length > 0 && (
        <Button
          variant="link"
          size="inline"
          className="self-start"
          onClick={() => setMasks((m) => ({ ...m, [key]: carried }))}
        >
          Use the mask of the image it was made from
        </Button>
      )}
      {(groups.length > 0 || finding.length > 0) && (
        <ChipRow>
          {groups.map((g) => (
            <Tag
              key={masks[key]?.indexOf(g.ops[0])}
              tone="mask"
              removeLabel={`Take “${g.label}” out of the mask`}
              onRemove={() => {
                setMasks((m) => ({
                  ...m,
                  [key]: (m[key] ?? []).filter((o) => !g.ops.includes(o)),
                }));
                // the tapped area still open: its points go too, or the next tap brings it back
                const open = taps[key]?.op;
                if (g.ops.some((o) => o.kind === "found" && o.id === open))
                  setTaps((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
              }}
            >
              {g.label}
              {g.ops.length > 1 && <span className="text-faint"> ×{g.ops.length}</span>}
            </Tag>
          ))}
          {finding.map((f) => (
            <span key={f.text} className="px-1 py-1.5 font-mono text-[11px] text-muted">
              {f.text}: {stage(f.stage)}
            </span>
          ))}
        </ChipRow>
      )}
      {showBody && (body.stage || body.error) && (
        <Note tone={body.error ? "bad" : "muted"} mono>
          {body.error ?? `body: ${stage(body.stage ?? "")}`}
        </Note>
      )}
    </Section>
  );
}
