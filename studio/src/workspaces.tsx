// The start screen (which workspace, nothing of any of them shown until one is opened) and the
// workspace dialog behind the name in the header: rename, password, delete, switch.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { WrongPassword } from "./crypto";
import { api } from "./api";
import { createWorkspace, db, deleteWorkspace, purge, loadDraft, openWorkspace, renameWorkspace, setPassword, useSpace, type Space, type Workspace } from "./db";
import type { Recipe } from "./recipe";
import { notify } from "./toast";
import { Btn, Check, errorText, Section } from "./ui";

const NO_RESET = "There is no reset: without the password nothing in it can be read again, by you or anyone.";

/** A new password typed twice. The hidden username is the workspace's name, so a password manager keeps one entry per workspace. */
function NewPassword({ name, value, set, repeat, setRepeat }: { name: string; value: string; set: (v: string) => void; repeat: string; setRepeat: (v: string) => void }) {
  return (
    <>
      <input type="text" name="username" autoComplete="username" value={`studio: ${name}`} hidden readOnly />
      <input type="password" autoComplete="new-password" value={value} onChange={(e) => set(e.target.value)} placeholder="password" className="field h-11 px-3 fine:h-9" />
      {value && (
        <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="repeat password" className="field h-11 px-3 fine:h-9" />
      )}
      {value && repeat && value !== repeat && <p role="alert" className="font-mono text-xs text-bad">The passwords do not match.</p>}
    </>
  );
}

const days = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const opened = (t: number) => {
  const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d > -7 ? days.format(d, "day") : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function useCounts() {
  return useLiveQuery(async () => {
    const counts = new Map<string, number>();
    for (const ws of (await db.shots.orderBy("ws").keys()) as string[]) counts.set(ws, (counts.get(ws) ?? 0) + 1);
    return counts;
  }, []);
}

export function Workspaces({ onOpen }: { onOpen: (space: Space, draft: Recipe) => void }) {
  const list = useLiveQuery(() => db.workspaces.toArray(), []);
  const counts = useCounts();
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  if (!list) return null;
  const sorted = [...list].sort((a, b) => b.opened - a.opened);
  const fresh = creating || sorted.length === 0;

  const enter = async (work: () => Promise<Space>, label: string) => {
    setError("");
    setBusy(label);
    try {
      const space = await work();
      onOpen(space, await loadDraft(space));
    } catch (e) {
      setError(e instanceof WrongPassword ? e.message : errorText(e));
      setBusy("");
    }
  };

  const pick = (w: Workspace) => {
    setError("");
    setPw("");
    setOpening(w.id);
    if (!w.lock) return enter(() => openWorkspace(w), "Opening");
    setPicked(w.id);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-12">
      <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
      {sorted.length > 0 && (
        <section className="flex flex-col border border-line bg-panel">
          <h2 className="label border-b border-line px-4 py-3">Workspaces</h2>
          {sorted.map((w) => (
            <div key={w.id} className="border-b border-line last:border-b-0">
              <button onClick={() => pick(w)} disabled={!!busy} className="flex h-16 w-full items-center gap-3 px-4 text-left hover:bg-raised fine:h-14">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-faint">opened {opened(w.opened)}</span>
                </span>
                <span className="font-mono text-[10.5px] text-faint uppercase tabular-nums">
                  {busy && opening === w.id ? busy : w.lock ? "protected" : `${counts?.get(w.id) ?? 0} images`}
                </span>
                <span className="text-faint" aria-hidden>›</span>
              </button>
              {picked === w.id && (
                <form
                  className="flex flex-col gap-2 px-4 pb-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    enter(() => openWorkspace(w, password), "Unlocking");
                  }}
                >
                  <input type="text" name="username" autoComplete="username" value={`studio: ${w.name}`} hidden readOnly />
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="password"
                      autoFocus
                      className="field h-11 min-w-0 flex-1 px-3 fine:h-9"
                    />
                    <Btn variant="primary" disabled={!password || !!busy} className="h-11 fine:h-9">{busy || "Unlock"}</Btn>
                  </div>
                </form>
              )}
            </div>
          ))}
        </section>
      )}
      {error && <p role="alert" className="font-mono text-xs text-bad">{error}</p>}
      {fresh ? (
        <form
          className="flex flex-col gap-3 border border-line bg-panel p-4"
          onSubmit={(e) => {
            e.preventDefault();
            enter(() => createWorkspace(name.trim(), password), "Creating");
          }}
        >
          <h2 className="label">{sorted.length ? "New workspace" : "Create a workspace to begin"}</h2>
          <p className="text-xs text-faint">
            Each workspace keeps its own renders, characters and draft, encrypted on this device. Nothing of one shows in another.
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" autoFocus={!sorted.length} className="field h-11 px-3 fine:h-9" />
          <NewPassword name={name} value={password} set={setPw} repeat={repeat} setRepeat={setRepeat} />
          <p className="text-xs text-faint">{password ? NO_RESET : "Optional. Without one, anyone using this browser can open it."}</p>
          <div className="flex gap-2">
            {sorted.length > 0 && <Btn type="button" onClick={() => setCreating(false)}>Cancel</Btn>}
            <Btn variant="primary" disabled={!name.trim() || password !== repeat && !!password || !!busy} className="flex-1">
              {busy || "Create"}
            </Btn>
          </div>
        </form>
      ) : (
        <Btn onClick={() => (setCreating(true), setPicked(null), setPw(""), setRepeat(""))} className="h-11">New workspace</Btn>
      )}
      <p className="text-xs text-faint">Section presets and LoRA trigger words are shared by all workspaces.</p>
    </main>
  );
}

export function WorkspaceMenu({ open, onClose, onSwitch }: { open: boolean; onClose: () => void; onSwitch: () => void }) {
  const space = useSpace();
  const w = useLiveQuery(() => db.workspaces.get(space.id), [space.id]);
  const count = useLiveQuery(() => db.shots.where("ws").equals(space.id).count(), [space.id]) ?? 0;
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [password, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(""); // the name, typed again to delete
  useEffect(() => {
    if (open && !dialog.current?.open) {
      setName(w?.name ?? "");
      setPw("");
      setRepeat("");
      setNote("");
      setSure("");
      dialog.current?.showModal();
    }
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open, w?.name]);
  if (!w) return null;

  const guard = async (pw: string) => {
    await setPassword(space, pw);
    setPw("");
    setRepeat("");
    setNote(pw ? "Password set." : "Password removed.");
  };

  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-line bg-bg p-0 text-ink backdrop:bg-black/60">
      <div className="flex h-12 items-center gap-2 border-b border-line px-4">
        <span className="label flex-1">Workspace</span>
        <Btn onClick={() => dialog.current?.close()}>Done</Btn>
      </div>
      <Section title="Name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) renameWorkspace(space.id, name.trim()).then(() => notify("Renamed"));
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} className="field h-11 min-w-0 flex-1 px-2 fine:h-8" />
          <Btn disabled={!name.trim() || name.trim() === w.name}>Rename</Btn>
        </form>
      </Section>
      <Section title="Password" right={<span className="font-mono text-[10.5px] text-faint uppercase">{w.lock ? "protected" : "none"}</span>}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            guard(password).catch((err) => setNote(errorText(err)));
          }}
        >
          <NewPassword name={w.name} value={password} set={setPw} repeat={repeat} setRepeat={setRepeat} />
          <div className="flex gap-2">
            <Btn disabled={!password || password !== repeat} className="flex-1">{w.lock ? "Change password" : "Set password"}</Btn>
            {w.lock && (
              <Btn type="button" onClick={() => confirm("Remove the password? Anyone using this browser can then open this workspace.") && guard("")}>
                Remove
              </Btn>
            )}
          </div>
        </form>
        <p className="text-xs text-faint">
          {note || (w.lock ? NO_RESET : "Protects this workspace from now on; the browser may keep its old unprotected key on disk for a while. " + NO_RESET)}
        </p>
      </Section>
      <Section title="Delete">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await deleteWorkspace(space.id);
            onSwitch();
          }}
        >
          <input value={sure} onChange={(e) => setSure(e.target.value)} placeholder={`type ${w.name} to confirm`} className="field h-11 min-w-0 flex-1 px-2 fine:h-8" />
          <Btn variant="danger" disabled={sure !== w.name}>Delete</Btn>
        </form>
        <p className="text-xs text-faint">Removes its {count} images, characters and draft from this device. This cannot be undone.</p>
      </Section>
      <Purge />
      <div className="border-t border-line p-4">
        <Btn onClick={onSwitch} className="w-full">Switch workspace</Btn>
      </div>
    </dialog>
  );
}

/** Every generated image on this device, in every workspace; with the toggle, everything else too. */
function Purge() {
  const images = useLiveQuery(() => db.shots.count(), []) ?? 0;
  const [inputs, setInputs] = useState(false);
  const [sure, setSure] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // forget also stops the render on the server; not awaited, a slow worker must not hold up the purge
      for (const id of await purge(inputs)) api.forget(id).catch(() => {});
      if (inputs) return;
      notify(`Purged ${images} images`);
      setSure("");
    } catch (e) {
      notify(`Purge failed: ${errorText(e)}`, { bad: true });
    } finally {
      setBusy(false);
      // the database was closed for deletion, whether or not that worked: start over as a new device
      if (inputs) location.reload();
    }
  };

  return (
    <Section title="Purge this device">
      <div className="flex items-center gap-1">
        <Check on={inputs} onChange={setInputs} label={<span className="text-[13px]">Also delete the inputs</span>} />
      </div>
      <p className="text-xs text-faint">
        {inputs
          ? "Deletes everything the studio keeps here: every workspace with its images, characters and draft, the section presets, LoRA trigger words and saved folders. The app starts over as on a new device, with the starter presets."
          : `Deletes all ${images} generated images in every workspace, protected ones included, and stops renders in flight. Workspaces, characters, drafts and presets stay.`}{" "}
        Files already saved to a folder or downloaded are not touched. This cannot be undone.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input value={sure} onChange={(e) => setSure(e.target.value)} placeholder="type purge to confirm" className="field h-11 min-w-0 flex-1 px-2 fine:h-8" />
        <Btn variant="danger" disabled={sure !== "purge" || busy}>{busy ? "Purging…" : inputs ? "Purge everything" : `Purge ${images} images`}</Btn>
      </form>
    </Section>
  );
}
