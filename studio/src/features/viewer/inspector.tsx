// Everything recorded about one image. Title, notes, tags and character name are the user's and
// editable; how the image was made (prompt, model, seed, LoRAs, upscale) is the record and stays
// as it was. Exported PNGs carry the same record (@/domain/png).
import { useEffect, useState, type ReactNode } from "react";

import { loadImage, updateRender } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { shortName } from "@/domain/format";
import { parameters } from "@/domain/png";
import type { Render } from "@/domain/render";
import { FaceMatch } from "@/features/viewer/face-match";
import { Linked } from "@/features/viewer/linked";
import { Button } from "@/ui/button";
import { Input, Labeled, Textarea } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Heading, Note } from "@/ui/text";

function Field({
  label,
  value,
  onCommit,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    // the stored value changed under the field: show it
    setWas(value);
    setDraft(value);
  }
  const commit = () => draft !== value && onCommit(draft);
  const common = { value: draft, placeholder, onBlur: commit, className: "w-full" };
  return (
    <Labeled label={label}>
      {multiline ? (
        <Textarea {...common} rows={2} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Input
          {...common}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      )}
    </Labeled>
  );
}

const copy = (text: string, what: string) =>
  void navigator.clipboard?.writeText(text).then(
    () => notify(`${what} copied`),
    () => notify(`Could not copy the ${what.toLowerCase()}`, { bad: true }),
  );

function facts(render: Render, bytes?: number): [string, ReactNode][] {
  const file = bytes ? `PNG · ${(bytes / 1024 / 1024).toFixed(2)} MB` : "PNG";
  if (render.uploaded)
    // nothing rendered it: what it was made with is not a thing to show
    return [
      ["Added", new Date(render.createdAt).toLocaleString()],
      ["Photo", render.uploaded],
      ["Size", `${render.width} × ${render.height}`],
      ["File", file],
      ["Edits with", render.unet ? shortName(render.unet) : ""],
    ];
  const rows: [string, ReactNode][] = [
    ["Created", new Date(render.createdAt).toLocaleString()],
    ["Took", `${render.seconds} s`],
    ["Model", `${render.unet ? shortName(render.unet) : render.model}${finishedBy(render)}`],
    ["Family", render.family],
    ["Size", `${render.width} × ${render.height}`],
    ["Steps", render.steps],
    ["CFG", render.cfg],
    [
      "Seed",
      <Button
        key="seed"
        variant="link"
        size="inline"
        className="px-0"
        onClick={() => copy(String(render.seed), "Seed")}
      >
        {render.seed}
      </Button>,
    ],
    [
      "LoRAs",
      render.loras?.length
        ? render.loras.map((l) => `${shortName(l.name)} ${l.strength}`).join(", ")
        : "none",
    ],
    ["File", file],
  ];
  if (render.reference) rows.push(["Face", "swapped in from a face photo"]);
  else if (render.face_pass) rows.push(["Face", `redrawn at ${render.face_pass}`]);
  const e = render.edit;
  if (e?.dress) {
    const d = e.dress;
    const finish = typeof d.finish === "string" ? d.finish : d.finish && "Krea 2";
    rows.push([
      "Outfit",
      `"${e.prompt}" in place of ${e.target}, body held ${d.hold} · dressed by ${d.dresser ?? "Z-Image Turbo"}${finish ? ` · finished by ${finish}${d.strength ? ` at ${d.strength}` : ""}` : ""}${e.face ? ` · ${e.face}'s face` : ""}`,
    ]);
  } else if (e)
    rows.push([
      "Edit",
      `repainted "${e.prompt}"${e.target ? ` where "${e.target}" was found` : ""}${e.setup ? ` · with ${e.setup}` : ""}${e.face ? ` · ${e.face}'s face` : ""}`,
    ]);
  const u = render.upscale;
  if (u)
    rows.push([
      "Upscale",
      `SeedVR2 ${u.megapixels} MP${u.prompt ? ` · touch-up "${u.prompt}" at ${u.denoise}` : ""}`,
    ]);
  return rows;
}

/** A render's finish pass, after its model: " → krea2_raw_bf16 at 0.35". */
const finishedBy = (r: Render) =>
  r.finish && !r.edit ? ` → ${shortName(r.finish.unet)} at ${r.finish.denoise}` : "";

export function Inspector({ render }: { render: Render }) {
  const space = useSpace();
  const [bytes, setBytes] = useState<number>();
  useEffect(() => {
    loadImage(space, render.id).then(
      (b) => setBytes(b.size),
      () => setBytes(undefined),
    );
  }, [space, render.id]);
  const edit = (patch: Partial<Render>) =>
    void updateRender(space, render.id, (r) => ({ ...r, ...patch })).then(() => notify("Saved"));
  const { recipe: _, ...record } = render;
  const json = JSON.stringify(record, null, 2);

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <Field
        label="Title"
        value={render.title ?? ""}
        placeholder="untitled"
        onCommit={(t) => edit({ title: t.trim() || undefined })}
      />
      <Field
        label="Notes"
        value={render.notes ?? ""}
        multiline
        placeholder="what works, what to change"
        onCommit={(n) => edit({ notes: n.trim() || undefined })}
      />
      <Field
        label="Tags"
        value={(render.tags ?? []).join(", ")}
        placeholder="comma separated"
        onCommit={(t) =>
          edit({
            tags: [
              ...new Set(
                t
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              ),
            ],
          })
        }
      />
      <Field
        label="Character"
        value={render.characterName ?? ""}
        placeholder="none"
        onCommit={(c) => edit({ characterName: c.trim() || undefined })}
      />

      {render.prompt && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Heading>Prompt</Heading>
            <Button variant="text" onClick={() => copy(render.prompt, "Prompt")}>
              copy
            </Button>
          </div>
          <p className="font-mono leading-relaxed text-muted select-text">{render.prompt}</p>
          {render.negative && (
            <p className="font-mono leading-relaxed text-faint select-text">Negative: {render.negative}</p>
          )}
        </section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono">
        {facts(render, bytes).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="min-w-0 break-words text-muted">{v ?? "–"}</dd>
          </div>
        ))}
      </dl>

      <FaceMatch key={render.id} render={render} />

      <Linked render={render} />

      <details className="border border-line">
        <summary className="flex h-11 cursor-pointer items-center px-2.5 font-mono text-[10.5px] text-muted uppercase fine:h-8">
          Everything, as stored
        </summary>
        <div className="flex flex-col gap-2 border-t border-line p-2.5">
          <div className="flex gap-3">
            <Button variant="text" size="inline" className="px-0" onClick={() => copy(json, "Record")}>
              copy json
            </Button>
            <Button
              variant="text"
              size="inline"
              className="px-0"
              onClick={() => copy(parameters(render), "Parameters")}
            >
              copy parameters
            </Button>
          </div>
          <pre className="max-h-80 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">
            {json}
          </pre>
        </div>
      </details>
      <Note>
        Saved and downloaded PNGs carry this as text chunks: "parameters" for other tools, "studio" as JSON.
      </Note>
    </div>
  );
}
