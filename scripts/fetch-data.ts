#!/usr/bin/env bun
/**
 * Builds the game's metadata (footholds, sprite origins, frame delays, URLs) from the
 * maplestory.io API. No images are stored: the game hotlinks every sprite at runtime.
 *
 *   bun run fetch-data
 *
 * Output: public/data/*.json
 */
import { mkdir, writeFile } from "node:fs/promises";

const API = "https://maplestory.io/api";
const UI_VER = "270"; // latest GMS UI (StatusBar3)
const WORLD_VER = "240"; // newest version whose maps/mobs render fully on maplestory.io
export const MAPS = [100010000, 100020000, 101010000];
const OUT = new URL("../public/data/", import.meta.url).pathname;

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36" };
let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 8) await new Promise<void>((r) => queue.push(r));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
async function getJson(url: string): Promise<any> {
  return limited(async () => {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url, { headers: UA });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`${r.status}`);
        return await r.json();
      } catch (e) {
        if (i === 3) { console.warn("failed", url, e); return null; }
        await Bun.sleep(800 * (i + 1));
      }
    }
  });
}
const wz = (ver: string, path: string) => getJson(`${API}/wz/GMS/${ver}/${enc(path)}`);

function pngSize(b64: string): [number, number] {
  const raw = Buffer.from(b64.slice(0, 64), "base64");
  return [raw.readUInt32BE(16), raw.readUInt32BE(20)];
}

export interface Sprite { url: string; w: number; h: number; ox: number; oy: number; delay?: number; z?: number }

/** Resolve a canvas node to a hotlinkable PNG URL plus size and origin. */
async function sprite(ver: string, path: string, urlOverride?: string): Promise<Sprite | null> {
  const node = await wz(ver, path);
  if (!node || node.type !== 12 || !node.value) return null;
  const kids: string[] = node.children ?? [];
  const [w, h] = pngSize(node.value);
  const [origin, delay, outlink] = await Promise.all([
    kids.includes("origin") ? wz(ver, path + "/origin") : null,
    kids.includes("delay") ? wz(ver, path + "/delay") : null,
    kids.includes("_outlink") ? wz(ver, path + "/_outlink") : null,
  ]);
  const imgPath = outlink?.value ?? path;
  const s: Sprite = {
    url: urlOverride ?? `${API}/wz/img/GMS/${ver}/${enc(imgPath)}`,
    w, h, ox: origin?.value?.x ?? 0, oy: origin?.value?.y ?? 0,
  };
  if (delay?.value != null) s.delay = Number(delay.value);
  return s;
}

async function frames(ver: string, dir: string, max = 40): Promise<Sprite[]> {
  const node = await wz(ver, dir);
  if (!node) return [];
  const ids = (node.children as string[]).filter((c) => /^\d+$/.test(c)).map(Number).sort((a, b) => a - b).slice(0, max);
  const out = await Promise.all(ids.map((i) => sprite(ver, `${dir}/${i}`)));
  return out.filter(Boolean) as Sprite[];
}

// ---------------- UI (latest) ----------------
async function buildUi() {
  const M = "UI/StatusBar3.img/mainBar/";
  const single: Record<string, string> = {
    statusBack: M + "status/backgrnd",
    hpGauge: M + "status/gauge/hp/layer:0",
    mpGauge: M + "status/gauge/mp/layer:0",
    statusCover: M + "status/layer:cover",
    lvLabel: M + "status/layer:Lv",
    expBack: M + "EXPBar/1920/layer:back",
    expGauge: M + "EXPBar/1920/layer:gauge",
    expCover: M + "EXPBar/1920/layer:cover",
    quickBack: M + "quickSlot/backgrnd",
    quickCover: M + "quickSlot/layer:cover",
    quickFold: M + "quickSlot/button:Fold/normal/0",
  };
  const ui: Record<string, any> = {};
  await Promise.all(Object.entries(single).map(async ([k, p]) => { ui[k] = await sprite(UI_VER, p); }));
  const digits = async (dir: string, extra: string[] = []) => {
    const o: Record<string, Sprite | null> = {};
    await Promise.all([..."0123456789", ...extra].map(async (c) => { o[c] = await sprite(UI_VER, `${dir}/${c}`); }));
    return o;
  };
  ui.lvNumber = await digits(M + "status/lvNumber");
  ui.gaugeNumber = await digits(M + "status/gauge/number");
  ui.expNumber = await digits(M + "EXPBar/number", ["%", "[", "]"]);
  ui.menu = {};
  for (const b of ["CashShop", "Event", "Character", "Community", "Setting", "Menu"]) {
    ui.menu[b] = {};
    for (const st of ["normal", "mouseOver", "pressed"]) ui.menu[b][st] = await sprite(UI_VER, `${M}menu/button:${b}/${st}/0`);
  }
  const nine = async (dir: string, parts = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"]) => {
    const o: Record<string, Sprite | null> = {};
    await Promise.all(parts.map(async (p) => { o[p] = await sprite(UI_VER, `${dir}/${p}`); }));
    return o;
  };
  ui.minimap = await nine("UI/UIWindow2.img/MiniMap/MaxMap");
  ui.chatView = await nine("UI/StatusBar3.img/chat/ingame/view/backgrnd");
  ui.chatInput = await nine("UI/StatusBar3.img/chat/ingame/input/backgrnd", ["w", "c", "e"]);
  return ui;
}

// ---------------- Effects ----------------
async function buildFx() {
  const fx: Record<string, any> = {};
  const digitSet = async (dir: string) => {
    const o: Record<string, Sprite | null> = {};
    await Promise.all([..."0123456789"].map(async (c) => { o[c] = await sprite(WORLD_VER, `${dir}/${c}`); }));
    return o;
  };
  fx.dmgFirst = await digitSet("Effect/BasicEff.img/NoRed0");
  fx.dmg = await digitSet("Effect/BasicEff.img/NoRed1");
  fx.miss = await sprite(WORLD_VER, "Effect/BasicEff.img/NoRed0/Miss");
  fx.hurtFirst = await digitSet("Effect/BasicEff.img/NoViolet0");
  fx.hurt = await digitSet("Effect/BasicEff.img/NoViolet1");
  fx.levelUp = await frames(WORLD_VER, "Effect/BasicEff.img/LevelUp");
  fx.slashBlast = await frames(WORLD_VER, "Skill/100.img/skill/1001005/effect");
  fx.slashHit = await frames(WORLD_VER, "Skill/100.img/skill/1001005/hit/0");
  fx.slashIcon = await sprite(WORLD_VER, "Skill/100.img/skill/1001005/icon");
  fx.meso = await frames(WORLD_VER, "Item/Special/0900.img/09000000/iconRaw");
  fx.portal = await frames(WORLD_VER, "Map/MapHelper.img/portal/game/pv/default");
  return fx;
}

// ---------------- Mobs ----------------
async function buildMob(id: number) {
  const info = await getJson(`${API}/GMS/${WORLD_VER}/mob/${id}`);
  if (!info) return null;
  const id7 = String(id).padStart(7, "0");
  const linkNode = await wz(WORLD_VER, `Mob/${id7}.img/info/link`);
  const src = linkNode?.value ? String(linkNode.value).padStart(7, "0") : id7;
  const books: Record<string, Sprite[]> = {};
  for (const [book, count] of Object.entries(info.framebooks as Record<string, number>)) {
    if (!["stand", "move", "hit1", "die1", "jump", "fly"].includes(book)) continue;
    const list = await Promise.all(
      Array.from({ length: Math.min(count, 24) }, (_, i) =>
        sprite(WORLD_VER, `Mob/${src}.img/${book}/${i}`, `${API}/GMS/${WORLD_VER}/mob/${id}/render/${book}/${i}`)),
    );
    books[book] = list.filter(Boolean) as Sprite[];
  }
  return { id, name: info.name, meta: info.meta, books };
}

// ---------------- Maps ----------------
async function buildMap(id: number) {
  const d = await getJson(`${API}/GMS/${WORLD_VER}/map/${id}`);
  if (!d) throw new Error("map " + id);
  const id9 = String(id).padStart(9, "0");
  const mapPath = `Map/Map/Map${id9[0]}/${id9}.img`;
  const backDir = await wz(WORLD_VER, `${mapPath}/back`);
  const backs: any[] = [];
  for (const i of ((backDir?.children ?? []) as string[]).map(Number).sort((a, b) => a - b)) {
    const props = ["bS", "no", "x", "y", "rx", "ry", "cx", "cy", "type", "a", "f", "front", "ani"];
    const vals = await Promise.all(props.map((p) => wz(WORLD_VER, `${mapPath}/back/${i}/${p}`)));
    const b: Record<string, any> = {};
    props.forEach((p, k) => { b[p] = vals[k]?.value ?? 0; });
    if (!b.bS) continue;
    const s = b.ani
      ? (await frames(WORLD_VER, `Map/Back/${b.bS}.img/ani/${b.no}`, 1))[0]
      : await sprite(WORLD_VER, `Map/Back/${b.bS}.img/back/${b.no}`);
    if (!s) continue;
    backs.push({
      sprite: s, x: +b.x, y: +b.y, rx: +b.rx, ry: +b.ry, cx: +b.cx, cy: +b.cy,
      type: +b.type, a: b.a === 0 ? 255 : +b.a, flip: !!+b.f, front: !!+b.front,
    });
  }
  const fhs = Object.values(d.footholds as Record<string, any>).map((f) => ({
    id: f.id, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, prev: f.prev, next: f.next, layer: f.layerId, group: f.groupId,
  }));
  return {
    id, name: d.name, street: d.streetName, bgm: d.backgroundMusic,
    render: `${API}/GMS/${WORLD_VER}/map/${id}/render`,
    renderOrigin: { x: d.miniMap.centerX, y: d.miniMap.centerY },
    miniMap: {
      url: `${API}/GMS/${WORLD_VER}/map/${id}/minimap`,
      centerX: d.miniMap.centerX, centerY: d.miniMap.centerY,
      width: d.miniMap.width, height: d.miniMap.height, mag: d.miniMap.magnification,
    },
    bgmUrl: `${API}/GMS/${WORLD_VER}/map/${id}/bgm`,
    mark: `${API}/GMS/${WORLD_VER}/map/${id}/icon`,
    footholds: fhs,
    ladders: d.ladderRopes ?? [],
    spawns: (d.mobs ?? []).filter((m: any) => m && !m.hidden).map((m: any) => ({
      id: m.id, x: m.x, y: m.y, fh: m.footholdId, rx0: m.walkAreaX1, rx1: m.walkAreaX2,
    })),
    backs,
  };
}

await mkdir(OUT + "maps", { recursive: true });
await mkdir(OUT + "mobs", { recursive: true });
console.log("UI…");
await writeFile(OUT + "ui.json", JSON.stringify(await buildUi()));
console.log("FX…");
await writeFile(OUT + "fx.json", JSON.stringify(await buildFx()));
const mobIds = new Set<number>();
for (const id of MAPS) {
  console.log("map", id);
  const m = await buildMap(id);
  m.spawns.forEach((s: any) => mobIds.add(s.id));
  await writeFile(`${OUT}maps/${id}.json`, JSON.stringify(m));
}
for (const id of mobIds) {
  console.log("mob", id);
  const mob = await buildMob(id);
  if (mob) await writeFile(`${OUT}mobs/${id}.json`, JSON.stringify(mob));
}
console.log("done");
