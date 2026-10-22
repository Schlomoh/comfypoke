// An open workspace. On a phone one column: the tab bar on top, the stage, the open tab, and the
// generate bar fixed at the bottom. On a desktop three: editor, stage, library.
import { useAtomValue } from "jotai";
import { useEffect } from "react";

import { GenerateBar } from "@/app/generate-bar";
import { ShortcutsSheet } from "@/app/shortcuts-sheet";
import { TabBar } from "@/app/tab-bar";
import { useShortcuts } from "@/app/use-shortcuts";
import { ActivitySheet } from "@/features/activity/activity-sheet";
import { Library } from "@/features/library/library";
import { ModelPanel } from "@/features/model/model-panel";
import { PromptPanel } from "@/features/prompt/prompt-panel";
import { RenderSheet } from "@/features/renders/render-sheet";
import { Stage } from "@/features/stage/stage";
import { Viewer } from "@/features/viewer/viewer";
import { WorkspaceMenu } from "@/features/workspaces/workspace-menu";
import { useRendersSync } from "@/state/actions";
import { useGenerate } from "@/state/generate";
import { useJobRunner } from "@/state/jobs";
import { useDraftAutosave } from "@/state/recipe";
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
      {/* all three stay mounted, so a sheet or a half-typed field survives a tab switch */}
      <div className={cn(tab === "model" && "hidden", tab === "library" && "hidden lg:block")}>
        <PromptPanel />
      </div>
      <div className={cn(tab !== "model" && "hidden")}>
        <ModelPanel />
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
  useRendersSync();
  useVeilClass();
  const generate = useGenerate();
  useShortcuts(() => void generate.submit());

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[400px_minmax(0,1fr)_300px]">
        {/* on a phone the aside's parts join the page column: the tab bar first, then the stage */}
        <aside className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line">
          <TabBar />
          <Tabs />
          <GenerateBar g={generate} />
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
      <RenderSheet />
      <WorkspaceMenu onSwitch={onClose} />
      <ShortcutsSheet />
    </div>
  );
}
