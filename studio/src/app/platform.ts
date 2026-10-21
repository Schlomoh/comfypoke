/** The modifier key as this keyboard labels it. */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";
export const wide = () => matchMedia("(min-width: 1024px)").matches;
