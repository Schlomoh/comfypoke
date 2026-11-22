// An open workspace. On a phone one column: the tab bar on top, the stage, the open tab, and the
// dock fixed at the bottom (the edit's action in the Edit tab). On a desktop three: editor, stage, library.
import { useAtomValue } from "jotai";
import { useEffect } from "react";

import { Dock } from "@/app/dock";
import { ShortcutsSheet } from "@/app/shortcuts-sheet";
import { TabBar } from "@/app/tab-bar";
import { useShortcuts } from "@/app/use-shortcuts";
import { useUpdateNotice } from "@/app/use-update-notice";
import { ActivitySheet } from "@/features/activity/activity-sheet";
import { EditPanel } from "@/features/edit/edit-panel";
import { useEdit } from "@/features/edit/use-edit";
import { Library } from "@/features/library/library";
import { LookPanel } from "@/features/model/look-panel";
import { PickSheet } from "@/features/pick/pick-sheet";
import { LinkSheet } from "@/features/prompt/link-sheet";
import { PromptPanel } from "@/features/prompt/prompt-panel";
import { RowSheet } from "@/features/prompt/row-sheet";
import { TogetherSheet } from "@/features/prompt/together-sheet";
import { SeedsSheet } from "@/features/run/seeds-sheet";
import { Stage } from "@/features/stage/stage";
import { Viewer } from "@/features/viewer/viewer";
import { WorkspaceMenu } from "@/features/workspaces/workspace-menu";
import { useRendersSync } from "@/state/actions";
import { useGenerate } from "@/state/generate";
import { useJobRunner } from "@/state/jobs";
import { useCastLoras, useDraftAutosave } from "@/state/recipe";
import { tabAtom, veilAtom } from "@/state/studio";
import { cn } from "@/ui/cn";

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
    <div className="order-2 pb-32 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0">
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

export function Studio({ onClose }: { onClose: () => void }) {
  useJobRunner();
  useDraftAutosave();
  useCastLoras();
  useRendersSync();
  useVeilClass();
  useUpdateNotice();
  const generate = useGenerate();
  const edit = useEdit();
  const editing = useAtomValue(tabAtom) === "edit";
  useShortcuts(() => void (editing ? edit.submit() : generate.submit()));

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[400px_minmax(0,1fr)_300px]">
        {/* on a phone the aside's parts join the page column: the tab bar first, then the stage */}
        <aside className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line">
          <TabBar />
          <Tabs />
          <Dock g={generate} edit={editing ? edit : undefined} />
        </aside>
        <main className="order-1 h-[56svh] border-b border-line lg:order-none lg:h-auto lg:min-h-0 lg:border-b-0">
          <Stage />
        </main>
        <aside className="hidden lg:block lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line">
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
