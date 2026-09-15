// GPU worker status and controls, backed by the gpu_relay node's /gpu/* routes.
// Two views of one state: a sidebar tab ("GPU") with the full panel, and a small pill you can drag
// anywhere and close (position and visibility are remembered). Numbers tick every second between polls.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const POLL_MS = 5000;
const COLORS = { cold: "#8a8a8a", starting: "#d9a300", warm: "#3aa655", busy: "#3b82f6", stopping: "#d9a300" };
const LABEL = { cold: "napping", starting: "waking up", warm: "awake", busy: "rendering", stopping: "dozing off" };
const LS = "comfy_modal.gpu";
const state = { s: null, at: 0, views: new Set(), pill: null };

const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
const save = (patch) => { try { localStorage.setItem(LS, JSON.stringify({ ...load(), ...patch })); } catch {} };
const post = (path, body) => api.fetchApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

// The last poll plus the seconds since it: countdown and cost move every second, the poll corrects them.
function derived() {
  const s = state.s;
  if (!s) return null;
  const dt = (Date.now() - state.at) / 1000;
  const warm = ["warm", "busy", "starting", "stopping"].includes(s.state);
  return {
    ...s,
    idlesIn: s.state === "warm" && s.idles_in != null ? Math.max(0, s.idles_in - dt) : null,
    keepLeft: s.keep_warm_until ? Math.max(0, s.keep_warm_until - Date.now() / 1000) : null,
    sessionSeconds: warm && s.session_seconds ? s.session_seconds + dt : s.session_seconds,
    sessionCost: warm && s.session_seconds ? (s.session_seconds + dt) / 3600 * s.rate_per_hour : s.session_cost,
  };
}

function summary(d) {
  if (!d) return "GPU status unavailable";
  const parts = [`${d.gpu} ${LABEL[d.state] || d.state}`];
  if (d.state === "busy") parts.push(`${d.running} job${d.running === 1 ? "" : "s"}`);
  if (d.idlesIn != null) parts.push(`idles in ${mmss(d.idlesIn)}`);
  if (d.state === "starting") parts.push("booting");
  if (d.keepLeft) parts.push(`kept warm ${mmss(d.keepLeft)}`);
  if (d.sessionSeconds) parts.push(`$${d.sessionCost.toFixed(2)}`);
  return parts.join(" · ");
}

async function poll() {
  try {
    state.s = await (await api.fetchApi("/gpu/status")).json();
    state.at = Date.now();
  } catch { state.s = null; }
  render();
}

function render() {
  const d = derived();
  for (const v of state.views) v(d);
}

const actions = {
  wake: () => post("/gpu/wake").then(poll),
  keep: (minutes) => post("/gpu/keep_warm", { minutes }).then(poll),
  stop: async () => {
    const r = await post("/gpu/stop");
    if (r.status === 409) app.extensionManager?.toast?.add?.({ severity: "warn", summary: "GPU", detail: (await r.json()).error, life: 4000 });
    poll();
  },
};

const BTN = "font:inherit;padding:3px 8px;border-radius:6px;border:1px solid var(--border-color,#555);background:var(--comfy-input-bg,#2a2a2a);color:var(--input-text,#ddd);cursor:pointer";

function controls(compact) {
  const el = document.createElement("span");
  el.style.cssText = "display:inline-flex;gap:6px;align-items:center";
  el.innerHTML = `<button data-a="wake" title="Poke the worker awake now so the first render does not wait">Poke</button>
    <select data-a="keep" title="Ping the worker so it never idles out; billed the whole time">
      <option value="0">${compact ? "Keep awake: off" : "Keep awake: off"}</option><option value="15">15 min</option><option value="30">30 min</option>
      <option value="60">60 min</option><option value="120">2 h</option></select>
    <button data-a="stop" title="Send the worker to sleep now; the next render wakes a fresh one">Sleep</button>`;
  for (const b of el.querySelectorAll("button, select")) b.style.cssText = BTN;
  el.querySelector('[data-a="wake"]').onclick = actions.wake;
  el.querySelector('[data-a="keep"]').onchange = (e) => actions.keep(Number(e.target.value));
  el.querySelector('[data-a="stop"]').onclick = actions.stop;
  el.update = (d) => {
    el.querySelector('[data-a="wake"]').disabled = !d || d.state !== "cold";
    el.querySelector('[data-a="stop"]').disabled = !d || d.state === "cold" || d.state === "busy" || d.state === "starting";
    const keep = el.querySelector('[data-a="keep"]');
    if (d && !d.keepLeft && keep.value !== "0") keep.value = "0";
  };
  return el;
}

// --- pill: draggable, closable, remembered ---------------------------------------------------------------
function mountPill() {
  const prefs = load();
  if (prefs.pill === false) return;
  const pill = document.createElement("div");
  pill.style.cssText = "position:fixed;z-index:1000;display:flex;gap:8px;align-items:center;padding:6px 8px 6px 10px;border-radius:999px;" +
    "background:var(--comfy-menu-bg,rgba(30,30,30,.95));color:var(--fg-color,#ddd);font:12px/1.3 system-ui,sans-serif;" +
    "box-shadow:0 2px 10px rgba(0,0,0,.45);border:1px solid var(--border-color,#444);user-select:none;cursor:grab;max-width:calc(100vw - 24px)";
  const pos = prefs.pos || { left: 12, bottom: 12 };
  Object.assign(pill.style, pos.top != null ? { top: pos.top + "px", left: pos.left + "px" } : { bottom: pos.bottom + "px", left: pos.left + "px" });
  pill.innerHTML = `<span data-dot style="width:9px;height:9px;border-radius:50%;background:#8a8a8a;flex:none"></span><span data-text>GPU …</span>`;
  const ctl = controls(true);
  pill.appendChild(ctl);
  const close = document.createElement("button");
  close.textContent = "×"; close.title = "Hide (reopen from the GPU sidebar tab)";
  close.style.cssText = BTN + ";padding:0 6px;border:none;background:transparent;font-size:16px;line-height:1";
  close.onclick = () => { save({ pill: false }); pill.remove(); state.views.delete(update); state.pill = null; };
  pill.appendChild(close);
  document.body.appendChild(pill);
  state.pill = pill;

  let drag = null;
  pill.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, select")) return;
    const r = pill.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    pill.setPointerCapture(e.pointerId); pill.style.cursor = "grabbing";
  });
  pill.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = pill.getBoundingClientRect();
    const left = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - r.width), top = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - r.height);
    Object.assign(pill.style, { left: left + "px", top: top + "px", bottom: "auto" });
  });
  pill.addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null; pill.style.cursor = "grab";
    save({ pos: { left: parseInt(pill.style.left), top: parseInt(pill.style.top) } });
  });

  const update = (d) => {
    pill.querySelector("[data-dot]").style.background = d ? COLORS[d.state] || "#8a8a8a" : "#8a8a8a";
    pill.querySelector("[data-text]").textContent = summary(d);
    ctl.update(d);
  };
  state.views.add(update);
  update(derived());
}

// --- sidebar tab: the full panel ---------------------------------------------------------------------------
function panel(el) {
  el.style.cssText = "padding:14px;font:13px/1.5 system-ui,sans-serif;color:var(--fg-color,#ddd);display:flex;flex-direction:column;gap:14px";
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px"><span data-dot style="width:12px;height:12px;border-radius:50%;background:#8a8a8a"></span>
      <span data-head style="font-size:16px;font-weight:600">GPU</span></div>
    <table data-rows style="border-collapse:collapse;font-variant-numeric:tabular-nums"></table>
    <div data-ctl></div>
    <label style="display:flex;gap:8px;align-items:center;opacity:.85"><input type="checkbox" data-pill> Show the floating pill (drag it anywhere)</label>
    <div style="opacity:.7;font-size:12px">The worker idles out after the window shown; Keep warm pings it inside that window. Cost is an estimate at the list rate, from this worker's boot.</div>`;
  const ctl = controls(false);
  el.querySelector("[data-ctl]").appendChild(ctl);
  const cb = el.querySelector("[data-pill]");
  cb.checked = load().pill !== false;
  cb.onchange = () => { save({ pill: cb.checked }); if (cb.checked && !state.pill) mountPill(); if (!cb.checked && state.pill) state.pill.querySelector("button:last-child").click(); };
  const row = (k, v) => `<tr><td style="padding:2px 12px 2px 0;opacity:.7">${k}</td><td style="padding:2px 0">${v}</td></tr>`;
  const update = (d) => {
    el.querySelector("[data-dot]").style.background = d ? COLORS[d.state] || "#8a8a8a" : "#8a8a8a";
    el.querySelector("[data-head]").textContent = d ? `${d.gpu} ${LABEL[d.state] || d.state}` : "GPU status unavailable";
    const rows = d ? [
      d.state === "busy" ? row("Running", `${d.running} job${d.running === 1 ? "" : "s"}`) : "",
      d.idlesIn != null ? row("Idles out in", mmss(d.idlesIn)) : "",
      d.state === "starting" ? row("Booting", "about 100 s cold, 30 s when the image is cached") : "",
      row("Idle window", mmss(d.idle_limit)),
      d.keepLeft ? row("Kept warm for", mmss(d.keepLeft)) : "",
      d.sessionSeconds ? row("This worker", `${mmss(d.sessionSeconds)} · $${d.sessionCost.toFixed(2)} at $${d.rate_per_hour}/h`) : "",
    ].join("") : "";
    el.querySelector("[data-rows]").innerHTML = rows;
    ctl.update(d);
  };
  state.views.add(update);
  update(derived());
}

app.registerExtension({
  name: "comfy_modal.gpu_status",
  async setup() {
    const em = app.extensionManager;
    if (em?.registerSidebarTab) {
      em.registerSidebarTab({ id: "comfy_modal_gpu", icon: "pi pi-microchip", title: "GPU", tooltip: "GPU worker: status, keep warm, stop", type: "custom", render: panel });
    }
    mountPill();
    poll();
    setInterval(poll, POLL_MS);
    setInterval(render, 1000);
  },
});
