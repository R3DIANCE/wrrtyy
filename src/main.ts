import shaderSrc from "./terrain.wgsl" with { type: "text" };
import {
  BIOME_COLORS, BIOME_NAMES, Biome, LANDMARK_REGION, RELIC_CHUNK, biomeAt, biomeOf, findSpawn, height,
  landmarkInRegion, moisture, relicInChunk, terrainSpeed, type Landmark, type Relic,
} from "./world.ts";

// ---------- DOM ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const titleScreen = $("title");
const startBtn = $<HTMLButtonElement>("start-btn");
const hud = $("hud");
const placeEl = $("place");
const subPlaceEl = $("subplace");
const coordsEl = $("coords");
const relicsEl = $("stat-relics");
const landmarksEl = $("stat-landmarks");
const biomesEl = $("stat-biomes");
const distEl = $("stat-dist");
const clockEl = $("clock");
const toastEl = $("toast");
const seedEl = $("seed");
const mapCanvas = $<HTMLCanvasElement>("minimap");
const mapWrap = $("map-wrap");
const errorEl = $("gpu-error");
const mapCtx = mapCanvas.getContext("2d")!;

// ---------- State ----------
const params = new URLSearchParams(location.search);
const seed = (Number(params.get("seed")) || Math.floor(Math.random() * 1e9)) >>> 0;
const spawn = findSpawn(seed);

const state = {
  mode: "title" as "title" | "playing",
  player: { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: Math.PI / 2, walk: 0 },
  cam: { x: spawn.x, y: spawn.y },
  ppu: 30,
  time: 0,
  dayClock: 0.3, // 0..1, 0.25 = sunrise-ish, 0.5 = noon
  distance: 0,
  collected: new Set<string>(),
  discovered: new Map<string, Landmark>(),
  biomes: new Set<Biome>(),
  explored: new Set<string>(),
  bigMap: false,
};

const DAY_LENGTH = 240; // seconds for a full cycle
const keys = new Set<string>();
let touchVec: { x: number; y: number } | null = null;

seedEl.textContent = `Seed ${seed}`;

// ---------- Input ----------
window.addEventListener("keydown", (e: KeyboardEvent) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === "m" && state.mode === "playing") toggleMap();
  if (k === "f") toggleFullscreen();
  if (k === "enter" && state.mode === "title") start();
});
window.addEventListener("keyup", (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  state.ppu = Math.min(64, Math.max(10, state.ppu * Math.exp(-e.deltaY * 0.0012)));
}, { passive: false });

let touchStart: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  touchStart = { x: e.clientX, y: e.clientY };
  touchVec = { x: 0, y: 0 };
});
canvas.addEventListener("pointermove", (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  const len = Math.hypot(dx, dy);
  touchVec = len < 8 ? { x: 0, y: 0 } : { x: dx / Math.max(len, 60), y: dy / Math.max(len, 60) };
});
const endTouch = () => { touchStart = null; touchVec = null; };
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);
mapWrap.addEventListener("click", () => state.mode === "playing" && toggleMap());

function toggleMap() {
  state.bigMap = !state.bigMap;
  mapWrap.classList.toggle("big", state.bigMap);
}
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } catch { /* blocked in some embeds */ }
}

startBtn.addEventListener("click", start);
function start() {
  if (state.mode === "playing") return;
  state.mode = "playing";
  titleScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  state.cam.x = state.player.x;
  state.cam.y = state.player.y;
  showToast("Your journey begins", "Wander anywhere — the world never ends.");
}

// ---------- Toasts ----------
let toastTimer = 0;
function showToast(title: string, sub: string) {
  toastEl.innerHTML = `<div class="toast-title"></div><div class="toast-sub"></div>`;
  (toastEl.firstChild as HTMLElement).textContent = title;
  (toastEl.lastChild as HTMLElement).textContent = sub;
  toastEl.classList.add("show");
  toastTimer = 3.2;
}

// ---------- Points of interest near the player ----------
function nearbyPois(cx: number, cy: number) {
  const relics: Relic[] = [];
  const marks: Landmark[] = [];
  const R = 40;
  const c0x = Math.floor((cx - R) / RELIC_CHUNK), c1x = Math.floor((cx + R) / RELIC_CHUNK);
  const c0y = Math.floor((cy - R) / RELIC_CHUNK), c1y = Math.floor((cy + R) / RELIC_CHUNK);
  for (let y = c0y; y <= c1y; y++) for (let x = c0x; x <= c1x; x++) {
    const r = relicCache(x, y);
    if (r && !state.collected.has(r.key)) relics.push(r);
  }
  const r0x = Math.floor((cx - R) / LANDMARK_REGION), r1x = Math.floor((cx + R) / LANDMARK_REGION);
  const r0y = Math.floor((cy - R) / LANDMARK_REGION), r1y = Math.floor((cy + R) / LANDMARK_REGION);
  for (let y = r0y; y <= r1y; y++) for (let x = r0x; x <= r1x; x++) {
    const l = landmarkCache(x, y);
    if (l) marks.push(l);
  }
  return { relics, marks };
}

const relicMemo = new Map<string, Relic | null>();
function relicCache(x: number, y: number) {
  const k = `${x},${y}`;
  if (!relicMemo.has(k)) relicMemo.set(k, relicInChunk(x, y, seed));
  return relicMemo.get(k)!;
}
const markMemo = new Map<string, Landmark | null>();
function landmarkCache(x: number, y: number) {
  const k = `${x},${y}`;
  if (!markMemo.has(k)) markMemo.set(k, landmarkInRegion(x, y, seed));
  return markMemo.get(k)!;
}

// ---------- Simulation ----------
function update(dt: number) {
  state.time += dt;
  state.dayClock = (state.dayClock + dt / DAY_LENGTH) % 1;
  const p = state.player;

  if (state.mode === "title") {
    // Drift the camera slowly over the landscape behind the title card.
    state.cam.x += dt * 2.2;
    state.cam.y += dt * 0.8;
    return;
  }

  let ix = 0, iy = 0;
  if (keys.has("w") || keys.has("arrowup")) iy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) iy += 1;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (touchVec) { ix += touchVec.x; iy += touchVec.y; }
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }

  const here = biomeAt(p.x, p.y, seed);
  const sprint = keys.has("shift") ? 1.7 : 1;
  const speed = 6.5 * sprint * Math.max(0.35, terrainSpeed(here));
  const tvx = ix * speed, tvy = iy * speed;
  const accel = 1 - Math.exp(-dt * 12);
  p.vx += (tvx - p.vx) * accel;
  p.vy += (tvy - p.vy) * accel;

  // Axis-separated movement so the player slides along coastlines.
  const tryMove = (nx: number, ny: number) => terrainSpeed(biomeAt(nx, ny, seed)) > 0;
  const ox = p.x, oy = p.y;
  const nx = p.x + p.vx * dt;
  if (tryMove(nx, p.y)) p.x = nx; else p.vx = 0;
  const ny = p.y + p.vy * dt;
  if (tryMove(p.x, ny)) p.y = ny; else p.vy = 0;
  const moved = Math.hypot(p.x - ox, p.y - oy);
  state.distance += moved;
  if (Math.hypot(p.vx, p.vy) > 0.3) {
    const target = Math.atan2(p.vy, p.vx);
    let d = target - p.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.facing += d * (1 - Math.exp(-dt * 14));
    p.walk += moved * 0.6;
  }

  // Camera follows with a little lag.
  const ca = 1 - Math.exp(-dt * 5);
  state.cam.x += (p.x - state.cam.x) * ca;
  state.cam.y += (p.y - state.cam.y) * ca;

  // Biomes.
  const nowBiome = biomeAt(p.x, p.y, seed);
  if (!state.biomes.has(nowBiome)) {
    state.biomes.add(nowBiome);
    if (state.biomes.size > 1) showToast("New land", BIOME_NAMES[nowBiome]);
  }

  // Pickups & discoveries.
  const { relics, marks } = nearbyPois(p.x, p.y);
  for (const r of relics) {
    if (Math.hypot(r.x - p.x, r.y - p.y) < 1.1) {
      state.collected.add(r.key);
      showToast("Relic recovered", `${state.collected.size} shard${state.collected.size === 1 ? "" : "s"} gathered`);
      chime(880);
    }
  }
  for (const l of marks) {
    if (!state.discovered.has(l.key) && Math.hypot(l.x - p.x, l.y - p.y) < 3.2) {
      state.discovered.set(l.key, l);
      showToast("Landmark discovered", l.name);
      chime(523);
    }
  }

  revealAround(p.x, p.y);

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastEl.classList.remove("show");
  }
}

// ---------- Simple audio chime ----------
let audio: AudioContext | null = null;
function chime(freq: number) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [mult, delay] of [[1, 0], [1.5, 0.09], [2, 0.18]] as const) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.08, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.9);
      o.connect(g).connect(audio.destination);
      o.start(t + delay);
      o.stop(t + delay + 1);
    }
  } catch { /* audio unavailable */ }
}

// ---------- Fog-of-war minimap ----------
const MAP_CHUNK = 16;      // world units per tile
const TILE_PX = 8;         // pixels per tile (1px = 2 world units)
const tiles = new Map<string, HTMLCanvasElement>();
const pendingTiles: [number, number][] = [];

function revealAround(x: number, y: number) {
  const R = 40;
  const c0x = Math.floor((x - R) / MAP_CHUNK), c1x = Math.floor((x + R) / MAP_CHUNK);
  const c0y = Math.floor((y - R) / MAP_CHUNK), c1y = Math.floor((y + R) / MAP_CHUNK);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const k = `${cx},${cy}`;
    if (!state.explored.has(k)) {
      state.explored.add(k);
      pendingTiles.push([cx, cy]);
    }
  }
}

function buildTile(cx: number, cy: number) {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(TILE_PX, TILE_PX);
  const step = MAP_CHUNK / TILE_PX;
  for (let py = 0; py < TILE_PX; py++) for (let px = 0; px < TILE_PX; px++) {
    const wx = cx * MAP_CHUNK + (px + 0.5) * step, wy = cy * MAP_CHUNK + (py + 0.5) * step;
    const h = height(wx, wy, seed);
    const b = biomeOf(h, moisture(wx, wy, seed));
    const hx = height(wx + 1, wy, seed);
    const shade = 1 + (h - hx) * 14;
    const [r, g, bl] = BIOME_COLORS[b];
    const i = (py * TILE_PX + px) * 4;
    img.data[i] = Math.min(255, r * shade);
    img.data[i + 1] = Math.min(255, g * shade);
    img.data[i + 2] = Math.min(255, bl * shade);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tiles.set(`${cx},${cy}`, c);
}

function drawMap() {
  // Build a few tiles per frame to avoid hitches.
  for (let i = 0; i < 24 && pendingTiles.length; i++) {
    const [x, y] = pendingTiles.shift()!;
    buildTile(x, y);
  }
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cssW = mapCanvas.clientWidth, cssH = mapCanvas.clientHeight;
  if (mapCanvas.width !== Math.round(cssW * dpr) || mapCanvas.height !== Math.round(cssH * dpr)) {
    mapCanvas.width = Math.round(cssW * dpr);
    mapCanvas.height = Math.round(cssH * dpr);
  }
  const W = mapCanvas.width, H = mapCanvas.height;
  const ctx = mapCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1a1712";
  ctx.fillRect(0, 0, W, H);
  // pixels per world unit on the map
  const scale = (state.bigMap ? 0.5 : 0.6) * dpr;
  const px = state.player.x, py = state.player.y;
  const tilePx = MAP_CHUNK * scale;
  const halfWu = W / 2 / scale, halfHu = H / 2 / scale;
  ctx.imageSmoothingEnabled = true;
  const c0x = Math.floor((px - halfWu) / MAP_CHUNK), c1x = Math.floor((px + halfWu) / MAP_CHUNK);
  const c0y = Math.floor((py - halfHu) / MAP_CHUNK), c1y = Math.floor((py + halfHu) / MAP_CHUNK);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const t = tiles.get(`${cx},${cy}`);
    if (!t) continue;
    const sx = W / 2 + (cx * MAP_CHUNK - px) * scale;
    const sy = H / 2 + (cy * MAP_CHUNK - py) * scale;
    ctx.drawImage(t, Math.floor(sx), Math.floor(sy), Math.ceil(tilePx) + 1, Math.ceil(tilePx) + 1);
  }
  // Landmarks.
  ctx.font = `${11 * dpr}px Satoshi, sans-serif`;
  ctx.textAlign = "center";
  for (const l of state.discovered.values()) {
    const sx = W / 2 + (l.x - px) * scale, sy = H / 2 + (l.y - py) * scale;
    if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
    ctx.fillStyle = "#f2b45a";
    ctx.beginPath();
    ctx.moveTo(sx, sy - 5 * dpr); ctx.lineTo(sx + 4 * dpr, sy); ctx.lineTo(sx, sy + 5 * dpr); ctx.lineTo(sx - 4 * dpr, sy);
    ctx.fill();
    if (state.bigMap) {
      ctx.fillStyle = "rgba(20,16,12,0.85)";
      ctx.fillText(l.name, sx + 1, sy - 9 * dpr + 1);
      ctx.fillStyle = "#f6ead2";
      ctx.fillText(l.name, sx, sy - 9 * dpr);
    }
  }
  // Player arrow.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(state.player.facing);
  ctx.fillStyle = "#fff4dc";
  ctx.strokeStyle = "#7a2a1e";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(7 * dpr, 0); ctx.lineTo(-5 * dpr, 5 * dpr); ctx.lineTo(-2 * dpr, 0); ctx.lineTo(-5 * dpr, -5 * dpr);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------- HUD ----------
let lastHud = 0;
function updateHud() {
  if (state.mode !== "playing") return;
  if (state.time - lastHud < 0.1) return;
  lastHud = state.time;
  const p = state.player;
  const b = biomeAt(p.x, p.y, seed);
  let nearest: Landmark | null = null, nd = Infinity;
  for (const l of state.discovered.values()) {
    const d = Math.hypot(l.x - p.x, l.y - p.y);
    if (d < nd) { nd = d; nearest = l; }
  }
  placeEl.textContent = BIOME_NAMES[b];
  subPlaceEl.textContent = nearest && nd < 60 ? `near ${nearest.name}` : "uncharted";
  coordsEl.textContent = `${Math.round(p.x)}, ${Math.round(-p.y)}`;
  relicsEl.textContent = String(state.collected.size);
  landmarksEl.textContent = String(state.discovered.size);
  biomesEl.textContent = `${state.biomes.size}/9`;
  distEl.textContent = state.distance >= 1000 ? `${(state.distance / 1000).toFixed(2)} km` : `${Math.round(state.distance)} m`;
  const hours = (state.dayClock * 24 + 0) % 24;
  const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
  const phase = hours < 5 || hours >= 20.5 ? "Night" : hours < 7.5 ? "Dawn" : hours < 17.5 ? "Day" : "Dusk";
  clockEl.textContent = `${phase} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function daylight() {
  // dayClock 0 = midnight, 0.5 = noon.
  const s = Math.sin((state.dayClock - 0.25) * Math.PI * 2); // -1..1
  const day = Math.min(1, Math.max(0, s * 1.6 + 0.35));
  const dusk = Math.max(0, 1 - Math.abs(s) * 3.5) * 0.9;
  return { day, dusk };
}

// ---------- WebGPU ----------
const UNIFORM_SIZE = 64 + 48 * 16;
const uniformBuf = new ArrayBuffer(UNIFORM_SIZE);
const uf = new Float32Array(uniformBuf);
const ui = new Int32Array(uniformBuf);
const uu = new Uint32Array(uniformBuf);

let gpu: { device: GPUDevice; ctx: GPUCanvasContext; pipeline: GPURenderPipeline; ubo: GPUBuffer; bind: GPUBindGroup } | null = null;

async function initGpu() {
  if (!("gpu" in navigator)) throw new Error("This browser does not expose WebGPU (navigator.gpu is missing).");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter was found on this device.");
  const device = await adapter.requestDevice();
  device.lost.then((info) => showGpuError(`The GPU device was lost: ${info.message}`));
  const ctx = canvas.getContext("webgpu") as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: shaderSrc });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === "error");
  if (errs.length) throw new Error("Shader error: " + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("\n"));
  const pipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const ubo = device.createBuffer({ size: UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
  gpu = { device, ctx, pipeline, ubo, bind };
}

function showGpuError(msg: string) {
  errorEl.querySelector(".err-detail")!.textContent = msg;
  errorEl.classList.remove("hidden");
  titleScreen.classList.add("hidden");
}

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

function render() {
  if (!gpu) return;
  const dpr = resize();
  const camIx = Math.floor(state.cam.x), camIy = Math.floor(state.cam.y);
  const { day, dusk } = daylight();
  ui[0] = camIx; ui[1] = camIy;
  uf[2] = state.cam.x - camIx; uf[3] = state.cam.y - camIy;
  uf[4] = canvas.width; uf[5] = canvas.height;
  uf[6] = state.ppu * dpr;
  uf[7] = state.time % 3600;
  uf[8] = day;
  uu[9] = seed;
  const { relics, marks } = nearbyPois(state.cam.x, state.cam.y);
  let n = 0;
  for (const l of marks) {
    if (n >= 48) break;
    const o = 16 + n * 4;
    uf[o] = l.x - state.cam.x; uf[o + 1] = l.y - state.cam.y; uf[o + 2] = 1; uf[o + 3] = state.discovered.has(l.key) ? 1 : 0;
    n++;
  }
  for (const r of relics) {
    if (n >= 48) break;
    const o = 16 + n * 4;
    uf[o] = r.x - state.cam.x; uf[o + 1] = r.y - state.cam.y; uf[o + 2] = 0; uf[o + 3] = (r.x * 0.137 + r.y * 0.311) % 1;
    n++;
  }
  uu[10] = n;
  uf[11] = state.player.facing;
  const showPlayer = state.mode === "playing";
  uf[12] = showPlayer ? state.player.x - state.cam.x : 9999;
  uf[13] = showPlayer ? state.player.y - state.cam.y : 9999;
  uf[14] = state.player.walk;
  uf[15] = dusk;
  gpu.device.queue.writeBuffer(gpu.ubo, 0, uniformBuf);

  const enc = gpu.device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: gpu.ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  });
  pass.setPipeline(gpu.pipeline);
  pass.setBindGroup(0, gpu.bind);
  pass.draw(3);
  pass.end();
  gpu.device.queue.submit([enc.finish()]);

  if (state.mode === "playing") { drawMap(); updateHud(); }
}

// ---------- Loop & test hooks ----------
let last = performance.now();
let manualTime = false;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manualTime) update(dt);
  render();
  requestAnimationFrame(frame);
}

declare global {
  interface Window { advanceTime: (ms: number) => void; render_game_to_text: () => string }
}
window.advanceTime = (ms: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(1 / 60);
  render();
};
window.render_game_to_text = () => {
  const p = state.player;
  const { relics, marks } = nearbyPois(p.x, p.y);
  return JSON.stringify({
    note: "World units; +x east, +y south (screen down). Origin = world origin.",
    mode: state.mode,
    seed,
    player: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), biome: BIOME_NAMES[biomeAt(p.x, p.y, seed)] },
    nearbyRelics: relics.slice(0, 6).map((r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1) })),
    nearbyLandmarks: marks.map((l) => ({ name: l.name, x: +l.x.toFixed(1), y: +l.y.toFixed(1), found: state.discovered.has(l.key) })),
    relicsCollected: state.collected.size,
    landmarksFound: state.discovered.size,
    biomesSeen: state.biomes.size,
    distance: Math.round(state.distance),
    dayClock: +state.dayClock.toFixed(3),
    zoom: +state.ppu.toFixed(1),
    bigMap: state.bigMap,
  });
};

initGpu()
  .then(() => {
    state.biomes.add(biomeAt(state.player.x, state.player.y, seed));
    revealAround(state.player.x, state.player.y);
    document.body.classList.add("ready");
    requestAnimationFrame(frame);
  })
  .catch((e) => showGpuError(e instanceof Error ? e.message : String(e)));
