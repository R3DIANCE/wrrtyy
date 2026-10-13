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

// ---------------- Skills (world version) ----------------
// Warrior + Magician + Bowman (Archer) + Thief (Rogue). Skill IDs are real
// current-GMS skills pulled from maplestory.io's String.wz tables.
export const SKILLS = [
  // Shared beginner
  "0001000", "0001001", "0001002", // Three Snails, Recovery, Nimble Feet
  // Warrior: Beginner -> Warrior -> Fighter -> Crusader
  "1001005", "1001008", "1000003", "1000009",
  "1101011", "1101006", "1100000", "1100009",
  "1111010", "1110000",
  // Magician: Magician -> Wizard (Fire/Poison) -> Mage
  "2001002", "2001003", "2001004", "2001005", // Magic Guard, Magic Armor, Energy Bolt, Magic Claw
  "2101001", "2101002", "2101004", "2101005", // Meditation, Teleport, Flame Orb, Poison Breath
  // Bowman (Archer): Archer -> Hunter -> Ranger
  "3001004", "3001005", "3001007", // Arrow Blow, Double Shot, Double Jump
  "3101003", "3101004", "3101005", "3101008", // Double Jump, Soul Arrow: Bow, Wind Arrow, Covering Fire
  // Thief (Rogue): Rogue -> Assassin -> Hermit
  "4001002", "4001003", "4001005", "4001011", // Disorder, Dark Sight, Haste, Flash Jump
  "4101003", "4101005", "4101008", "4101009", // Claw Booster, Drain, Shuriken Burst, Flash Jump
];
const jobOf = (id: string) => id.slice(0, 3);
async function buildSkills() {
  const out: Record<string, any> = {};
  await Promise.all(SKILLS.map(async (id) => {
    const base = `Skill/${jobOf(id)}.img/skill/${id}`;
    const node = await wz(WORLD_VER, base);
    const kids: string[] = node?.children ?? [];
    const [name, desc, icon, iconMouseOver, iconDisabled] = await Promise.all([
      wz(WORLD_VER, `String/Skill.img/${id}/name`),
      wz(WORLD_VER, `String/Skill.img/${id}/desc`),
      sprite(WORLD_VER, `${base}/icon`),
      sprite(WORLD_VER, `${base}/iconMouseOver`),
      sprite(WORLD_VER, `${base}/iconDisabled`),
    ]);
    const effect = kids.includes("effect") ? await frames(WORLD_VER, `${base}/effect`) : [];
    const effect0 = kids.includes("effect0") ? await frames(WORLD_VER, `${base}/effect0`) : [];
    const hit = kids.includes("hit") ? await frames(WORLD_VER, `${base}/hit/0`) : [];
    out[id] = { id, name: name?.value ?? id, desc: desc?.value ?? "", icon, iconMouseOver, iconDisabled, effect, effect0, hit };
  }));
  out.snailShell = await sprite(WORLD_VER, "Item/Etc/0400.img/04000019/info/iconRaw");
  return out;
}

// ---------------- Windows / balloon (latest UI) ----------------
async function buildWindows() {
  const w: Record<string, any> = {};
  const btn = async (path: string) => {
    const o: Record<string, Sprite | null> = {};
    await Promise.all(["normal", "mouseOver", "pressed", "disabled"].map(async (st) => { o[st] = await sprite(UI_VER, `${path}/${st}/0`); }));
    return o;
  };
  const btnS = async (path: string) => {
    const o: Record<string, Sprite | null> = {};
    for (const st of ["normal", "mouseOver", "pressed", "disabled"]) {
      const s = await sprite(UI_VER, `${path}/${st}`);
      o[st] = s;
    }
    return o;
  };
  const S = "UI/UIWindow4.img/Stat/main/";
  w.stat = {
    backgrnd: await sprite(UI_VER, S + "backgrnd"), backgrnd2: await sprite(UI_VER, S + "backgrnd2"), backgrnd3: await sprite(UI_VER, S + "backgrnd3"),
    BtStrUp: await btn(S + "BtStrUp"), BtDexUp: await btn(S + "BtDexUp"), BtIntUp: await btn(S + "BtIntUp"), BtLukUp: await btn(S + "BtLukUp"),
    BtAuto: await btn(S + "BtAuto"),
  };
  const K = "UI/UIWindow2.img/Skill/main/";
  w.skill = {
    backgrnd: await sprite(UI_VER, K + "backgrnd"), backgrnd2: await sprite(UI_VER, K + "backgrnd2"), backgrnd3: await sprite(UI_VER, K + "backgrnd3"),
    skill0: await sprite(UI_VER, K + "skill0"), skill1: await sprite(UI_VER, K + "skill1"), skillBlank: await sprite(UI_VER, K + "skillBlank"),
    BtSpUp: await btn(K + "BtSpUp"),
  };
  const B = "UI/ChatBalloon.img/0/";
  w.balloon = {};
  await Promise.all(["nw", "n", "ne", "w", "c", "e", "sw", "s", "se", "arrow"].map(async (k) => { w.balloon[k] = await sprite(UI_VER, B + k); }));
  const clr = await wz(UI_VER, B + "clr");
  w.balloon.clr = clr?.value ?? null;
  w.close = await btn("UI/Basic.img/BtClose3");

  // Real MapleStory Equip window background layers (v270)
  const E = "UI/UIWindow2.img/Equip/character/";
  w.equip = {
    backgrnd: await sprite(UI_VER, E + "backgrnd"),
    backgrnd2: await sprite(UI_VER, E + "backgrnd2"),
    backgrnd3: await sprite(UI_VER, E + "backgrnd3"),
  };
  return w;
}

// ---------------- Gear, materials, bosses ----------------
export const BOSSES = [2220000, 3220000, 6130101, 9300003, 8220007, 5220000, 6300005];
// MapleStory-style equipment destination sockets. Rings share a single item pool
// (ring1..ring4 are separate destination sockets for the same item category).
const GEAR_SLOTS: { slot: string; sub: string; job: boolean; pool?: boolean }[] = [
  { slot: "weapon", sub: "One-Handed Sword", job: true },
  { slot: "hat", sub: "Hat", job: true },
  { slot: "top", sub: "Top", job: true },
  { slot: "bottom", sub: "Bottom", job: true },
  { slot: "shoes", sub: "Shoes", job: true },
  { slot: "gloves", sub: "Glove", job: true },
  { slot: "shield", sub: "Shield", job: true },
  { slot: "cape", sub: "Cape", job: false },
  { slot: "earrings", sub: "Earrings", job: false },
  // Modern MapleStory extra slots
  { slot: "pendant", sub: "Pendant", job: false },
  { slot: "ring", sub: "Ring", job: false, pool: true },
  { slot: "shoulder", sub: "Shoulder Accessory", job: false },
  { slot: "belt", sub: "Belt", job: false },
  { slot: "pocket", sub: "Pocket Item", job: false },
  { slot: "emblem", sub: "Emblem", job: false },
  { slot: "badge", sub: "Badge", job: false },
];
const MAT_IDS = [4000001, 4000010, 4000011, 4000012, 4000013, 4000014, 4000015, 4000016, 4000019, 4000040, 4000041, 4000042, 4000043,
  4010000, 4010001, 4010002, 4010003, 4010006, 4011000, 4011001, 4011002, 4020000, 4020007, 4021000, 4021007, 4001832, 4001126];
async function buildItems() {
  const gear: any[] = [];
  for (const g of GEAR_SLOTS) {
    const q = `${API}/GMS/${WORLD_VER}/item?overallCategoryFilter=Equip&subCategoryFilter=${encodeURIComponent(g.sub)}&minLevelFilter=0&maxLevelFilter=70${g.job ? "&jobFilter=1" : ""}&count=400`;
    const list: any[] = (await getJson(q)) ?? [];
    const seen = new Set<string>();
    const cands = list.filter((x) => !x.isCash && x.requiredGender !== 1 && !/cafe|event|anniv|flag|test|\(|quest/i.test(x.name + " " + (x.desc ?? "")))
      .filter((x) => { if (seen.has(x.name)) return false; seen.add(x.name); return true; })
      .sort((a, b) => a.requiredLevel - b.requiredLevel);
    // One item per level bucket keeps a clean progression ladder.
    const buckets = new Map<number, any>();
    for (const c of cands) { const b = Math.floor(c.requiredLevel / 10); if (!buckets.has(b)) buckets.set(b, c); }
    const picks = [...buckets.values()].slice(0, 8);
    const details = await Promise.all(picks.map((c) => getJson(`${API}/GMS/${WORLD_VER}/item/${c.id}`)));
    picks.forEach((c, i) => {
      const m = details[i]?.metaInfo ?? {};
      gear.push({ id: c.id, name: c.name, slot: g.slot, req: m.reqLevel ?? c.requiredLevel ?? 0,
        watk: m.incPAD ?? 0, str: m.incSTR ?? 0, dex: m.incDEX ?? 0, hp: m.incMHP ?? 0, def: m.incPDD ?? 0, price: m.price ?? 100 });
    });
    console.log(g.slot, picks.map((p) => `${p.name}(${p.requiredLevel})`).join(", "));
  }
  const mats: any[] = [];
  for (const id of MAT_IDS) {
    const n = await getJson(`${API}/GMS/${WORLD_VER}/item/${id}/name`);
    if (n?.name) mats.push({ id, name: n.name });
  }
  console.log("mats", mats.map((m) => `${m.id}:${m.name}`).join(", "));
  return { gear, mats };
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
    if (!["stand", "move", "hit1", "die1", "jump", "fly", "attack1", "skill1"].includes(book)) continue;
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

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const want = (k: string) => !only || only.includes(k);
await mkdir(OUT + "maps", { recursive: true });
if (want("skills")) { console.log("skills…"); await writeFile(OUT + "skills.json", JSON.stringify(await buildSkills())); }
if (want("windows")) { console.log("windows…"); await writeFile(OUT + "windows.json", JSON.stringify(await buildWindows())); }
if (want("items")) { console.log("items…"); await writeFile(OUT + "items.json", JSON.stringify(await buildItems())); }
if (want("bosses")) {
  for (const id of BOSSES) { console.log("boss", id); const mob = await buildMob(id); if (mob) await writeFile(`${OUT}mobs/${id}.json`, JSON.stringify(mob)); }
}
if (only && !only.some((k) => ["ui", "fx", "maps"].includes(k))) process.exit(0);
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
