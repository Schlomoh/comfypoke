import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Locked, type Catalog } from "./api";
import { closeSpace, db, migrate, saveDraft, SpaceContext, useCharacters, useRenders, useSpace, type Render, type Space } from "./db";
import { GpuBar, useGpu } from "./gpu";
import { useJobs } from "./jobs";
import { deleteRender, KEYS, Library, revealThumb, saveImage, toggleBest, Viewer } from "./library";
import { ModelPanel, resolve } from "./model";
import { PromptPanel, sameCharacter } from "./prompt";
import { BLOCKS, compose, EMPTY, fromSize, legacyUnet, size, useRecipe, type Recipe } from "./recipe";
import { shortName, Stage } from "./stage";
import { FIT, type View } from "./zoom";
import { Btn, errorText } from "./ui";
import { Toasts } from "./toast";
import { WorkspaceMenu, Workspaces } from "./workspaces";

export default function App() {
  const [auth, setAuth] = useState<"checking" | "locked" | "open">("checking");
  useEffect(() => {
    api.gpu().then(
      () => setAuth("open"),
      (e) => setAuth(e instanceof Locked ? "locked" : "open"),
    );
  }, []);
  return (
    <>
      {auth === "checking" ? <Splash text="Connecting" /> : auth === "locked" ? <Login onOpen={() => setAuth("open")} /> : <Shell onLocked={() => setAuth("locked")} />}
      <Toasts />
    </>
  );
}

/** What shows while something loads, instead of an empty black screen. */
function Splash({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(3rem,env(safe-area-inset-top))]">
      <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
      <p className="font-mono text-xs text-faint">{text}…</p>
    </main>
  );
}

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

/** No workspace open means nothing shown: the start screen lists names and nothing else. */
function Shell({ onLocked }: { onLocked: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ space: Space; draft: Recipe } | null>(null);
  useEffect(() => {
    migrate().then(() => setReady(true), (e) => setError(`Could not move the library into a workspace: ${errorText(e)}`));
  }, []);
  if (error && !ready)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
        <p className="font-mono text-xs text-bad">{error}</p>
        <p className="text-xs text-faint">What was not moved stays where it was and is tried again on the next reload.</p>
        <Btn onClick={() => setReady(true)}>Continue</Btn>
      </main>
    );
  if (!ready) return <Splash text="Opening the library" />;
  if (!open) return <Workspaces onOpen={(space, draft) => setOpen({ space, draft })} />;
  return (
    <SpaceContext.Provider value={open.space}>
      <Studio
        key={open.space.id}
        draft={open.draft}
        onLocked={onLocked}
        onClose={() => {
          closeSpace();
          setOpen(null);
        }}
      />
    </SpaceContext.Provider>
  );
}

function Login({ onOpen }: { onOpen: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            await api.login(key.trim());
            onOpen();
          } catch (err) {
            setError(err instanceof Locked ? "Wrong key." : errorText(err));
            setPending(false);
          }
        }}
        className="flex w-full max-w-sm flex-col gap-3 border border-line bg-panel p-5"
      >
        <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
        <p className="text-xs text-muted">Paste the contents of .access_key from the repo you deployed.</p>
        <input type="text" name="username" autoComplete="username" value="studio" hidden readOnly />
        <input
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => (setKey(e.target.value), setError(""))}
          placeholder="access key"
          autoFocus
          className="field h-11 px-3 font-mono"
        />
        {error && <p role="alert" className="font-mono text-xs text-bad">{error}</p>}
        <Btn variant="primary" className="h-11" disabled={!key.trim() || pending}>{pending ? "Unlocking…" : "Unlock"}</Btn>
      </form>
    </main>
  );
}

/** Every image on screen blanked to a plain tile, for working where others can see the screen. Kept across reloads. */
function useVeil() {
  const [veil, setVeil] = useState(() => {
    try {
      return localStorage.getItem("studio.veil") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("veil", veil);
    try {
      localStorage.setItem("studio.veil", veil ? "1" : "0");
    } catch {
      // private mode: hidden for this tab only
    }
  }, [veil]);
  return [veil, setVeil] as const;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
type Tab = "prompt" | "model" | "library";

function Studio({ draft, onLocked, onClose }: { draft: Recipe; onLocked: () => void; onClose: () => void }) {
  const space = useSpace();
  const [recipe, setRecipe] = useRecipe(draft, useCallback((r: Recipe) => void saveDraft(space, r), [space]));
  const [tab, setTab] = useState<Tab>("prompt");
  const [focus, setFocus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState("");
  const [best, setBest] = useState(false);
  const [keys, setKeys] = useState(false);
  const [veil, setVeil] = useVeil();
  const [view, setView] = useState<View>(FIT); // one zoom for the stage and the viewer, kept across images
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>({ models: [], families: [], loras: [] });
  const gpu = useGpu(onLocked);
  const { jobs, generate, cancel, dismiss } = useJobs(setFocus);
  const loaded = useRenders();
  const renders = loaded ?? [];
  const notes = useLiveQuery(() => db.loraNotes.toArray(), []) ?? [];
  const characters = useCharacters() ?? [];
  const workspace = useLiveQuery(() => db.workspaces.get(space.id), [space.id]);
  const open = renders.find((r) => r.id === openId) ?? null; // always the stored version: Best changes it
  const setOpen = (r: Render | null) => setOpenId(r?.id ?? null);

  useEffect(() => {
    api.models().then(setCatalog, (e) => (e instanceof Locked ? onLocked() : setError(errorText(e))));
  }, [onLocked]);

  const active = recipe.loras.filter((l) => l.on);
  const triggers = active.map((l) => notes.find((n) => n.name === l.name)?.trigger ?? "");
  const prompt = compose(recipe.blocks, triggers);
  const aspect = size(recipe.aspect, recipe.mp);
  const sent = resolve(recipe, catalog);
  const characterName = characters.find((c) => c.id === recipe.character)?.name;
  const names = [...new Set(renders.map((r) => r.characterName).filter(Boolean))] as string[];
  const showing = names.includes(filter) ? filter : ""; // the last render of a character may be gone
  const shown = renders.filter((r) => (!showing || r.characterName === showing) && (!best || r.best));
  const bestCount = renders.filter((r) => r.best && (!showing || r.characterName === showing)).length;
  const job = jobs.find((j) => j.id === focus) ?? (focus ? undefined : jobs[0]);
  const render = job ? undefined : (renders.find((r) => r.id === focus) ?? renders[0]);
  const cursor = useRef<string | null>(null);
  cursor.current = (open ?? render)?.id ?? null; // where keyboard browsing starts

  // Median render time of this model on this device: cold boots skew a mean, not a median.
  const times = renders.filter((r) => (r.unet ?? legacyUnet(r.model)) === recipe.unet).slice(0, 15).map((r) => r.seconds);
  const seconds = times.length ? median(times) * recipe.count : null;
  const cost = seconds != null && gpu.gpu ? (seconds * gpu.gpu.rate_per_hour) / 3600 : null;

  const submit = async () => {
    if (!prompt || sending || !sent.family) return;
    setError("");
    setSending(true);
    try {
      for (let i = 0; i < recipe.count; i++) {
        const r = await generate(
          {
            unet: recipe.unet,
            family: sent.family.id,
            prompt,
            negative: sent.negative ? recipe.negative : "",
            width: aspect.width,
            height: aspect.height,
            seed: recipe.seed == null ? null : recipe.seed + i,
            steps: recipe.steps,
            cfg: recipe.cfg,
            loras: active.map(({ name, strength }) => ({ name, strength })),
          },
          { recipe, characterName },
        );
        if (i === 0) setFocus(r.id);
      }
      if (!matchMedia("(min-width: 1024px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e instanceof Locked) onLocked();
      else setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  /** Move through the library by n images, from the keyboard or a swipe. The zoom stays as it is. */
  const step = (n: number) => {
    const at = shown.findIndex((r) => r.id === cursor.current);
    const next = shown[Math.min(shown.length - 1, Math.max(0, at + n))];
    if (!next || next.id === cursor.current) return false;
    cursor.current = next.id; // ahead of React: held-down arrows fire faster than it re-renders
    if (open) setOpen(next);
    setFocus(next.id);
    revealThumb(next.id);
    return true;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]:not([data-viewer])")) return; // a dialog over the studio: keys belong to it
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return void submit();
      const typing = (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") return setKeys(true);
      if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).closest?.("button, a")) return; // activates what has focus
      const at = shown.findIndex((r) => r.id === cursor.current);
      const cur = shown[at] ?? open ?? render; // the viewer's image, or the one on the stage
      const cols = matchMedia("(min-width: 1024px)").matches ? 2 : matchMedia("(min-width: 640px)").matches ? 4 : 3;
      const go = (n: number) => step(n) && e.preventDefault();
      const zoom = (f: number) => setView({ ...view, scale: Math.min(8, (view.scale ?? 1 / f) * f) }); // from fit, + goes to 1:1
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "ArrowRight" || k === "j") go(1);
      else if (k === "ArrowLeft" || k === "k") go(-1);
      else if (k === "ArrowDown") go(cols);
      else if (k === "ArrowUp") go(-cols);
      else if (k === "z") setView(view.scale == null ? { ...view, scale: 1 } : FIT);
      else if (k === "0") setView(FIT);
      else if (k === "h") setVeil(!veil);
      else if (k === "=" || k === "+") zoom(1.25);
      else if (k === "-") view.scale != null && zoom(0.8); // the zoom view turns anything below fit into fit
      else if (!cur) return;
      else if ((k === "f" || k === "Enter") && !open) (e.preventDefault(), setOpen(cur));
      else if (k === "r") reuse(cur);
      else if (k === "s") saveImage(space, cur);
      else if (k === "b") toggleBest(space, cur);
      else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        const after = shown[at + 1] ?? shown[at - 1];
        deleteRender(cur).then((gone) => {
          if (!gone) return;
          setFocus(after?.id ?? null);
          if (open) setOpen(after ?? null);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reuse = (r: Render) => {
    const base: Recipe = r.recipe ?? {
      ...EMPTY,
      blocks: { ...EMPTY.blocks, extra: { text: r.prompt, on: true } },
      ...fromSize(r.width, r.height),
    };
    // The model as actually rendered; older renders and recipes only knew "turbo" or "raw".
    const unet = r.unet ?? legacyUnet(r.model);
    const suggested = catalog.models.find((m) => m.file === unet)?.family;
    // Keep the character link only if it still matches, or Save would overwrite it with these old blocks.
    const linked = characters.find((c) => c.id === base.character);
    setRecipe({
      ...EMPTY,
      ...base,
      unet,
      // pinned only when it differs from what the model list suggests; with no list loaded yet, keep it as rendered
      family: r.family && (catalog.models.length === 0 || r.family !== suggested) ? r.family : null,
      character: linked && sameCharacter(linked, base) ? linked.id : null,
      seed: r.seed,
      count: 1,
    });
    setOpen(null);
    setTab("prompt");
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "model", label: "Model" },
    { id: "library", label: `Library ${renders.length}` },
  ];
  // Why Generate is greyed out, said where the estimate would be
  const blocked = !catalog.models.length
    ? error ? "model list unavailable" : "loading models…"
    : !sent.family ? "pick a family for this model" : !prompt ? "fill in a block to generate" : null;
  const filled = BLOCKS.filter((b) => recipe.blocks[b.id].on && recipe.blocks[b.id].text.trim()).length;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-bg px-4 pt-[env(safe-area-inset-top)] lg:static">
        <div className="flex h-12 flex-1 items-center gap-4">
          <span className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</span>
          <button onClick={() => setMenu(true)} className="flex h-11 min-w-0 items-center gap-1.5 border border-line px-2 fine:h-8 font-mono text-xs hover:border-edge" title="Workspace">
            <span className="truncate">{workspace?.name}</span>
            {workspace?.lock && <span className="hidden text-faint sm:inline">protected</span>}
            <span className="text-faint" aria-hidden>▾</span>
          </button>
          <span className="hidden truncate font-mono text-xs text-faint sm:inline">
            {characterName ?? "unsaved character"} · {filled} blocks · {active.length} LoRA
          </span>
        </div>
        <button
          onClick={() => setVeil(!veil)}
          aria-pressed={veil}
          title="Hide all images (H)"
          aria-label="Hide all images"
          className={`h-11 px-2 font-mono text-[10.5px] fine:h-8 uppercase ${veil ? "text-ink" : "text-faint hover:text-ink"}`}
        >
          {veil ? "show" : "hide"}
        </button>
        <GpuBar {...gpu} />
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[400px_minmax(0,1fr)_300px]">
        <aside className="order-2 flex flex-col lg:order-none lg:min-h-0 lg:border-r lg:border-line">
          <nav className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 flex border-b border-line bg-bg lg:static">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`label h-11 flex-1 border-b-2 lg:h-10 ${t.id === "library" ? "lg:hidden" : ""} ${
                  tab === t.id || (t.id === "prompt" && tab === "library") ? "border-ink text-ink" : "border-transparent"
                } ${t.id === "prompt" && tab === "library" ? "max-lg:border-transparent max-lg:text-muted" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="pb-32 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0">
            <div className={tab === "model" ? "hidden" : tab === "library" ? "hidden lg:block" : ""}>
              <PromptPanel recipe={recipe} set={setRecipe} triggers={triggers.filter(Boolean)} />
            </div>
            <div className={tab === "model" ? "" : "hidden"}>
              <ModelPanel recipe={recipe} set={setRecipe} catalog={catalog} />
            </div>
            <div className={tab === "library" ? "lg:hidden" : "hidden"}>
              <Library shown={shown} names={names} filter={showing} setFilter={setFilter} best={best} setBest={setBest} bestCount={bestCount} jobs={jobs} focus={job?.id ?? render?.id ?? null} onSelect={setOpen} onFocus={setFocus} />
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:py-3">
            {error && <p role="alert" className="mb-2 font-mono text-xs text-bad">{error}</p>}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 font-mono text-xs leading-snug text-faint tabular-nums">
                <div className="truncate text-muted">
                  {shortName(recipe.unet)} · {aspect.width}×{aspect.height}
                  {recipe.count > 1 && ` · ×${recipe.count}`}
                </div>
                <div className={`truncate ${blocked ? "text-warn" : ""}`}>
                  {blocked ?? (
                    <>
                      {seconds != null ? `≈ ${Math.round(seconds)}s · $${cost?.toFixed(3) ?? "?"}` : "no estimate yet"}
                      {gpu.gpu && !gpu.gpu.booted && " + boot"}
                    </>
                  )}
                </div>
              </div>
              <Btn variant="primary" onClick={submit} disabled={!!blocked || sending} className="h-12 w-40 text-sm fine:h-10">
                {sending ? "Sending…" : "Generate"}
                <kbd className="hidden font-mono text-[10.5px] opacity-50 [@media(pointer:fine)]:inline">{MOD}↵</kbd>
              </Btn>
            </div>
          </div>
        </aside>

        <main className="order-1 h-[52svh] border-b border-line lg:order-none lg:h-auto lg:min-h-0 lg:border-b-0">
          <Stage
            job={job}
            render={render}
            aspect={aspect}
            booted={gpu.gpu?.booted}
            loading={!loaded}
            onCancel={cancel}
            onDismiss={dismiss}
            onOpen={setOpen}
            onReuse={reuse}
            view={view}
            setView={setView}
            onStep={step}
          />
        </main>

        <aside className="hidden lg:block lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line">
          <Library
            shown={shown}
            names={names}
            filter={showing}
            setFilter={setFilter}
            best={best}
            setBest={setBest}
            bestCount={bestCount}
            jobs={jobs.filter((j) => j !== job)}
            focus={job?.id ?? render?.id ?? null}
            onSelect={(r) => setFocus(r.id)}
            onFocus={setFocus}
          />
        </aside>
      </div>

      <Viewer render={open} onClose={() => setOpen(null)} onReuse={reuse} view={view} setView={setView} onStep={step} />
      <WorkspaceMenu open={menu} onClose={() => setMenu(false)} onSwitch={onClose} />
      <Shortcuts open={keys} onClose={() => setKeys(false)} />
    </div>
  );
}

function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(24rem,calc(100vw-2rem))] border border-line bg-bg p-0 text-ink">
      <div className="flex h-12 items-center border-b border-line px-4">
        <span className="label flex-1">Keyboard</span>
        <Btn onClick={() => dialog.current?.close()}>Done</Btn>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4 text-xs">
        {KEYS.map(([k, what]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-ink">{k.replace("⌘", MOD)}</dt>
            <dd className="text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
