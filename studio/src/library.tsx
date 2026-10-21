// Everything rendered in this workspace, filterable by character and by the Best mark, plus the
// full-screen viewer, the download of what is shown (into a folder, or as a zip), and the library
// backup (characters, presets and LoRA notes as one JSON file).
import { useLiveQuery } from "dexie-react-hooks";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { useEffect, useRef, useState } from "react";
import { canPickFolder, chooseFolder, folderOf, forgetFolder, saveToFolder } from "./folder";
import { db, exportLibrary, importLibrary, loadImage, removeRender, updateRender, useImage, useSpace, useThumb, type Render, type Space } from "./db";
import type { Job } from "./jobs";
import { describe, progress, useObjectUrl } from "./stage";
import { ZoomBar, ZoomView } from "./zoom";
import { Btn, errorText, Seg } from "./ui";
import type { View } from "./zoom";

const fileName = (r: Render) => `studio-${r.characterName ? `${r.characterName.replace(/[^\w-]+/g, "_")}-` : ""}${r.seed}`;

export async function saveImage(space: Space, r: Render) {
  const dir = canPickFolder ? await folderOf(space).catch(() => null) : null;
  // a folder that cannot be written to falls back to a plain download, so S never does nothing
  if (dir && (await saveToFolder(space, dir, [r]).then(() => true, () => false))) return;
  const file = new File([await loadImage(space, r.id)], `${fileName(r)}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    // the share sheet is how a phone puts an image into its photo library
    return navigator.share({ files: [file] }).catch(() => {});
  }
  download(file);
}

export function download(file: Blob & { name?: string }, name = file.name ?? "download") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // iOS may take a while to start reading a large zip
}

export async function deleteRender(r: Render) {
  if (!confirm("Delete this image from this device?")) return false;
  await removeRender(r.id);
  return true;
}

export const toggleBest = (space: Space, r: Render) => updateRender(space, r.id, (stored) => ({ ...stored, best: !stored.best }));

/** The renders as one zip: the PNGs as they are (stored, not compressed again) and metadata.json with their settings. */
async function zipRenders(space: Space, renders: Render[], onProgress: (done: number) => void) {
  const parts: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    parts.push(chunk);
  });
  const add = (name: string, data: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };
  const meta = [];
  for (const [i, r] of renders.entries()) {
    const file = `${String(i + 1).padStart(4, "0")}-${fileName(r)}.png`;
    add(file, new Uint8Array(await (await loadImage(space, r.id)).arrayBuffer()));
    const { id: _, recipe: __, ...settings } = r;
    meta.push({ file, ...settings, createdAt: new Date(r.createdAt).toISOString() });
    onProgress(i + 1);
  }
  add("metadata.json", strToU8(JSON.stringify(meta, null, 2)));
  zip.end();
  return new Blob(parts as BlobPart[], { type: "application/zip" });
}

/** The library's thumbnail for a render, wherever it is on screen (the phone tab and the desktop column both have one). */
export function revealThumb(id: string) {
  document.querySelectorAll(`[data-render="${id}"]`).forEach((el) => el.scrollIntoView({ block: "nearest" }));
}

function Thumb({ render, active, onSelect }: { render: Render; active: boolean; onSelect: (r: Render) => void }) {
  const url = useThumb(render.id);
  return (
    <button
      data-render={render.id}
      onClick={() => onSelect(render)}
      className={`relative aspect-square overflow-hidden bg-panel outline-offset-[-1px] ${active ? "outline outline-ink" : ""}`}
    >
      {url && <img src={url} alt={render.prompt} loading="lazy" className="size-full object-cover" />}
      {render.best && <span className="absolute top-0 right-0 bg-bg/80 px-1 text-[11px] leading-4 text-ink" aria-label="best">★</span>}
    </button>
  );
}

function Pending({ job, active, onFocus }: { job: Job; active: boolean; onFocus: (id: string) => void }) {
  return (
    <button
      onClick={() => onFocus(job.id)}
      className={`relative aspect-square overflow-hidden bg-panel outline-offset-[-1px] ${active ? "outline outline-ink" : ""}`}
    >
      {job.preview && <img src={job.preview} alt="" className="size-full object-cover opacity-60" />}
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
        <span className={`block h-full ${job.error ? "bg-bad" : "bg-ink"}`} style={{ width: `${job.error ? 100 : 100 * progress(job)}%` }} />
      </span>
    </button>
  );
}

export const KEYS = "← → ↑ ↓ browse · Z zoom · + − 0 · F full screen · B best · H hide · R reuse · S save · Del delete · ⌘↵ generate";

export function Library({ shown, names, filter, setFilter, best, setBest, bestCount, jobs, focus, onSelect, onFocus }: {
  shown: Render[];
  names: string[];
  filter: string;
  setFilter: (name: string) => void;
  best: boolean;
  setBest: (on: boolean) => void;
  bestCount: number;
  jobs: Job[];
  focus: string | null;
  onSelect: (r: Render) => void;
  onFocus: (id: string) => void;
}) {
  const space = useSpace();
  const [note, setNote] = useState("");
  const [zipping, setZipping] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const folder = useLiveQuery(() => db.workspaces.get(space.id).then((w) => w?.folder?.name ?? ""), [space.id]);
  const file = useRef<HTMLInputElement>(null);

  const saveAll = async () => {
    setNote("");
    setSaving(0);
    try {
      const dir = await folderOf(space);
      if (!dir) return setNote("No write access to that folder. Choose it again.");
      const added = await saveToFolder(space, dir, shown, setSaving);
      setNote(`Saved ${added} new to ${dir.name}${added < shown.length ? `, ${shown.length - added} were already there` : ""}.`);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setSaving(null);
    }
  };
  const choose = () =>
    chooseFolder(space).then(
      (dir) => setNote(`Save and Download now write to ${dir.name}.`),
      (e) => e?.name !== "AbortError" && setNote(errorText(e)),
    );

  const downloadAll = async () => {
    setZipping(0);
    try {
      const day = new Date().toISOString().slice(0, 10);
      download(await zipRenders(space, shown, setZipping), `studio-${day}${best ? "-best" : ""}${filter ? `-${filter}` : ""}.zip`);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setZipping(null);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="label flex-1 whitespace-nowrap">Library · {shown.length}</h3>
        <Seg
          value={best ? "best" : "all"}
          options={[{ value: "all", label: "All" }, { value: "best", label: `★ ${bestCount}` }]}
          onChange={(v) => setBest(v === "best")}
          className="w-28"
        />
        {names.length > 0 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="field h-10 max-w-40 px-2 lg:h-8">
            <option value="">All characters</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      <p className="hidden border-b border-line px-4 py-2 font-mono text-[10.5px] text-faint [@media(pointer:fine)]:block">{KEYS}</p>
      {jobs.length + shown.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-faint">
          {best ? "Nothing marked best here. Press B or ★ on an image to mark it." : "Nothing here yet. Renders are kept on this device only."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-line p-px sm:grid-cols-4 lg:grid-cols-2">
          {jobs.map((j) => <Pending key={j.id} job={j} active={j.id === focus} onFocus={onFocus} />)}
          {shown.map((r) => <Thumb key={r.id} render={r} active={r.id === focus} onSelect={onSelect} />)}
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-line px-4 py-4">
        <h3 className="label">Download</h3>
        {canPickFolder && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={folder}>{folder ? `→ ${folder}` : "no folder chosen"}</span>
            <Btn onClick={choose}>{folder ? "Change" : "Choose folder"}</Btn>
            {folder && <Btn variant="quiet" onClick={() => forgetFolder(space)}>Forget</Btn>}
          </div>
        )}
        {folder && (
          <Btn variant="primary" onClick={saveAll} disabled={!shown.length || saving != null}>
            {saving != null ? `Saving ${saving}/${shown.length}` : `Save ${shown.length} shown to ${folder}`}
          </Btn>
        )}
        <Btn onClick={downloadAll} disabled={!shown.length || zipping != null}>
          {zipping != null ? `Zipping ${zipping}/${shown.length}` : `Download ${shown.length} shown as zip`}
        </Btn>
        <p className="text-xs text-faint">
          The images the filters above show, with their settings in metadata.json. Neither the files nor the zip are encrypted.
          {canPickFolder
            ? " With a folder chosen, Save and S write there too, and images already in it are skipped."
            : " Saving straight into a folder needs Chrome or Edge."}
        </p>
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-4 py-4">
        <h3 className="label">Backup</h3>
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={async () => download(await exportLibrary(space), "studio-library.json")}>Export library</Btn>
          <Btn className="flex-1" onClick={() => file.current?.click()}>Import</Btn>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setNote(await importLibrary(space, f));
              } catch (err) {
                setNote(errorText(err));
              }
            }}
          />
        </div>
        <p className="text-xs text-faint">{note || "This workspace's characters, plus section presets and LoRA trigger words. The file is not encrypted."}</p>
      </div>
    </div>
  );
}

export function BestBtn({ render, className = "" }: { render: Render; className?: string }) {
  const space = useSpace();
  return (
    <Btn onClick={() => toggleBest(space, render)} aria-pressed={!!render.best} title="Mark as best (B)" className={`${render.best ? "text-ink" : "text-faint"} ${className}`}>
      {render.best ? "★" : "☆"}
    </Btn>
  );
}

export function Viewer({ render, onClose, onReuse, view, setView, onStep }: {
  render: Render | null;
  onClose: () => void;
  onReuse: (r: Render) => void;
  view: View;
  setView: (v: View) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const space = useSpace();
  const dialog = useRef<HTMLDialogElement>(null);
  const url = useObjectUrl(useImage(render?.id));
  useEffect(() => {
    if (render && !dialog.current?.open) dialog.current?.showModal();
    if (!render && dialog.current?.open) dialog.current.close();
  }, [render]);

  return (
    <dialog ref={dialog} onClose={onClose} className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-ink">
      {render && (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-12 items-center gap-2 border-b border-line px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">{describe(render)}</span>
            <ZoomBar view={view} setView={setView} />
            <Btn onClick={() => dialog.current?.close()}>Close</Btn>
          </div>
          <div className="min-h-0 flex-1">
            {url && <ZoomView src={url} alt={render.prompt} view={view} setView={setView} onSwipe={onStep} />}
          </div>
          <p className="line-clamp-3 border-t border-line px-3 pt-3 font-mono text-xs text-muted">{render.prompt}</p>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 p-3">
            <BestBtn render={render} className="w-12" />
            <Btn onClick={() => onReuse(render)}>Reuse</Btn>
            <Btn onClick={() => saveImage(space, render)}>Save</Btn>
            <Btn variant="danger" onClick={async () => (await deleteRender(render)) && dialog.current?.close()}>
              Delete
            </Btn>
          </div>
        </div>
      )}
    </dialog>
  );
}
