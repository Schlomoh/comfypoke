// Bringing a phrase's card into view inside its sheet, marked for a moment. Only the sheet's body
// scrolls, never the page: on iOS a page moved under a fixed layer misplaces taps.
export function flash(id: string) {
  const el = document.getElementById(`card-${id}`);
  const body = el?.closest<HTMLElement>("[data-sheet-body]");
  if (!el || !body) return;
  const top = el.offsetTop - body.offsetTop;
  if (top < body.scrollTop || top + el.offsetHeight > body.scrollTop + body.clientHeight)
    body.scrollTop = Math.max(0, top - (body.clientHeight - el.offsetHeight) / 2);
  el.classList.remove("flash-card");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash-card");
}
