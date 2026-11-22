// Where a popover goes: under what opened it (above when there is no room below), centered on it or flush with one
// of its sides, and always inside the screen.
const GAP = 6;

export function placeBelow(
  trigger: HTMLElement | null,
  pop: HTMLElement | null,
  align: "center" | "start" | "end" = "center",
) {
  const t = trigger?.getBoundingClientRect();
  if (!t || !pop) return;
  const w = pop.offsetWidth;
  const want = { center: t.left + t.width / 2 - w / 2, start: t.left, end: t.right - w }[align];
  const left = Math.min(Math.max(8, want), window.innerWidth - w - 8);
  const below = t.bottom + GAP + pop.offsetHeight < window.innerHeight;
  pop.style.left = `${left}px`;
  pop.style.top = below ? `${t.bottom + GAP}px` : `${Math.max(8, t.top - GAP - pop.offsetHeight)}px`;
}
