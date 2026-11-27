// An open workspace. On a phone one column: the tab bar on top, the stage, the open tab, and the
// dock fixed at the bottom (the edit's action in the Edit tab). On a desktop three: editor, stage, library.
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

import { Dock } from "@/app/dock";
import { ShortcutsSheet } from "@/app/shortcuts-sheet";
import { TabBar } from "@/app/tab-bar";
import { useShortcuts } from "@/app/use-shortcuts";
import { useUpdateNotice } from "@/app/use-update-notice";
import { FIT } from "@/domain/view";
import { ActivitySheet } from "@/features/activity/activity-sheet";
import { EditPanel } from "@/features/edit/edit-panel";
import { useKeepEdits } from "@/features/edit/keep";
import { useEdit } from "@/features/edit/use-edit";
import { Library } from "@/features/library/library";
import { LookPanel } from "@/features/model/look-panel";
import { PickSheet } from "@/features/pick/pick-sheet";
import { LinkSheet } from "@/features/prompt/link-sheet";
import { PromptPanel } from "@/features/prompt/prompt-panel";
import { RowSheet } from "@/features/prompt/row-sheet";
import { TogetherSheet } from "@/features/prompt/together-sheet";
import { useCloseSheet } from "@/features/prompt/use-clear-emptied";
import { SeedsSheet } from "@/features/run/seeds-sheet";
import { Stage } from "@/features/stage/stage";
import { Viewer } from "@/features/viewer/viewer";
import { WorkspaceMenu } from "@/features/workspaces/workspace-menu";
import { useRendersSync } from "@/state/actions";
import { useGenerate } from "@/state/generate";
import { useJobRunner } from "@/state/jobs";
import { useCastLoras, useDraftAutosave } from "@/state/recipe";
import { stripTab, tabAtom, veilAtom, viewAtom } from "@/state/studio";
import { cn } from "@/ui/cn";
import { PaneSlot } from "@/ui/pane";

/** H: the images stay where they are, as blank tiles, until shown again (index.css). */
function useVeilClass() {
  const veil = useAtomValue(veilAtom);
  useEffect(() => {
    document.documentElement.classList.toggle("veil", veil);
  }, [veil]);
}

function Tabs() {
  const tab = useAtomValue(tabAtom);
  return (
    <div className="pb-32 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0">
      {/* all of them stay mounted, so a half-typed field survives a tab switch */}
      <div
        className={cn((tab === "look" || tab === "edit") && "hidden", tab === "library" && "hidden lg:block")}
      >
        <PromptPanel />
      </div>
      <div className={cn(tab !== "look" && "hidden")}>
        <LookPanel />
      </div>
      <div className={cn(tab !== "edit" && "hidden")}>
        <EditPanel />
      </div>
      <div className={cn(tab === "library" ? "lg:hidden" : "hidden")}>
        <Library />
      </div>
    </div>
  );
}

/** Another tab starts afresh: the zoom set while painting does not follow into the library, and a row's pane (on a
 * desktop) closes with the tab it was opened from. */
function useTabChange() {
  const tab = useAtomValue(tabAtom);
  const setView = useSetAtom(viewAtom);
  const closeSheet = useCloseSheet();
  const close = useRef(closeSheet);
  useEffect(() => {
    close.current = closeSheet;
  });
  const last = useRef(tab);
  useEffect(() => {
    if (last.current === tab) return;
    last.current = tab;
    setView(FIT);
    close.current();
  }, [tab, setView]);
}

export function Studio({ onClose }: { onClose: () => void }) {
  useJobRunner();
  useDraftAutosave();
  useKeepEdits();
  useCastLoras();
  useRendersSync();
  useVeilClass();
  useUpdateNotice();
  useTabChange();
  const generate = useGenerate();
  const edit = useEdit();
  const tab = useAtomValue(tabAtom);
  const editing = tab === "edit";
  useShortcuts(() => void (editing ? edit.submit() : generate.submit()));

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(420px,30vw)_minmax(0,1fr)_minmax(320px,24vw)]">
        {/* on a phone the aside's parts join the page column: the tab bar first, then the stage */}
        <aside className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line">
          <TabBar />
          {/* on a desktop a row's sheet opens over the tab, in this column (ui/pane.tsx) */}
          <div className="relative order-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <Tabs />
            <PaneSlot />
          </div>
          <Dock g={generate} edit={editing ? edit : undefined} />
        </aside>
        <main
          className={cn(
            "order-1 h-[56svh] border-b border-line lg:order-none lg:h-auto lg:min-h-0 lg:border-b-0",
            stripTab(tab) && "h-[22svh]",
          )}
        >
          <Stage />
        </main>
        <aside className="hidden lg:block lg:min-h-0 lg:[scrollbar-gutter:stable] lg:overflow-y-auto lg:border-l lg:border-line">
          <Library column />
        </aside>
      </div>
      <Viewer />
      <ActivitySheet />
      <SeedsSheet />
      <WorkspaceMenu onSwitch={onClose} />
      <PickSheet />
      {/* the prompt's sheets: the Edit tab opens the Wearing row's too */}
      <RowSheet />
      <LinkSheet />
      <TogetherSheet />
      <ShortcutsSheet />
    </div>
  );
}
