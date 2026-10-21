// notify() can be called from anywhere, including outside React; the one Toasts component shows it.
export type Toast = { id: number; text: string; bad?: boolean; action?: { label: string; run: () => void } };

let show: (t: Toast) => void = () => {};
let next = 0;

export function notify(text: string, opts: { bad?: boolean; action?: Toast["action"] } = {}) {
  show({ id: ++next, text, ...opts });
}

export function listen(fn: (t: Toast) => void) {
  show = fn;
  return () => {
    show = () => {};
  };
}
