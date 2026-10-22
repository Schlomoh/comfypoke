// One tab per person and one for the scene, each saying whether it is linked to a saved character (or
// scene) and whether it changed since. The active tab's ⋯ opens its name and link. Scene and + stay at
// the right while the people scroll.
import { useAtomValue } from "jotai";

import { useSaved } from "@/data/db/saved";
import { kindOf, linkState, type Key } from "@/domain/cast";
import { MAX_PEOPLE, type Person, type Scene } from "@/domain/recipe";
import { axes } from "@/domain/versions";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

function Badge({ state }: { state: ReturnType<typeof linkState> }) {
  if (!state.s)
    return (
      <span className="border border-line px-1 font-mono text-[10px] text-faint" title="not saved">
        new
      </span>
    );
  if (!state.changed) return null;
  return (
    <span className="border border-edge px-1 font-mono text-[10px] text-ink" title="changed since saved">
      edited
    </span>
  );
}

function Tab({
  id,
  name,
  owner,
  active,
  varied,
  onTab,
  onMenu,
}: {
  id: Key;
  name: string;
  owner: Person | Scene;
  active: boolean;
  varied: boolean;
  onTab: (k: Key) => void;
  onMenu: () => void;
}) {
  const saved = useSaved();
  return (
    <div
      id={`tab-${id}`}
      className={cn("flex shrink-0", active && "bg-raised shadow-[inset_0_-2px_0_var(--color-ink)]")}
    >
      <Pressable
        onClick={() => onTab(id)}
        aria-pressed={active}
        className={cn(
          "flex h-11 items-center gap-1.5 pr-2 pl-3 text-[13px]",
          active ? "text-ink" : "text-muted",
        )}
      >
        {varied && <span className="size-1.5 bg-warn" title="has versions" />}
        {name}
        <Badge state={linkState(kindOf(id), owner, saved)} />
      </Pressable>
      {active && (
        <Button
          variant="icon"
          size="square"
          onClick={onMenu}
          aria-label={`${name}: name, save, use a saved one`}
          className="h-11 w-10 border-l border-line text-muted hover:text-ink fine:h-11 fine:w-10"
        >
          ⋯
        </Button>
      )}
    </div>
  );
}

export function CastTabs({
  active,
  onTab,
  onMenu,
  onAdd,
}: {
  active: Key;
  onTab: (k: Key) => void;
  onMenu: () => void;
  onAdd: () => void;
}) {
  const recipe = useAtomValue(recipeAtom);
  const varied = new Set(axes(recipe).map((a) => a.owner));
  const full = recipe.cast.length >= MAX_PEOPLE;
  const tab = (id: Key, name: string, owner: Person | Scene) => (
    <Tab
      key={id}
      id={id}
      name={name}
      owner={owner}
      active={id === active}
      varied={varied.has(name)}
      onTab={onTab}
      onMenu={onMenu}
    />
  );
  return (
    <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-[5] flex border-b border-line bg-bg lg:top-0">
      <div className="flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto">
        {recipe.cast.map((c) => tab(c.id, c.name, c))}
      </div>
      <div className="flex shrink-0 border-l border-edge">
        {tab("scene", "Scene", recipe.scene)}
        <Button
          variant="icon"
          size="square"
          onClick={onAdd}
          disabled={full}
          aria-label="Add a person"
          title={full ? `At most ${MAX_PEOPLE} people` : "Add a person"}
          className="border-l border-line text-muted hover:text-ink"
        >
          +
        </Button>
      </div>
    </div>
  );
}
