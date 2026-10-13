import { loadItemData } from "./items.ts";
import { json } from "./assets.ts";
import { Game } from "./game.ts";
import type { ChatKind } from "./game.ts";
import { Renderer } from "./gpu.ts";
import { Hud } from "./ui.ts";
import { CLASSES, QUICK_KEYS, type ClassId } from "./skills.ts";
import { warmCache } from "./item-browser.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const title = document.getElementById("title")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const classSelect = document.getElementById("class-select") as HTMLSelectElement;
const loading = document.getElementById("loading")!;
const errorBox = document.getElementById("gpu-error")!;
const bgm = new Audio();
bgm.loop = true;
bgm.volume = 0.35;

const r = new Renderer(canvas);
const game = new Game(r);
let hud: Hud | null = null;
let running = false;

const SAVE_KEY = "maple-wayfarer-save";
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Alt", " ", "Tab", ...QUICK_KEYS]);

// Populate the class dropdown.
for (const c of CLASSES) {
  const o = document.createElement("option");
  o.value = c.id;
  o.textContent = c.name;
  classSelect.appendChild(o);
}

/** Layout-independent key names: letters lower-case, digits unaffected by Shift. */
function keyName(e: KeyboardEvent): string {
  const c = e.code;
  if (c.startsWith("Key")) return c.slice(3).toLowerCase();
  if (c.startsWith("Digit")) return c.slice(5);
  if (c.startsWith("Numpad") && /\d$/.test(c)) return c.slice(-1);
  const map: Record<string, string> = {
    ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Control", ControlRight: "Control", AltLeft: "Alt", AltRight: "Alt",
    Space: " ", Minus: "-", Equal: "=", Insert: "Insert", Delete: "Delete", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  };
  return map[c] ?? e.key;
}

addEventListener("keydown", (e: KeyboardEvent) => {
  if (!running) return;
  if ((e.target as HTMLElement)?.tagName === "INPUT") return;
  const k = keyName(e);
  if (k === "Enter") { e.preventDefault(); hud?.chatInput.focus(); return; }
  if (k === "Escape") { hud?.wins.closeTop(); return; }
  if (GAME_KEYS.has(k) || k.length === 1) e.preventDefault();
  if (!e.repeat && hud) {
    const w = hud.wins;
    if (k === "s") w.toggle(w.stat);
    else if (k === "k") w.toggle(w.skill);
    else if (k === "i") w.ext.open("inv");
    else if (k === "e") w.ext.open("equip");
    else if (k === "j") w.ext.open("craft");
    else if (k === "h") w.ext.open("ah");
    else if (k === "l") w.ext.items.open();
    else if (k === "b") w.toggleAutoBattle();
  }
  if (!game.keys.has(k)) game.pressed.add(k);
  game.keys.add(k);
});
addEventListener("blur", () => game.keys.clear());
addEventListener("keyup", (e: KeyboardEvent) => { game.keys.delete(keyName(e)); });

function setLoading(t: string | null) {
  loading.textContent = t ?? "";
  loading.classList.toggle("hidden", !t);
}

try {
  const sv = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  if (sv?.stats?.classId) classSelect.value = sv.stats.classId;
  if (sv?.stats?.name) nameInput.value = sv.stats.name;
} catch {}

async function boot() {
  try {
    await r.init();
  } catch (e) {
    errorBox.querySelector(".err-detail")!.textContent = e instanceof Error ? e.message : String(e);
    errorBox.classList.remove("hidden");
    title.classList.add("hidden");
    return;
  }
  startBtn.disabled = false;
  startBtn.textContent = "Start";
}

async function start() {
  if (running || startBtn.disabled) return;
  let saved: any = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); } catch {}
  game.stats.name = (nameInput.value.trim() || "Wayfarer").slice(0, 12);
  startBtn.disabled = true;
  title.classList.add("hidden");
  setLoading("Loading the Maple World…");
  const [ui, win, items] = await Promise.all([json("./data/ui.json"), json("./data/windows.json"), json("./data/items.json")]);
  loadItemData(items);
  game.onMapChange = (m) => {
    hud?.setMap(m);
    const src = m.bgmUrl;
    if (bgm.src !== src) { bgm.src = src; bgm.play().catch(() => {}); }
  };
  game.onChat = (k, t) => {
    const transient = new Set(["exp", "meso", "level", "item", "notice", "system"]);
    if (transient.has(k)) hud?.wins.pushLog(k, t); else hud?.addChat(k, t);
  };
  game.onGain = (k, t) => { hud?.showGain(k, t); hud?.wins.pushLog(k as ChatKind, t); };
  game.onLog = (k, t) => hud?.wins.pushLog(k, t);
  const name = game.stats.name;
  const hasSave = saved?.stats?.name === name;
  if (hasSave) game.restore(saved);
  else game.applyClassDefaults((classSelect.value || "warrior") as ClassId);
  await game.init(hasSave && saved.map ? saved.map : 100010000);
  if (hasSave) game.restore(saved);
  game.stats.name = name;
  hud = new Hud(ui, game, win);
  hud.setMap(game.map);
  hud.addChat("system", "Arrows move · Alt/C/Space jump · Ctrl/X attack · Shift, Ins, Home, PgUp skills · Del/End potions · Z loot · Up at a portal");
  hud.addChat("system", "S stats · K skills · E equipment · I inventory · J crafting · H auction house · L all items · B auto battle · Enter chat. Drag icons onto the quick slots; drag off or right-click to remove.");
  hud.addChat("notice", `Stage ${game.stage.n}: defeat ${game.stageNeed} monsters to summon the stage boss. Bosses drop rare gear and crafting materials.`);
  if (hasSave && saved.savedAt) game.offlineRewards(saved.savedAt);
  game.ah.refresh(Date.now());
  warmCache(); // re-warm the /assets/ cache for icons seen in a previous session
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save())); } catch {} };
  let saveT = 0;
  game.onChange = () => { clearTimeout(saveT); saveT = setTimeout(persist, 800) as unknown as number; };
  setInterval(persist, 10000);
  addEventListener("beforeunload", persist);
  bgm.src = game.map.bgmUrl;
  bgm.play().catch(() => {});
  setLoading(null);
  running = true;
  document.body.classList.add("playing");
}

startBtn.addEventListener("click", start);
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });

let last = performance.now();
let manual = false;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && !manual) game.update(dt);
  if (running) { game.draw(); hud?.update(dt); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global { interface Window { advanceTime: (ms: number) => void; render_game_to_text: () => string; __game: Game } }
window.__game = game;
window.advanceTime = (ms: number) => {
  manual = true;
  const n = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < n; i++) game.update(1 / 60);
  game.draw(); hud?.update(1 / 60);
};
window.render_game_to_text = () => JSON.stringify({
  coords: "MapleStory world px, +y down",
  running, map: game.map?.name, mapId: game.map?.id,
  player: { x: Math.round(game.p.x), y: Math.round(game.p.y), onGround: !!game.p.fh, ladder: !!game.p.ladder, anim: game.p.anim, face: game.p.face },
  stats: game.stats,
  mobs: game.mobs.filter((m) => m.state !== "dead").slice(0, 8).map((m) => ({ name: m.data.name, x: Math.round(m.x), y: Math.round(m.y), hp: m.hp, state: m.state })),
  drops: game.drops.length, portals: game.portals.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), to: p.to })),
});

boot();
