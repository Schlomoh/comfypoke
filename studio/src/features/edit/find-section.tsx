// The mask's first steps: name something and SAM 3.1 finds it (/api/mask, a few seconds on a warm GPU), added to
// what is painted on the stage. The suggestions are what the image's people were wearing, then the usual parts.
// Found areas can be taken out again; invert, clear and the fitted body are here too.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { api, Locked } from "@/data/api";
import { loadImage } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import { status } from "@/domain/job";
import type { Render } from "@/domain/render";
import { areaOf, type Op } from "@/features/edit/mask";
import { masksAtom, showBodyAtom } from "@/features/edit/state";
import { base64 } from "@/state/jobs";
import { preview, usePreview } from "@/state/preview";
import { Button } from "@/ui/button";
import { Chip, ChipRow, Tag } from "@/ui/chip";
import { Input } from "@/ui/field";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

/** Garments by name: "clothing" alone found a t-shirt and left the jeans. */
const PARTS: [string, string][] = [
  ["all clothes", "shirt, top, pants, shorts, skirt, dress, jacket"],
  ["top", "shirt, top"],
  ["bottoms", "pants, shorts, skirt"],
  ["shoes", "shoes"],
  ["jacket", "jacket, coat"],
  ["hair", "hair"],
  ["background", "background"],
];

/** What the image's people wore, as written: the likeliest things to find again. */
const worn = (r: Render) => [
  ...new Set(
    r.recipe?.cast.flatMap((p) => p.wear.filter((x) => x.on && x.t.trim()).map((x) => x.t.trim())) ?? [],
  ),
];

export function FindSection({ render }: { render: Render }) {
  const space = useSpace();
  const ops = useAtomValue(masksAtom)[render.id] ?? [];
  const setMasks = useSetAtom(masksAtom);
  const [bodyOf, setBodyOf] = useAtom(showBodyAtom);
  const showBody = bodyOf === render.id;
  const body = usePreview(`body:${render.id}`);
  const [text, setText] = useState("");
  const [finding, setFinding] = useState<Record<string, string>>({}); // text → its stage
  const [error, setError] = useState("");
  const add = (op: Op) => setMasks((m) => ({ ...m, [render.id]: [...(m[render.id] ?? []), op] }));
  const image = async () => base64(await loadImage(space, render.id));

  /** `label` is how the area is listed and recorded, `what` what SAM is asked for. */
  const find = async (label: string, what = label) => {
    const t = label.trim();
    if (!t || finding[t]) return;
    setError("");
    setFinding((f) => ({ ...f, [t]: "queued" }));
    try {
      const b64 = await preview(
        async () => api.mask(await image(), what.trim()),
        (stage) => setFinding((f) => ({ ...f, [t]: stage })),
      );
      const area = await areaOf(b64);
      if (!area) throw new Error("nothing found by that name; try other words, or paint it");
      add({ kind: "found", id: crypto.randomUUID(), text: t, area });
      setText((x) => (x.trim() === t ? "" : x));
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(`Could not find “${t}”: ${errorText(e)}`);
    } finally {
      setFinding((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== t)));
    }
  };

  const toggleBody = () => {
    if (!showBody) body.run(async () => api.body(await image()));
    setBodyOf(showBody ? null : render.id);
  };

  const found = ops.flatMap((o) => (o.kind === "found" ? [o] : []));
  const busy = Object.entries(finding);
  const suggestions = [...worn(render).map((t): [string, string] => [t, t]), ...PARTS];

  return (
    <Section
      title="Mask"
      right={
        <div className="flex gap-1">
          <Button variant="text" disabled={!ops.length} onClick={() => add({ kind: "invert" })}>
            invert
          </Button>
          <Button variant="text" disabled={!ops.length} onClick={() => add({ kind: "clear" })}>
            clear
          </Button>
          <Button variant="text" aria-pressed={showBody} onClick={toggleBody}>
            body
          </Button>
        </div>
      }
    >
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void find(text);
        }}
      >
        <Input
          className="min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="find: her jacket, the sofa"
          enterKeyHint="search"
        />
        <Button type="submit" disabled={!text.trim()}>
          Find
        </Button>
      </form>
      <ChipRow>
        {suggestions.map(([label, what]) => (
          <Chip key={label} tone="quiet" disabled={!!finding[label]} onClick={() => void find(label, what)}>
            {label}
          </Chip>
        ))}
      </ChipRow>
      {(found.length > 0 || busy.length > 0) && (
        <ChipRow>
          {found.map((o) => (
            <Tag
              key={o.id}
              tone="mask"
              removeLabel={`Take ${o.text} out of the mask`}
              onRemove={() =>
                setMasks((m) => ({ ...m, [render.id]: (m[render.id] ?? []).filter((x) => x !== o) }))
              }
            >
              {o.text}
            </Tag>
          ))}
          {busy.map(([t, stage]) => (
            <span key={t} className="px-1 py-1.5 font-mono text-[11px] text-muted">
              {t}: {status({ id: "", startedAt: 0, step: 0, steps: 0, stage })}
            </span>
          ))}
        </ChipRow>
      )}
      {error && <Note tone="bad">{error}</Note>}
      {showBody && (body.stage || body.error) && (
        <Note tone={body.error ? "bad" : "muted"} mono>
          {body.error ?? `body: ${status({ id: "", startedAt: 0, step: 0, steps: 0, stage: body.stage })}`}
        </Note>
      )}
      <Note>
        {showBody
          ? "The stage shows the body dressing holds to. Tap body again to paint."
          : "Each find adds to the mask; paint on the image to add more, the eraser takes away. Two fingers zoom."}
      </Note>
    </Section>
  );
}
