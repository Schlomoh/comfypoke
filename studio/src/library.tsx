// Everything rendered in this workspace, filterable by character and by the Best mark, with a
// selection mode for working on many at once (best, upscale, download, delete), the download of
// what is shown (into a folder, or as a zip), and the library backup (characters, presets and
// LoRA notes as one JSON file).
import { useLiveQuery } from "dexie-react-hooks";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { useRef, useState } from "react";
import { canPickFolder, chooseFolder, folderOf, forgetFolder, saveToFolder } from "./folder";
import { db, exportLibrary, importLibrary, loadImage, removeRender, updateRender, useSpace, useThumb, type Render, type Space } from "./db";
import type { Job } from "./jobs";
import { withMetadata } from "./png";
import { progress } from "./stage";
import { notify } from "./toast";
import { Btn, errorText, Seg } from "./ui";

const fileName = (r: Render) => `studio-${r.characterName ? `${r.characterName.replace(/[^\w-]+/g, "_").slice(0, 60)}-` : ""}${r.seed}${r.upscale ? "-up" : ""}`;

export async function saveImage(space: Space, r: Render) {
  try {
    const dir = canPickFolder ? await folderOf(space).catch(() => null) : null;
    // a folder that cannot be written to falls back to a plain download, so S never does nothing
    if (dir && (await saveToFolder(space, dir, [r]).then(() => true, () => false))) return notify(`Saved to ${dir.name}`);
    const file = new File([await withMetadata(await loadImage(space, r.id), r)], `${fileName(r)}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
      // the share sheet is how a phone puts an image into its photo library; it is its own feedback
      return navigator.share({ files: [file] }).catch(() => {});
    }
    download(file);
    notify(`Downloaded ${file.name}`);
  } catch (e) {
    notify(`Could not save: ${errorText(e)}`, { bad: true });
  }
}

export function download(file: Blob & { name?: string }, name = file.name ?? "download") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // iOS may take a while to start reading a large zip
}

/** Deletes the renders and every upscale made from them, after asking once. The ids deleted, or null when not confirmed. */
export async function deleteRenders(rs: Render[], all: Render[]) {
  const ids = new Set(rs.map((r) => r.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of all) if (r.source && ids.has(r.source) && !ids.has(r.id)) (ids.add(r.id), (grew = true)); // upscales of upscales too
  }
  const extra = ids.size - rs.length;
  const what = rs.length === 1 ? "this image" : `${rs.length} images`;
  if (!confirm(`Delete ${what}${extra ? ` and ${extra} upscale${extra > 1 ? "s" : ""} made from ${rs.length === 1 ? "it" : "them"}` : ""} from this device?`)) return null;
  for (const id of ids) await removeRender(id);
  notify(`Deleted ${ids.size} image${ids.size > 1 ? "s" : ""}`);
  return ids;
}

export const toggleBest = (space: Space, r: Render) => updateRender(space, r.id, (stored) => ({ ...stored, best: !stored.best }));

/** The renders as one zip: the PNGs with their metadata written in (stored, not compressed again) and metadata.json beside them. */
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
    add(file, new Uint8Array(await (await withMetadata(await loadImage(space, r.id), r)).arrayBuffer()));
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

function Thumb({ render, active, selected, onSelect }: { render: Render; active: boolean; selected?: boolean; onSelect: (r: Render) => void }) {
  const url = useThumb(render.id);
  const picking = selected !== undefined;
  return (
    <button
      data-render={render.id}
      onClick={() => onSelect(render)}
      role={picking ? "checkbox" : undefined}
      aria-checked={picking ? selected : undefined}
      aria-label={render.title ?? render.prompt}
      className={`relative aspect-square overflow-hidden bg-panel outline-offset-[-2px] ${active && !picking ? "outline-2 outline-ink" : ""} ${selected ? "outline-2 outline-ink" : ""}`}
    >
      {url && <img src={url} alt="" loading="lazy" className={`size-full object-cover ${picking && !selected ? "opacity-60" : ""}`} />}
      {render.best && <span className="absolute top-0 right-0 bg-bg/80 px-1 text-[11px] leading-4 text-warn" aria-hidden>★</span>}
      {render.upscale && <span className="absolute bottom-0 left-0 bg-bg/80 px-1 font-mono text-[10px] leading-4 text-ink" aria-hidden>↑{render.upscale.megapixels}MP</span>}
      {picking && (
        <span className={`absolute top-1.5 left-1.5 grid size-5 place-items-center border text-[11px] ${selected ? "border-ink bg-ink text-bg" : "border-ink/70 bg-bg/60"}`} aria-hidden>
          {selected && "✓"}
        </span>
      )}
    </button>
  );
}

function Pending({ job, active, onFocus }: { job: Job; active: boolean; onFocus: (id: string) => void }) {
  return (
    <button
      onClick={() => onFocus(job.id)}
      aria-label={job.error ? "failed render" : "render in progress"}
      className={`relative aspect-square overflow-hidden bg-panel outline-offset-[-2px] ${active ? "outline-2 outline-ink" : ""}`}
    >
      {job.preview && <img src={job.preview} alt="" className="size-full object-cover opacity-60" />}
      {job.params?.family === "seedvr2" && <span className="absolute top-1 left-1 font-mono text-[10px] text-ink">upscaling</span>}
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
        <span className={`block h-full ${job.error ? "bg-bad" : "bg-ink"}`} style={{ width: `${job.error ? 100 : 100 * progress(job)}%` }} />
      </span>
    </button>
  );
}

export const KEYS = [
  ["← → or J K", "previous, next image"],
  ["↑ ↓", "a row up or down"],
  ["F or ↵", "full screen"],
  ["I", "image info and notes"],
  ["Z", "1:1 or fit"],
  ["+ − 0", "zoom in, out, fit"],
  ["B", "mark as best"],
  ["U", "upscale"],
  ["S", "save"],
  ["R", "reuse its settings"],
  ["Del", "delete"],
  ["H", "hide all images"],
  ["⌘↵", "generate"],
  ["?", "this list"],
];

export function Library({ shown, all, names, filter, setFilter, best, setBest, bestCount, jobs, focus, onSelect, onFocus, onUpscale, upscaleLabel }: {
  shown: Render[];
  all: Render[]; // every render of the workspace, for deleting upscales along with their source
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
  onUpscale: (rs: Render[]) => void;
  upscaleLabel: string;
}) {
  const space = useSpace();
  const [note, setNote] = useState(""); // Download
  const [backupNote, setBackupNote] = useState("");
  const [zipping, setZipping] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null: not selecting
  const folder = useLiveQuery(() => db.workspaces.get(space.id).then((w) => w?.folder?.name ?? ""), [space.id]);
  const file = useRef<HTMLInputElement>(null);
  const chosen = picked ? shown.filter((r) => picked.has(r.id)) : [];
  const target = picked ? chosen : shown; // Download works on the selection while there is one

  const toggle = (r: Render) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(r.id)) next.add(r.id);
      return next;
    });

  const saveAll = async () => {
    setNote("");
    setSaving(0);
    try {
      const dir = await folderOf(space);
      if (!dir) return setNote("No write access to that folder. Choose it again.");
      const added = await saveToFolder(space, dir, target, setSaving);
      setNote(`Saved ${added} new to ${dir.name}${added < target.length ? `, ${target.length - added} were already there` : ""}.`);
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
      download(await zipRenders(space, target, setZipping), `studio-${day}${picked ? "-selected" : `${best ? "-best" : ""}${filter ? `-${filter}` : ""}`}.zip`);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setZipping(null);
    }
  };

  const bulkBest = async () => {
    const on = chosen.some((r) => !r.best); // mixed or none: mark all; all marked: unmark all
    for (const r of chosen) await updateRender(space, r.id, (s) => ({ ...s, best: on }));
    notify(`${on ? "Marked" : "Unmarked"} ${chosen.length} as best`);
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
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Character" className="field h-11 max-w-40 px-2 fine:h-8">
            <option value="">All characters</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
        <Btn onClick={() => setPicked(picked ? null : new Set())} aria-pressed={!!picked} disabled={!shown.length}>
          {picked ? "Done" : "Select"}
        </Btn>
      </div>
      {picked ? (
        <div className="sticky top-[calc(5.75rem+env(safe-area-inset-top))] z-10 flex flex-col gap-2 border-b border-line bg-panel px-4 py-3 lg:top-0">
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="flex-1 text-ink tabular-nums">{chosen.length} selected</span>
            <button onClick={() => setPicked(new Set(shown.map((r) => r.id)))} className="h-11 text-muted underline-offset-4 hover:text-ink fine:h-6">all {shown.length}</button>
            <button onClick={() => setPicked(new Set())} className="h-11 text-muted hover:text-ink fine:h-6">none</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Btn onClick={bulkBest} disabled={!chosen.length} title="Mark or unmark as best">★</Btn>
            <Btn onClick={() => (onUpscale(chosen), setPicked(null))} disabled={!chosen.length} title={upscaleLabel}>Upscale</Btn>
            <Btn onClick={folder ? saveAll : downloadAll} disabled={!chosen.length || zipping != null || saving != null}>
              {folder ? "Save" : "Zip"}
            </Btn>
            <Btn variant="danger" onClick={async () => (await deleteRenders(chosen, all)) && setPicked(null)} disabled={!chosen.length}>
              Delete
            </Btn>
          </div>
          <p className="text-xs text-faint">{upscaleLabel}. Deleting also removes upscales made from the selected images.</p>
        </div>
      ) : (
        <p className="hidden border-b border-line px-4 py-2 font-mono text-[10.5px] text-faint [@media(pointer:fine)]:block">
          ← → browse · F full screen · B best · press ? for all keys
        </p>
      )}
      {jobs.length + shown.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-faint">
          {best ? "Nothing marked best here. Press B or ★ on an image to mark it." : "Nothing here yet. Renders are kept on this device only."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-line p-px sm:grid-cols-4 lg:grid-cols-2">
          {!picked && jobs.map((j) => <Pending key={j.id} job={j} active={j.id === focus} onFocus={onFocus} />)}
          {shown.map((r) => (
            <Thumb key={r.id} render={r} active={r.id === focus} selected={picked ? picked.has(r.id) : undefined} onSelect={picked ? toggle : onSelect} />
          ))}
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
          <Btn variant="primary" onClick={saveAll} disabled={!target.length || saving != null}>
            {saving != null ? `Saving ${saving}/${target.length}` : `Save ${target.length} ${picked ? "selected" : "shown"} to ${folder}`}
          </Btn>
        )}
        <Btn onClick={downloadAll} disabled={!target.length || zipping != null}>
          {zipping != null ? `Zipping ${zipping}/${target.length}` : `Download ${target.length} ${picked ? "selected" : "shown"} as zip`}
        </Btn>
        {note && <p role="status" className="font-mono text-xs text-ink">{note}</p>}
        <p className="text-xs text-faint">
          {picked ? "The selected images" : "The images the filters above show"}, each PNG with its prompt and settings written in, plus
          metadata.json. Neither the files nor the zip are encrypted.
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
                setBackupNote(await importLibrary(space, f));
              } catch (err) {
                setBackupNote(errorText(err));
              }
            }}
          />
        </div>
        <p className="text-xs text-faint">{backupNote || "This workspace's characters, plus section presets and LoRA trigger words. The file is not encrypted."}</p>
      </div>
    </div>
  );
}

export function BestBtn({ render, className = "" }: { render: Render; className?: string }) {
  const space = useSpace();
  return (
    <Btn
      onClick={() => toggleBest(space, render)}
      aria-pressed={!!render.best}
      aria-label="Best"
      title="Mark as best (B)"
      className={`text-base ${render.best ? "text-warn" : "text-muted hover:text-ink"} ${className}`}
    >
      {render.best ? "★" : "☆"}
    </Btn>
  );
}
