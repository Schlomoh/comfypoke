// The top bar on a phone, the left column's head on a desktop: Prompt, Model and Library (a phone's
// third tab; a desktop shows the library in its own column), and the activity button.
import { useAtom, useAtomValue } from "jotai";

import { ActivityButton } from "@/features/activity/activity-button";
import { rendersAtom, tabAtom, type Tab } from "@/state/studio";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

export function TabBar() {
  const [tab, setTab] = useAtom(tabAtom);
  const count = useAtomValue(rendersAtom)?.length ?? 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "model", label: "Model" },
    { id: "library", label: `Library ${count}` },
  ];
  // on a desktop the library tab is hidden and Prompt stays marked while the library is chosen
  const marked = (id: Tab) => tab === id || (id === "prompt" && tab === "library");
  return (
    <nav className="sticky top-0 z-20 flex items-center border-b border-line bg-bg pt-[env(safe-area-inset-top)] pr-2 lg:static lg:pt-0">
      {tabs.map((t) => (
        <Pressable
          key={t.id}
          onClick={() => setTab(t.id)}
          aria-pressed={tab === t.id}
          className={cn(
            "h-11 min-w-0 flex-1 truncate border-b-2 border-transparent px-1 text-center label lg:h-10",
            t.id === "library" && "lg:hidden",
            marked(t.id) && "border-ink text-ink",
            t.id === "prompt" && tab === "library" && "max-lg:border-transparent max-lg:text-muted",
          )}
        >
          {t.label}
        </Pressable>
      ))}
      <ActivityButton />
    </nav>
  );
}
