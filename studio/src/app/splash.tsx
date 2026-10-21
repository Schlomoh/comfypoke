import type { ReactNode } from "react";

/** The narrow column the screens before a workspace use: splash, start screen, a crash. */
export function Column({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-12">
      <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
      {children}
    </main>
  );
}

/** What shows while something loads, instead of an empty black screen. */
export function Splash({ text }: { text: string }) {
  return (
    <Column>
      <p className="font-mono text-xs text-faint">{text}…</p>
    </Column>
  );
}
