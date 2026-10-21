// The start screen (which workspace, nothing of any of them shown until one is opened) and the
// workspace dialog behind the name in the header: rename, password, delete, switch.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { WrongPassword } from "./crypto";
import { createWorkspace, db, deleteWorkspace, loadDraft, openWorkspace, renameWorkspace, setPassword, useSpace, type Space, type Workspace } from "./db";
import type { Recipe } from "./recipe";
import { Btn, errorText, Section } from "./ui";

const NO_RESET = "There is no reset: without the password nothing in it can be read again, by you or anyone.";

/** A new password typed twice. The hidden username is the workspace's name, so a password manager keeps one entry per workspace. */
function NewPassword({ name, value, set, repeat, setRepeat }: { name: string; value: string; set: (v: string) => void; repeat: string; setRepeat: (v: string) => void }) {
  return (
    <>
      <input type="text" name="username" autoComplete="username" value={`studio: ${name}`} hidden readOnly />
      <input type="password" autoComplete="new-password" value={value} onChange={(e) => set(e.target.value)} placeholder="password" className="field h-11 px-3 lg:h-9" />
      {value && (
        <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="repeat password" className="field h-11 px-3 lg:h-9" />
      )}
    </>
  );
}

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
              <button onClick={() => pick(w)} disabled={!!busy} className="flex h-14 w-full items-center gap-3 px-4 text-left hover:bg-raised lg:h-12">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</span>
                <span className="font-mono text-[10.5px] text-faint uppercase tabular-nums">
                  {w.lock ? "locked" : `${counts?.get(w.id) ?? 0} images`}
                </span>
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
                      className="field h-11 min-w-0 flex-1 px-3 lg:h-9"
                    />
                    <Btn variant="primary" disabled={!password || !!busy} className="h-11 lg:h-9">{busy || "Unlock"}</Btn>
                  </div>
                </form>
              )}
            </div>
          ))}
        </section>
      )}
      {error && <p className="font-mono text-xs text-bad">{error}</p>}
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" autoFocus={!sorted.length} className="field h-11 px-3 lg:h-9" />
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
  useEffect(() => {
    if (open && !dialog.current?.open) {
      setName(w?.name ?? "");
      setPw("");
      setRepeat("");
      setNote("");
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
        <Btn onClick={() => dialog.current?.close()}>Close</Btn>
      </div>
      <Section title="Name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) renameWorkspace(space.id, name.trim());
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} className="field h-10 min-w-0 flex-1 px-2 lg:h-8" />
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
        <Btn
          variant="danger"
          onClick={async () => {
            if (!confirm(`Delete "${w.name}" with its ${count} images, characters and draft from this device? This cannot be undone.`)) return;
            await deleteWorkspace(space.id);
            onSwitch();
          }}
        >
          Delete workspace
        </Btn>
      </Section>
      <div className="border-t border-line p-4">
        <Btn variant="primary" onClick={onSwitch} className="w-full">Close workspace</Btn>
      </div>
    </dialog>
  );
}
