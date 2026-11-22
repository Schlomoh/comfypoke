// Looks, managed the way characters are: the Look tab's head names the look it is (or the one it was changed from),
// and its ⋯ opens a sheet to rename it, update it, save it as a new one, use another, or delete one. A look is the
// model, family, steps, CFG and the stack's own LoRAs under a name, shared by all workspaces (stored as a setup).
import { useAtomValue } from "jotai";
import { useState } from "react";

import { deleteSetup, restoreSetup, saveSetup } from "@/data/db/setups";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { shortName } from "@/domain/format";
import { setupOf, type Setup } from "@/domain/setup";
import { isBuiltIn, useSetup } from "@/features/model/use-setup";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input, Labeled } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { notify } from "@/ui/notify";
import { Pressable } from "@/ui/pressable";
import { Heading, Note } from "@/ui/text";

const remove = (s: Setup) => {
  void deleteSetup(s.id);
  notify(`Deleted the look “${s.name}”`, { action: { label: "Undo", run: () => void restoreSetup(s) } });
};

/** The saved looks: a tap uses one, × deletes one of your own. */
export function LookList({ onUsed }: { onUsed?: () => void }) {
  const { setups, isOn, apply } = useSetup();
  return (
    <div className="flex flex-col border-t border-line">
      {setups.map((s) => (
        <div key={s.id} className="flex items-center border-b border-line">
          <Pressable
            onClick={() => {
              apply(s);
              onUsed?.();
            }}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2"
          >
            <span className="min-w-0 flex-1 break-words">{s.name}</span>
            <span className="truncate font-mono text-[11px] text-muted">
              {isOn(s)
                ? "in use"
                : `${shortName(s.unet)}${s.loras.length ? ` + ${s.loras.length} LoRA` : ""}`}
            </span>
          </Pressable>
          {!isBuiltIn(s) && (
            <Button
              variant="icon"
              size="square"
              onClick={() => remove(s)}
              aria-label={`Delete the look ${s.name}`}
            >
              ×
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function LookManager({ onClose }: { onClose: () => void }) {
  const recipe = useAtomValue(recipeAtom);
  const { catalog } = useCatalog();
  const { current, from, update, saved, taken } = useSetup();
  const family = resolve(recipe, catalog).family?.id;
  const linked = current ?? from;
  const own = linked && !isBuiltIn(linked) ? linked : undefined;
  const [asked, setNaming] = useState(false);
  const naming = asked || !linked; // the list loads after the first render, so this can't be state alone
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [label, setLabel] = useState<string | null>(null); // the name field while it is typed in
  const typed = (label ?? own?.name ?? "").trim();
  const nameOk = !!own && !!typed && !taken(typed, own.id);
  const saveNew = () => {
    const n = name.trim();
    if (!n || !family) return setError("Name the look first.");
    if (taken(n)) return setError(`A look is already called “${n}”. Pick another name.`);
    saved(setupOf(recipe, family, n));
    notify(`Saved the look “${n}”`);
    onClose();
  };
  // a rename is saved as it is typed, so closing the sheet or tapping Update never loses it
  const rename = (text: string) => {
    setLabel(text);
    const n = text.trim();
    if (!own) return;
    if (!n) return setError("A look needs a name.");
    if (taken(n, own.id)) return setError(`A look is already called “${n}”.`);
    setError("");
    if (n !== own.name) void saveSetup({ ...own, name: n });
  };

  return (
    <>
      {own && (
        <Labeled label="Name">
          <Input
            value={label ?? own.name}
            onChange={(e) => rename(e.target.value)}
            onBlur={() => (setLabel(null), setError(""))} // an unusable name goes back to the saved one
            className="fine:h-9"
          />
        </Labeled>
      )}
      <p className="font-mono text-xs text-muted">
        {linked ? (
          <>
            <b className="font-medium text-ink">Saved look “{linked.name}”</b> ·{" "}
            {current ? "no changes" : "changed"}
            {isBuiltIn(linked) && " · built in"}
          </>
        ) : (
          <>
            <b className="font-medium text-ink">New</b> · not saved as a look
          </>
        )}
      </p>
      {from && !current && !naming && (
        <div className="flex gap-1.5">
          {own && (
            <Button
              className="flex-1"
              onClick={() => (update({ ...own, name: nameOk ? typed : own.name }), onClose())}
            >
              Update “{nameOk ? typed : own.name}”
            </Button>
          )}
          <Button className="flex-1" onClick={() => setNaming(true)}>
            Save as new
          </Button>
        </div>
      )}
      {naming && !current && (
        <form className="flex gap-1.5" onSubmit={(e) => (e.preventDefault(), saveNew())}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => (setName(e.target.value), setError(""))}
            placeholder="name the new look"
            className="flex-1 fine:h-9"
          />
          <Button type="submit">Save look</Button>
        </form>
      )}
      {error && <Note tone="bad">{error}</Note>}
      <Note>
        A look is the model, its family, steps, CFG and the LoRAs of the stack itself, not a character&apos;s.
        Looks are shared by all workspaces, and the Edit tab offers them for each pass.
      </Note>
      <Heading>Saved looks</Heading>
      <LookList onUsed={onClose} />
    </>
  );
}

/** The Look tab's head: which look this is, and the ⋯ that manages looks. */
export function LookHead() {
  const { current, from } = useSetup();
  const [open, setOpen] = useState(false);
  return (
    <section className="flex items-center gap-2 border-b border-line px-4 py-3">
      <span className="label">Look</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {current?.name ?? (from ? `${from.name} · changed` : "not saved as a look")}
      </span>
      <Button onClick={() => setOpen(true)} aria-label="Manage looks">
        ⋯
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Look">
        {open && <LookManager onClose={() => setOpen(false)} />}
      </Sheet>
    </section>
  );
}
