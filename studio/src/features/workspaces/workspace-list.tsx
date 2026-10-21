// The start screen: which workspace, nothing of any of them shown until one is opened. It is shown
// outside any open workspace, so it reads the workspace list straight from the device.
import { useState } from "react";

import { WrongPassword } from "@/data/crypto";
import { loadDraft } from "@/data/db/drafts";
import type { Workspace } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { createWorkspace, openWorkspace, useImageCounts, useWorkspaces } from "@/data/db/workspaces";
import { errorText } from "@/domain/format";
import type { Recipe } from "@/domain/recipe";
import { NewPassword, NO_RESET } from "@/features/workspaces/new-password";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Pressable } from "@/ui/pressable";
import { Note } from "@/ui/text";

const days = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const opened = (t: number) => {
  const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d > -7
    ? days.format(d, "day")
    : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function WorkspaceList({ onOpen }: { onOpen: (space: Space, draft: Recipe) => void }) {
  const list = useWorkspaces();
  const counts = useImageCounts();
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  if (!list) return null;
  const sorted = list.toSorted((a, b) => b.opened - a.opened);
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
    if (!w.lock) return void enter(() => openWorkspace(w), "Opening");
    setPicked(w.id);
  };

  /** What the row says at its right: progress while it opens, else whether it is protected or how many images it holds. */
  const badge = (w: Workspace) => {
    if (busy && opening === w.id) return busy;
    return w.lock ? "protected" : `${counts?.get(w.id) ?? 0} images`;
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-12">
      <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
      {sorted.length > 0 && (
        <section className="flex flex-col border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 label">Workspaces</h2>
          {sorted.map((w) => (
            <div key={w.id} className="border-b border-line last:border-b-0">
              <Pressable
                onClick={() => pick(w)}
                disabled={!!busy}
                className="flex h-16 w-full items-center gap-3 px-4 hover:bg-raised fine:h-14"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-faint">opened {opened(w.opened)}</span>
                </span>
                <span className="font-mono text-[10.5px] text-faint uppercase tabular-nums">{badge(w)}</span>
                <span className="text-faint" aria-hidden>
                  ›
                </span>
              </Pressable>
              {picked === w.id && (
                <form
                  className="flex flex-col gap-2 px-4 pb-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enter(() => openWorkspace(w, password), "Unlocking");
                  }}
                >
                  <Input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={`studio: ${w.name}`}
                    hidden
                    readOnly
                  />
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="password"
                      autoFocus
                      className="flex-1"
                    />
                    <Button type="submit" variant="primary" disabled={!password || !!busy}>
                      {busy || "Unlock"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </section>
      )}
      {error && (
        <Note tone="bad" mono>
          {error}
        </Note>
      )}
      {fresh ? (
        <form
          className="flex flex-col gap-3 border border-line bg-panel p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enter(() => createWorkspace(name.trim(), password), "Creating");
          }}
        >
          <h2 className="label">{sorted.length ? "New workspace" : "Create a workspace to begin"}</h2>
          <Note>
            Each workspace keeps its own renders, characters and draft, encrypted on this device. Nothing of
            one shows in another.
          </Note>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            autoFocus={!sorted.length}
          />
          <NewPassword name={name} value={password} set={setPw} repeat={repeat} setRepeat={setRepeat} />
          <Note>{password ? NO_RESET : "Optional. Without one, anyone using this browser can open it."}</Note>
          <div className="flex gap-2">
            {sorted.length > 0 && <Button onClick={() => setCreating(false)}>Cancel</Button>}
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || (password !== repeat && !!password) || !!busy}
              className="flex-1"
            >
              {busy || "Create"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          onClick={() => {
            setCreating(true);
            setPicked(null);
            setPw("");
            setRepeat("");
          }}
          className="h-11"
        >
          New workspace
        </Button>
      )}
      <Note>Section presets and LoRA trigger words are shared by all workspaces.</Note>
    </main>
  );
}
