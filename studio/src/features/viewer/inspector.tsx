// Everything recorded about one image. Title, notes, tags and character name are the user's and
// editable; how the image was made (prompt, model, seed, LoRAs, upscale) is the record and stays
// as it was. Exported PNGs carry the same record (@/domain/png).
import { useAtomValue } from "jotai";
import { useEffect, useState, type ReactNode } from "react";

import { loadImage, updateRender } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { shortName } from "@/domain/format";
import { parameters } from "@/domain/png";
import type { Render } from "@/domain/render";
import { useImageActions } from "@/state/actions";
import { rendersAtom } from "@/state/studio";
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
  const rows: [string, ReactNode][] = [
    ["Created", new Date(render.createdAt).toLocaleString()],
    ["Took", `${render.seconds} s`],
    ["Model", render.unet ? shortName(render.unet) : render.model],
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
    ["File", bytes ? `PNG · ${(bytes / 1024 / 1024).toFixed(2)} MB` : "PNG"],
  ];
  const u = render.upscale;
  if (u)
    rows.push([
      "Upscale",
      `SeedVR2 ${u.megapixels} MP${u.prompt ? ` · touch-up "${u.prompt}" at ${u.denoise}` : ""}`,
    ]);
  return rows;
}

function Linked({ render }: { render: Render }) {
  const all = useAtomValue(rendersAtom) ?? [];
  const { open } = useImageActions();
  const source = render.source ? all.find((r) => r.id === render.source) : undefined;
  const upscales = all.filter((r) => r.source === render.id);
  if (!render.source && !upscales.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Heading>Linked</Heading>
      {render.source && !source && <p className="font-mono text-faint">source image deleted</p>}
      {source && (
        <Button variant="link" size="inline" className="justify-start px-0" onClick={() => open(source.id)}>
          ← source image, {source.width} × {source.height}
        </Button>
      )}
      {upscales.map((u) => (
        <Button
          key={u.id}
          variant="link"
          size="inline"
          className="justify-start px-0"
          onClick={() => open(u.id)}
        >
          → upscale, {u.width} × {u.height}
        </Button>
      ))}
    </section>
  );
}

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

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono">
        {facts(render, bytes).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="min-w-0 break-words text-muted">{v ?? "–"}</dd>
          </div>
        ))}
      </dl>

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
