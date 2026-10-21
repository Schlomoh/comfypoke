import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Locked, type Catalog } from "./api";
import { closeSpace, db, migrate, saveDraft, SpaceContext, useRenders, useSpace, type Render, type Space } from "./db";
import { ActivityButton, ActivitySheet } from "./activity";
import { useGpu } from "./gpu";
import { useJobs } from "./jobs";
import { deleteRenders, KEYS, Library, revealThumb, saveImage, toggleBest } from "./library";
import { notify } from "./toast";
import { Viewer } from "./viewer";
import { ModelPanel, resolve } from "./model";
import { plan, RenderSheet, summary } from "./batch";
import { PromptPanel } from "./prompt";
import { compose, EMPTY, fromSize, legacyUnet, parseRecipe, phrase, size, useRecipe, type Recipe } from "./recipe";
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

/** The Upscale section's settings as what a job carries. */
const upscaleOf = ({ upscale: { megapixels, prompt, denoise } }: Recipe) => ({ megapixels, prompt, denoise });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
type Tab = "prompt" | "model" | "library";

function Studio({ draft, onLocked, onClose }: { draft: Recipe; onLocked: () => void; onClose: () => void }) {
  const space = useSpace();
  const [recipe, setRecipe] = useRecipe(draft, useCallback((r: Recipe) => void saveDraft(space, r), [space]));
  const [tab, setTab] = useState<Tab>("prompt");
  const [focus, setFocus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [filter, setFilter] = useState("");
  const [best, setBest] = useState(false);
  const [keys, setKeys] = useState(false);
  const [veil, setVeil] = useVeil();
  const [view, setView] = useState<View>(FIT); // one zoom for the stage and the viewer, kept across images
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>({ models: [], families: [], loras: [] });
  const gpu = useGpu(onLocked);
  const { jobs, generate, upscale, cancel, dismiss } = useJobs(setFocus);
  const [info, setInfo] = useState(false);
  const closeViewer = useCallback(() => setOpenId(null), []);
  const loaded = useRenders();
  const renders = loaded ?? [];
  const notes = useLiveQuery(() => db.loraNotes.toArray(), []) ?? [];
  const [renderSheet, setRenderSheet] = useState(false);
  const workspace = useLiveQuery(() => db.workspaces.get(space.id), [space.id]);
  // A finished job stays until its render is in the library, so the viewer goes from one to the other in place.
  const live = jobs.filter((j) => !(j.saved && renders.some((r) => r.id === j.id)));
  useEffect(() => {
    jobs.forEach((j) => j.saved && renders.some((r) => r.id === j.id) && dismiss(j.id));
  }, [jobs, renders, dismiss]);
  const open = renders.find((r) => r.id === openId) ?? null; // always the stored version: Best changes it
  const openJob = open ? null : (live.find((j) => j.id === openId) ?? null);
  const setOpen = (r: Render | null) => setOpenId(r?.id ?? null);

  useEffect(() => {
    api.models().then(setCatalog, (e) => (e instanceof Locked ? onLocked() : setError(errorText(e))));
  }, [onLocked]);

  const active = recipe.loras.filter((l) => l.on);
  const triggers = active.map((l) => notes.find((n) => n.name === l.name)?.trigger ?? "");
  const prompt = compose(recipe, triggers);
  const aspect = size(recipe.aspect, recipe.mp);
  const sent = resolve(recipe, catalog);
  const characterName = recipe.cast.filter((c) => c.savedId).map((c) => c.name).join(" & ") || undefined; // the library filters by it
  const names = [...new Set(renders.map((r) => r.characterName).filter(Boolean))] as string[];
  const showing = names.includes(filter) ? filter : ""; // the last render of a character may be gone
  const shown = renders.filter((r) => (!showing || r.characterName === showing) && (!best || r.best));
  const bestCount = renders.filter((r) => r.best && (!showing || r.characterName === showing)).length;
  const job = live.find((j) => j.id === focus) ?? (focus ? undefined : live[0]);
  const render = job ? undefined : (renders.find((r) => r.id === focus) ?? renders[0]);
  const cursor = useRef<string | null>(null);
  cursor.current = (open ?? openJob ?? job ?? render)?.id ?? null; // where keyboard browsing starts

  // Median render time of this model on this device: cold boots skew a mean, not a median.
  const times = renders.filter((r) => (r.unet ?? legacyUnet(r.model)) === recipe.unet).slice(0, 15).map((r) => r.seconds);
  const each = times.length ? median(times) : null;
  const batch = summary(recipe);
  const runs = batch ? Number(batch.split(" ")[0]) : 1;
  const seconds = each == null ? null : each * runs;
  const cost = seconds != null && gpu.gpu ? (seconds * gpu.gpu.rate_per_hour) / 3600 : null;

  const submit = async () => {
    if (!prompt || sending || !sent.family) return;
    setError("");
    setSending(true);
    try {
      // one job per version and seed; stop_after rides on each, so the last one sent decides
      for (const [i, run] of plan(recipe, triggers).entries()) {
        const r = await generate(
          {
            unet: recipe.unet,
            family: sent.family.id,
            prompt: run.prompt,
            negative: sent.negative ? recipe.negative : "",
            width: aspect.width,
            height: aspect.height,
            seed: run.seed,
            steps: recipe.steps,
            cfg: recipe.cfg,
            loras: active.map(({ name, strength }) => ({ name, strength })),
            stop_after: recipe.stopAfter,
          },
          { recipe: run.recipe, characterName, then: recipe.upscale.auto ? upscaleOf(recipe) : undefined },
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

  /** Upscales with the Model tab's settings, one job each; the results land in the library as new images. */
  const upscaleMany = async (rs: Render[]) => {
    const u = upscaleOf(recipe);
    notify(`Upscaling ${rs.length > 1 ? `${rs.length} images` : "the image"} to ${u.megapixels} MP${u.prompt.trim() ? " with a touch-up" : ""}`);
    for (const r of rs) {
      try {
        await upscale(r, u, recipe.stopAfter);
      } catch (e) {
        if (e instanceof Locked) return onLocked();
        return notify(`Could not start the upscale: ${errorText(e)}`, { bad: true });
      }
    }
  };
  const upscaleLabel = `Upscale to ${recipe.upscale.megapixels} MP${recipe.upscale.prompt.trim() ? `, touch-up "${recipe.upscale.prompt.trim()}"` : ""}, set in the Model tab`;

  /** Delete one image (and its upscales), then show the next one where it was. */
  const remove = async (r: Render) => {
    const gone = await deleteRenders([r], renders);
    if (!gone) return;
    const at = shown.findIndex((x) => x.id === r.id);
    const left = (from: number, dir: 1 | -1) => {
      for (let i = from; i >= 0 && i < shown.length; i += dir) if (!gone.has(shown[i].id)) return shown[i];
    };
    const after = left(at + 1, 1) ?? left(at - 1, -1); // its upscales sit next to it and went with it
    setFocus(after?.id ?? null);
    if (open) setOpen(after ?? null);
  };

  /** Move through the queue and the library by n images, from the keyboard or a swipe. The zoom stays as it is. */
  const step = (n: number) => {
    const items: { id: string }[] = [...live, ...shown]; // as the library lists them
    const at = items.findIndex((r) => r.id === cursor.current);
    const next = items[Math.min(items.length - 1, Math.max(0, at + n))];
    if (!next || next.id === cursor.current) return false;
    cursor.current = next.id; // ahead of React: held-down arrows fire faster than it re-renders
    if (openId) setOpenId(next.id);
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
      const cur = openJob ? undefined : (shown[at] ?? open ?? render); // the viewer's image, or the one on the stage; none on a job
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
      else if (!cur || (e.repeat && "bsu".includes(k) || e.repeat && (k === "Delete" || k === "Backspace"))) return; // a held key acts once
      else if ((k === "f" || k === "Enter") && !open) (e.preventDefault(), setOpen(cur));
      else if (k === "i") open ? setInfo(!info) : (setInfo(true), setOpen(cur));
      else if (k === "r") reuse(cur);
      else if (k === "s") saveImage(space, cur);
      else if (k === "b") toggleBest(space, cur);
      else if (k === "u") upscaleMany([cur]);
      else if (k === "Delete" || k === "Backspace") (e.preventDefault(), remove(cur));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reuse = (r: Render) => {
    // a render from before recipes were kept comes back as its prompt, verbatim, in the scene's Extra row
    const base: Recipe = r.recipe ? parseRecipe(r.recipe) : { ...EMPTY, scene: { ...EMPTY.scene, extra: [phrase(r.prompt)] }, ...fromSize(r.width, r.height) };
    // The model as actually rendered; older renders and recipes only knew "turbo" or "raw".
    const unet = r.unet ?? legacyUnet(r.model);
    const suggested = catalog.models.find((m) => m.file === unet)?.family;
    setRecipe({
      ...EMPTY,
      ...base,
      unet,
      // pinned only when it differs from what the model list suggests; with no list loaded yet, keep it as rendered
      family: r.family && (catalog.models.length === 0 || r.family !== suggested) ? r.family : null,
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
    : !sent.family ? "pick a family for this model" : !prompt ? "add a phrase to generate" : null;
  const activity = <ActivityButton gpu={gpu} jobs={live} onOpen={() => setSheet(true)} />;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[400px_minmax(0,1fr)_300px]">
        {/* On a phone the aside's parts join the page column: the tab row first, as the top bar, then the stage */}
        <aside className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line">
          <nav className="sticky top-0 z-20 flex items-center border-b border-line bg-bg pt-[env(safe-area-inset-top)] pr-2 lg:static lg:pt-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`label h-11 min-w-0 flex-1 truncate border-b-2 px-1 lg:h-10 ${t.id === "library" ? "lg:hidden" : ""} ${
                  tab === t.id || (t.id === "prompt" && tab === "library") ? "border-ink text-ink" : "border-transparent"
                } ${t.id === "prompt" && tab === "library" ? "max-lg:border-transparent max-lg:text-muted" : ""}`}
              >
                {t.label}
              </button>
            ))}
            {activity}
          </nav>
          <div className="order-2 pb-32 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0">
            <div className={tab === "model" ? "hidden" : tab === "library" ? "hidden lg:block" : ""}>
              <PromptPanel recipe={recipe} set={setRecipe} triggers={triggers.filter(Boolean)} onRenders={() => setRenderSheet(true)} />
            </div>
            <div className={tab === "model" ? "" : "hidden"}>
              <ModelPanel recipe={recipe} set={setRecipe} catalog={catalog} />
            </div>
            <div className={tab === "library" ? "lg:hidden" : "hidden"}>
              <Library
                shown={shown}
                all={renders}
                names={names}
                filter={showing}
                setFilter={setFilter}
                best={best}
                setBest={setBest}
                bestCount={bestCount}
                jobs={live}
                focus={job?.id ?? render?.id ?? null}
                onSelect={setOpen}
                onFocus={(id) => (setFocus(id), setOpenId(id))}
                onUpscale={upscaleMany}
                upscaleLabel={upscaleLabel}
              />
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-20 order-3 border-t border-line bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:py-3">
            {error && <p role="alert" className="mb-2 font-mono text-xs text-bad">{error}</p>}
            <div className="flex items-center gap-3">
              {/* the summary opens the list of renders, seeds and stop-after */}
              <button onClick={() => setRenderSheet(true)} aria-label="Each render, seeds and stopping the GPU after"
                className="min-w-0 flex-1 text-left font-mono text-xs leading-snug text-faint tabular-nums">
                <div className="truncate text-muted">
                  {batch ?? `${shortName(recipe.unet)} · ${aspect.width}×${aspect.height}`} <span aria-hidden>›</span>
                </div>
                <div className={`truncate ${blocked ? "text-warn" : ""}`}>
                  {blocked ?? (
                    <>
                      {seconds != null ? `≈ ${seconds < 90 ? `${Math.round(seconds)}s` : `${(seconds / 60).toFixed(1)} min`} · $${cost?.toFixed(3) ?? "?"}` : "no estimate yet"}
                      {gpu.gpu && !gpu.gpu.booted && " + boot"}
                      {recipe.stopAfter && " · GPU stops after"}
                    </>
                  )}
                </div>
              </button>
              <Btn variant="primary" onClick={submit} disabled={!!blocked || sending} className="h-12 w-40 text-sm fine:h-10">
                {sending ? "Sending…" : runs > 1 ? `Generate ${runs}` : "Generate"}
                <kbd className="hidden font-mono text-[10.5px] opacity-50 [@media(pointer:fine)]:inline">{MOD}↵</kbd>
              </Btn>
            </div>
          </div>
        </aside>

        <main className="order-1 h-[56svh] border-b border-line lg:order-none lg:h-auto lg:min-h-0 lg:border-b-0">
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
            onUpscale={(r) => upscaleMany([r])}
            onDelete={remove}
            view={view}
            setView={setView}
            onStep={step}
          />
        </main>

        <aside className="hidden lg:block lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line">
          <Library
            shown={shown}
            all={renders}
            onUpscale={upscaleMany}
            upscaleLabel={upscaleLabel}
            names={names}
            filter={showing}
            setFilter={setFilter}
            best={best}
            setBest={setBest}
            bestCount={bestCount}
            jobs={live.filter((j) => j !== job)}
            focus={job?.id ?? render?.id ?? null}
            onSelect={(r) => setFocus(r.id)}
            onFocus={setFocus}
          />
        </aside>
      </div>

      <Viewer
        render={open}
        job={openJob}
        activity={activity}
        onCancel={cancel}
        onDismiss={dismiss}
        all={renders}
        info={info}
        setInfo={setInfo}
        onClose={closeViewer}
        onOpen={(r) => (setOpen(r), setFocus(r.id))}
        onReuse={reuse}
        onUpscale={(r) => upscaleMany([r])}
        onDelete={remove}
        view={view}
        setView={setView}
        onStep={step}
      />
      <ActivitySheet
        open={sheet}
        onClose={() => setSheet(false)}
        gpu={gpu}
        jobs={live}
        onShow={(id) => (setSheet(false), setFocus(id), setOpenId(id))}
        onCancel={cancel}
        onDismiss={dismiss}
        workspace={workspace}
        onWorkspace={() => (setSheet(false), setMenu(true))}
        veil={veil}
        setVeil={setVeil}
      />
      <RenderSheet
        open={renderSheet}
        onClose={() => setRenderSheet(false)}
        recipe={recipe}
        set={setRecipe}
        triggers={triggers.filter(Boolean)}
        seconds={each}
        rate={gpu.gpu?.rate_per_hour ?? null}
      />
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
