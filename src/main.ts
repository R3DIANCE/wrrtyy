import { json } from "./assets.ts";
import { Game } from "./game.ts";
import { Renderer } from "./gpu.ts";
import { Hud } from "./ui.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const title = document.getElementById("title")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const loading = document.getElementById("loading")!;
const errorBox = document.getElementById("gpu-error")!;
const bgm = new Audio();
bgm.loop = true;
bgm.volume = 0.35;

const r = new Renderer(canvas);
const game = new Game(r);
let hud: Hud | null = null;
let running = false;

const KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Alt", "Control", "Shift", " ", "Delete", "End"]);
addEventListener("keydown", (e: KeyboardEvent) => {
  if (!running) return;
  if (e.key === "Enter") { e.preventDefault(); hud?.chatInput.focus(); return; }
  if (KEYS.has(e.key) || e.key.length === 1) e.preventDefault();
  if (!game.keys.has(e.key)) game.pressed.add(e.key);
  game.keys.add(e.key);
});
addEventListener("keyup", (e: KeyboardEvent) => {
  game.keys.delete(e.key);
  // Shift changes letter case; clear both.
  if (e.key.length === 1) { game.keys.delete(e.key.toLowerCase()); game.keys.delete(e.key.toUpperCase()); }
});
addEventListener("blur", () => game.keys.clear());

function setLoading(t: string | null) {
  loading.textContent = t ?? "";
  loading.classList.toggle("hidden", !t);
}

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
  game.stats.name = (nameInput.value.trim() || "Wayfarer").slice(0, 12);
  startBtn.disabled = true;
  title.classList.add("hidden");
  setLoading("Loading the Maple World…");
  const ui = await json("./data/ui.json");
  game.onMapChange = (m) => {
    hud?.setMap(m);
    const src = m.bgmUrl;
    if (bgm.src !== src) { bgm.src = src; bgm.play().catch(() => {}); }
  };
  game.onChat = (k, t) => hud?.addChat(k, t);
  await game.init(100010000);
  hud = new Hud(ui, game);
  hud.setMap(game.map);
  hud.addChat("system", "Arrows move · Alt/C/Space jump · Ctrl/X attack · Shift/A Slash Blast · Z loot · Up at a portal to travel · 1/2 potions");
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
  if (running) { game.draw(); hud?.update(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global { interface Window { advanceTime: (ms: number) => void; render_game_to_text: () => string; __game: Game } }
window.__game = game;
window.advanceTime = (ms: number) => {
  manual = true;
  const n = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < n; i++) game.update(1 / 60);
  game.draw(); hud?.update();
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
