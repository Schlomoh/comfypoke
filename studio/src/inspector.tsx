// Everything recorded about one image. Title, notes, tags and character name are the user's and
// editable; how the image was made (prompt, model, seed, LoRAs, upscale) is the record and stays
// as it was. Exported PNGs carry the same record (png.ts).
import { useEffect, useState } from "react";
import { loadImage, updateRender, useSpace, type Render } from "./db";
import { parameters } from "./png";
import { shortName } from "./stage";
import { notify } from "./toast";

function Field({ label, value, onCommit, multiline, placeholder }: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  const props = {
    value: draft,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    className: "field w-full px-2.5 py-2 placeholder:text-faint",
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {multiline ? (
        <textarea {...props} rows={2} className={`${props.className} field-sizing-content min-h-11 resize-none`} />
      ) : (
        <input {...props} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className={`${props.className} h-11 fine:h-8`} />
      )}
    </label>
  );
}

const copy = (text: string, what: string) =>
  navigator.clipboard?.writeText(text).then(() => notify(`${what} copied`), () => notify(`Could not copy the ${what.toLowerCase()}`, { bad: true }));

export function Inspector({ render, all, onOpen }: { render: Render; all: Render[]; onOpen: (r: Render) => void }) {
  const space = useSpace();
  const [bytes, setBytes] = useState<number>();
  useEffect(() => {
    loadImage(space, render.id).then((b) => setBytes(b.size), () => setBytes(undefined));
  }, [space, render.id]);
  const edit = (patch: Partial<Render>) => updateRender(space, render.id, (r) => ({ ...r, ...patch })).then(() => notify("Saved"));
  const source = render.source ? all.find((r) => r.id === render.source) : undefined;
  const upscales = all.filter((r) => r.source === render.id);
  const { recipe: _, ...record } = render;

  const facts: [string, React.ReactNode][] = [
    ["Created", new Date(render.createdAt).toLocaleString()],
    ["Took", `${render.seconds} s`],
    ["Model", render.unet ? shortName(render.unet) : render.model],
    ["Family", render.family],
    ["Size", `${render.width} × ${render.height}`],
    ["Steps", render.steps],
    ["CFG", render.cfg],
    ["Seed", <button className="underline underline-offset-4" onClick={() => copy(String(render.seed), "Seed")}>{render.seed}</button>],
    ["LoRAs", render.loras?.length ? render.loras.map((l) => `${shortName(l.name)} ${l.strength}`).join(", ") : "none"],
    ["File", bytes ? `PNG · ${(bytes / 1024 / 1024).toFixed(2)} MB` : "PNG"],
  ];
  if (render.upscale)
    facts.push(["Upscale", `SeedVR2 ${render.upscale.megapixels} MP${render.upscale.prompt ? ` · touch-up "${render.upscale.prompt}" at ${render.upscale.denoise}` : ""}`]);

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <Field label="Title" value={render.title ?? ""} placeholder="untitled" onCommit={(title) => edit({ title: title.trim() || undefined })} />
      <Field label="Notes" value={render.notes ?? ""} multiline placeholder="what works, what to change" onCommit={(notes) => edit({ notes: notes.trim() || undefined })} />
      <Field
        label="Tags"
        value={(render.tags ?? []).join(", ")}
        placeholder="comma separated"
        onCommit={(t) => edit({ tags: [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))] })}
      />
      <Field label="Character" value={render.characterName ?? ""} placeholder="none" onCommit={(c) => edit({ characterName: c.trim() || undefined })} />

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h4 className="label">Prompt</h4>
          <button onClick={() => copy(render.prompt, "Prompt")} className="h-11 px-2 font-mono text-[10.5px] text-muted uppercase hover:text-ink fine:h-6">copy</button>
        </div>
        <p className="font-mono leading-relaxed text-muted select-text">{render.prompt}</p>
        {render.negative && <p className="font-mono leading-relaxed text-faint select-text">Negative: {render.negative}</p>}
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="min-w-0 break-words text-muted">{v ?? "–"}</dd>
          </div>
        ))}
      </dl>

      {(source || upscales.length > 0 || render.source) && (
        <section className="flex flex-col gap-1.5">
          <h4 className="label">Linked</h4>
          {render.source && (source ? (
            <button onClick={() => onOpen(source)} className="h-11 text-left font-mono text-muted underline underline-offset-4 hover:text-ink fine:h-6">
              ← source image, {source.width} × {source.height}
            </button>
          ) : <p className="font-mono text-faint">source image deleted</p>)}
          {upscales.map((u) => (
            <button key={u.id} onClick={() => onOpen(u)} className="h-11 text-left font-mono text-muted underline underline-offset-4 hover:text-ink fine:h-6">
              → upscale, {u.width} × {u.height}
            </button>
          ))}
        </section>
      )}

      <details className="border border-line">
        <summary className="flex h-11 cursor-pointer items-center px-2.5 font-mono text-[10.5px] text-muted uppercase fine:h-8">Everything, as stored</summary>
        <div className="flex flex-col gap-2 border-t border-line p-2.5">
          <div className="flex gap-3">
            <button onClick={() => copy(JSON.stringify(record, null, 2), "Record")} className="font-mono text-[10.5px] text-muted uppercase underline-offset-4 hover:text-ink">copy json</button>
            <button onClick={() => copy(parameters(render), "Parameters")} className="font-mono text-[10.5px] text-muted uppercase hover:text-ink">copy parameters</button>
          </div>
          <pre className="max-h-80 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">{JSON.stringify(record, null, 2)}</pre>
        </div>
      </details>
      <p className="text-faint">Saved and downloaded PNGs carry this as text chunks: "parameters" for other tools, "studio" as JSON.</p>
    </div>
  );
}
