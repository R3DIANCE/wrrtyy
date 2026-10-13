import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";
import { AH_TAX, AuctionHouse, goodsName, type Goods } from "./auction.ts";
import {
  GEAR, MATS, MOB_MAT, ORES, cubeCost, gearStats, makeGear, randomGearFor, rollPotential, recipeGearId, starCost, starMat, starRate,
  npcSellPrice, type Gear, type Recipe, type Slot, RARITY,
} from "./items.ts";
import { DEFAULT_QUICK, ITEMS, SKILL, SKILL_DEFS, classFor, type ClassId, itemIconRaw, type Action, type SkillArt, type SkillDef } from "./skills.ts";

// ---------------------------------------------------------------- data types
interface Back { sprite: Sprite; x: number; y: number; rx: number; ry: number; cx: number; cy: number; type: number; a: number; flip: boolean; front: boolean }
export interface MapData {
  id: number; name: string; street: string; bgm: string; bgmUrl: string; mark: string;
  render: string; renderOrigin: { x: number; y: number };
  miniMap: { url: string; centerX: number; centerY: number; width: number; height: number; mag: number };
  footholds: Foothold[]; ladders: Ladder[];
  spawns: { id: number; x: number; y: number; fh: number; rx0: number; rx1: number }[];
  backs: Back[];
}
interface MobData { id: number; name: string; meta: any; books: Record<string, Sprite[]> }

// World links (the API's portal data is incomplete, so maps are chained edge to edge).
export const MAP_LINKS: Record<number, { left: number; right: number }> = {
  100010000: { left: 101010000, right: 100020000 },
  100020000: { left: 100010000, right: 101010000 },
  101010000: { left: 100020000, right: 100010000 },
};

const BODY = [2000, 12000, 20000, 30030];
export const lookKey = (ids: number[]) => encodeURIComponent([...BODY, ...ids].map((i) => JSON.stringify({ itemId: i, region: "GMS", version: "240" })).join(","));
export const charUrlFor = (key: string, anim: string, f: number) => `https://maplestory.io/api/character/${key}/${anim}/${f}?renderMode=4`;
export const BOSSES = [2220000, 3220000, 6130101, 9300003, 8220007, 5220000, 6300005];
const STAGE_KILLS = 25;
const ANIMS: Record<string, number[]> = {
  stand1: [500, 500, 500], walk1: [180, 180, 180, 180], alert: [500, 500, 500], jump: [200],
  prone: [200], ladder: [250, 250], rope: [250, 250], swingO1: [300, 150, 350], swingO2: [300, 150, 350],
};

export const EXP_TABLE = [15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716, 2360, 3216, 4200, 5460, 7050, 8840, 11040, 13716, 16680, 20216, 24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700];
export const expToLevel = (lv: number) => EXP_TABLE[Math.min(lv - 1, EXP_TABLE.length - 1)] * (lv > EXP_TABLE.length ? 1 + (lv - EXP_TABLE.length) * 0.15 : 1);

const WALK = 125, JUMP = 555, CLIMB = 100;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- entities
interface Mob {
  data: MobData; spawn: MapData["spawns"][number];
  x: number; y: number; vx: number; vy: number; fh: Foothold | null; ignoreFh?: number;
  dir: -1 | 1; state: "stand" | "move" | "hit1" | "die1" | "dead";
  t: number; anim: number; frame: number; hp: number; maxHp: number;
  aggro: number; hpShow: number; respawn: number; alpha: number;
  mul: { exp: number; meso: number }; atk: number; boss?: boolean; skillT?: number; attacking?: string;
}
interface Drop { x: number; y: number; vx: number; vy: number; fh: Foothold | null; amount: number; item?: number; mat?: number; gear?: Gear; t: number; picked: number; ignoreFh?: number }
interface Projectile { x: number; y: number; target: Mob; dmg: number; miss: boolean; t: number; skillId?: string }
interface Fx { frames: Sprite[]; x: number; y: number; flip: boolean; t: number; follow?: boolean }
interface DmgText { value: number; miss: boolean; hurt: boolean; x: number; y: number; t: number }
interface Portal { x: number; y: number; to: number; side: "left" | "right" }

export interface Stats {
  name: string; level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number; meso: number; job: string; classId: ClassId;
  str: number; dex: number; int: number; luk: number; ap: number; sp: number; baseHp: number; baseMp: number; fame: number;
}
export interface AutoSettings { battle: boolean; hp: boolean; hpPct: number; mp: boolean; mpPct: number; buff: boolean; loot: boolean; ap: boolean; boss: boolean; magnet: boolean }

export type ChatKind = "system" | "exp" | "meso" | "level" | "notice" | "say" | "item";

export class Game {
  assets: Assets;
  map!: MapData;
  tree!: FootholdTree;
  mobs: Mob[] = [];
  mobData = new Map<number, MobData>();
  drops: Drop[] = [];
  fx: Fx[] = [];
  dmg: DmgText[] = [];
  portals: Portal[] = [];
  fxData: any;
  bounds = { l: 0, r: 0, t: 0, b: 0 };
  cam = { x: 0, y: 0 };
  time = 0;
  loadingMap = false;
  fade = 1;
  onChat: (kind: ChatKind, text: string) => void = () => {};
  onLog: (kind: ChatKind, text: string) => void = () => {};
  onGain: (kind: "level" | "meso" | "exp", text: string) => void = () => {};
  onMapChange: (m: MapData) => void = () => {};

  stats: Stats = {
    name: "Wayfarer", level: 1, exp: 0, hp: 50, maxHp: 50, mp: 30, maxMp: 30, meso: 0, job: "Warrior", classId: "warrior",
    str: 12, dex: 5, int: 4, luk: 4, ap: 0, sp: 2, baseHp: 50, baseMp: 30, fame: 0,
  };
  get class() { return classFor(this.stats.classId); }
  inv: Record<number, number> = { 2000000: 30, 2000001: 10, 2000002: 5, 2000003: 30, 2000006: 5 };
  mats: Record<number, number> = { 4010000: 10, 4000001: 10 };
  bag: Gear[] = [];
  eq: Partial<Record<Slot, Gear>> = {};
  look = lookKey([1040002, 1060002, 1072001, 1302000]);
  lookWant = "";
  prevLook = "";
  gt = { watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, att: 0, strP: 0, dexP: 0, intP: 0, lukP: 0, hpP: 0, boss: 0, meso: 0, drop: 0, exp: 0 };
  stage = { n: 1, kills: 0, best: 1 };
  boss: Mob | null = null;
  bossTimer = 0;
  bossLoading = false;
  idle = { autoTime: 0, autoKills: 0, killRate: 0.06, expPerKill: 15, mesoPerKill: 12 };
  ah = new AuctionHouse(() => this.stats.level);
  onOffline: (r: { seconds: number; kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }) => void = () => {};
  onBoss: (m: Mob | null) => void = () => {};
  skillLv: Record<string, number> = { "1001005": 1, "0001000": 1 };
  skillArt: Record<string, SkillArt> = {};
  snailShell: Sprite | null = null;
  buffs: Record<string, { left: number; dur: number }> = {};
  quick: Record<string, Action | null> = { ...DEFAULT_QUICK };
  auto: AutoSettings = { battle: false, hp: true, hpPct: 50, mp: true, mpPct: 30, buff: true, loot: true, ap: true, boss: true, magnet: true };
  balloon = { text: "", t: 0 };
  projectiles: Projectile[] = [];
  potCd = 0;
  ahT = 0;
  timers = { regen: 0, recovery: 0, self: 0 };
  onChange: () => void = () => {};
  ai = { keys: new Set<string>(), pressed: new Set<string>(), target: null as Mob | null, think: 0, stuck: 0, lastX: 0, hold: 0, ban: new Map<Mob, number>() };

  p = {
    x: 0, y: 0, vx: 0, vy: 0, fh: null as Foothold | null, ignoreFh: undefined as number | undefined,
    face: -1 as -1 | 1, anim: "stand1", frame: 0, ft: 0,
    ladder: null as Ladder | null, attack: 0, attackAnim: "swingO1", hitDone: false, skill: null as string | null,
    invuln: 0, prone: false, alert: 0, regen: 0, dead: false, leapt: false,
  };

  keys = new Set<string>();
  pressed = new Set<string>();

  constructor(public r: Renderer) {
    this.assets = new Assets(r);
  }

  async init(startMap: number) {
    this.fxData = await json("./data/fx.json");
    const sk = await json<Record<string, any>>("./data/skills.json");
    this.snailShell = sk.snailShell ?? null;
    for (const d of SKILL_DEFS) if (sk[d.id]) this.skillArt[d.id] = sk[d.id];
    this.recalc();
    // Warm up character frames (rendered server-side, so they can be slow the first time).
    const loads: Promise<unknown>[] = [];
    if (!Object.keys(this.eq).length) {
      const c = this.class;
      for (const id of [c.startingGear.weapon, c.startingGear.top, c.startingGear.bottom, c.startingGear.shoes]) {
        const b = GEAR.get(id);
        if (b) {
          const sockets = this.socketsFor(b.slot);
          this.eq[sockets[0]] = makeGear(id, -10);
        }
      }
    }
    this.recalc();
    this.look = this.computeLook();
    for (const [a, fr] of Object.entries(ANIMS)) fr.forEach((_, i) => loads.push(this.assets.load(charUrlFor(this.look, a, i))));
    const fxs = [this.fxData.dmg, this.fxData.dmgFirst, this.fxData.hurt, this.fxData.hurtFirst].flatMap((o: any) => Object.values(o));
    for (const s of [...fxs, ...this.fxData.meso, ...this.fxData.portal, this.fxData.miss] as Sprite[]) if (s) loads.push(this.assets.load(s.url));
    for (const a of Object.values(this.skillArt)) for (const f of [...a.effect, ...a.effect0, ...a.hit]) this.assets.load(f.url);
    await this.loadMap(startMap, "spawn");
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 25000))]);
  }

  // ------------------------------------------------------------ map loading
  async loadMap(id: number, arrive: "spawn" | "left" | "right") {
    if (this.boss) this.endBoss(false);
    this.loadingMap = true;
    const m = await json<MapData>(`./data/maps/${id}.json`);
    await Promise.all([...new Set(m.spawns.map((s) => s.id))].map(async (mid) => {
      if (!this.mobData.has(mid)) this.mobData.set(mid, await json(`./data/mobs/${mid}.json`));
    }));
    const renderTex = this.assets.load(m.render);
    const backLoads = m.backs.map((b) => this.assets.load(b.sprite.url));
    const mobLoads = [...this.mobData.values()].flatMap((d) => Object.values(d.books).flat().map((s) => this.assets.load(s.url)));
    await Promise.race([Promise.all([renderTex, ...backLoads, ...mobLoads]), new Promise((r) => setTimeout(r, 20000))]);
    const tex = await renderTex;

    this.map = m;
    this.tree = new FootholdTree(m.footholds);
    const ox = m.renderOrigin.x, oy = m.renderOrigin.y;
    this.bounds = tex
      ? { l: -ox, t: -oy, r: tex.w - ox, b: tex.h - oy }
      : { l: this.tree.minX, r: this.tree.maxX, t: this.tree.minY - 400, b: this.tree.maxY + 100 };
    this.bounds.l = Math.max(this.bounds.l, this.tree.minX - 20);
    this.bounds.r = Math.min(this.bounds.r, this.tree.maxX + 20);

    // Edge portals on the lowest floors.
    this.portals = [];
    const link = MAP_LINKS[id];
    const groundAt = (x: number) => { const f = this.tree.below(x, this.tree.minY - 1000); return f ? FootholdTree.yAt(f, x) : this.tree.maxY; };
    const lowest = (fromLeft: boolean) => {
      const xs = this.tree.floors.map((f) => (fromLeft ? f.x1 : f.x2));
      const edge = fromLeft ? Math.min(...xs) : Math.max(...xs);
      const x = edge + (fromLeft ? 70 : -70);
      let best = -Infinity;
      for (const f of this.tree.floors) if (x >= f.x1 && x <= f.x2) best = Math.max(best, FootholdTree.yAt(f, x));
      return { x, y: best > -Infinity ? best : groundAt(x) };
    };
    if (link) {
      const L = lowest(true), R = lowest(false);
      this.portals.push({ ...L, to: link.left, side: "left" }, { ...R, to: link.right, side: "right" });
    }

    // Player placement.
    const p = this.p;
    let px: number, py: number;
    if (arrive === "left") ({ x: px, y: py } = this.portals[0] ?? { x: 0, y: 0 });
    else if (arrive === "right") ({ x: px, y: py } = this.portals[1] ?? { x: 0, y: 0 });
    else ({ x: px, y: py } = this.portals[0] ? { x: this.portals[0].x + 40, y: this.portals[0].y } : (m.spawns[0] ?? { x: 0, y: 0 }));
    p.x = px; p.y = py - 5; p.vx = 0; p.vy = 0; p.ladder = null;
    p.fh = this.tree.landing(p.x, p.y - 20, p.y + 40);
    if (p.fh) p.y = FootholdTree.yAt(p.fh, p.x);

    // Monsters.
    this.mobs = m.spawns.map((s) => this.makeMob(s)).filter(Boolean) as Mob[];
    this.drops = []; this.fx = []; this.dmg = [];
    this.snapCamera();
    this.loadingMap = false;
    this.fade = 1;
    this.onMapChange(m);
  }

  makeMob(s: MapData["spawns"][number]): Mob | null {
    const data = this.mobData.get(s.id);
    if (!data) return null;
    const fh = this.tree.landing(s.x, s.y - 30, s.y + 30) ?? this.tree.below(s.x, s.y - 30);
    const sc = this.stageMul();
    const maxHp = Math.round((data.meta?.maxHP ?? 50) * sc.hp);
    return {
      data, spawn: s, x: s.x, y: fh ? FootholdTree.yAt(fh, s.x) : s.y, vx: 0, vy: 0, fh,
      dir: Math.random() < 0.5 ? -1 : 1, state: "stand", t: rand(0.5, 2.5), anim: 0, frame: 0,
      hp: maxHp, maxHp, aggro: 0, hpShow: 0, respawn: 0, alpha: 1,
      mul: { exp: sc.exp, meso: sc.meso }, atk: this.mobAtk(data),
    };
  }

  snapCamera() {
    const W = this.r.width, H = this.r.height;
    this.cam.x = this.p.x - W / 2;
    this.cam.y = this.p.y - H / 2 - 60;
    this.clampCam();
  }
  clampCam() {
    const W = this.r.width, H = this.r.height, b = this.bounds;
    if (b.r - b.l <= W) this.cam.x = (b.l + b.r) / 2 - W / 2;
    else this.cam.x = Math.max(b.l, Math.min(b.r - W, this.cam.x));
    const bottomPad = 90; // keep the floor above the status bar
    if (b.b - b.t + bottomPad <= H) this.cam.y = b.b + bottomPad - H;
    else this.cam.y = Math.max(b.t, Math.min(b.b + bottomPad - H, this.cam.y));
  }

  // ------------------------------------------------------------ input helpers
  down(...k: string[]) { return k.some((x) => this.keys.has(x) || this.ai.keys.has(x)); }
  hit(...k: string[]) { return k.some((x) => this.pressed.has(x) || this.ai.pressed.has(x)); }

  // ------------------------------------------------------------ character stats
  lv(id: string) { return this.skillLv[id] ?? 0; }
  totalStr() { return Math.round((this.stats.str + this.lv("1100009") * 4 + this.gt.str) * (1 + this.gt.strP / 100)); }
  totalDex() { return Math.round((this.stats.dex + this.lv("1100009") * 4 + this.gt.dex) * (1 + this.gt.dexP / 100)); }
  totalInt() { return Math.round((this.stats.int + this.gt.int) * (1 + this.gt.intP / 100)); }
  totalLuk() { return Math.round((this.stats.luk + this.gt.luk) * (1 + this.gt.lukP / 100)); }
  /** Class-aware primary stat getter — the number the damage formula leans on. */
  primaryStat() {
    const c = this.class;
    if (c.primary === "str") return this.totalStr();
    if (c.primary === "dex") return this.totalDex();
    if (c.primary === "int") return this.totalInt();
    return this.totalLuk();
  }
  secondaryStat() {
    const c = this.class;
    if (c.secondary === "str") return this.totalStr();
    if (c.secondary === "dex") return this.totalDex();
    if (c.secondary === "int") return this.totalInt();
    return this.totalLuk();
  }
  watk() { return Math.round(((this.eq.weapon ? this.gt.watk : 5 + this.gt.watk) + (this.buffs["1101006"] ? this.lv("1101006") * 2 : 0)) * (1 + this.gt.att / 100)); }
  maxDamage() {
    // Real MapleStory's per-class damage formulas, simplified to use the class's primary stat.
    return Math.max(1, ((4 * this.primaryStat() + this.secondaryStat()) * this.watk()) / 40);
  }
  combatPower() { return Math.round(this.maxDamage() * 12 * (1 + this.gt.boss / 200) + this.stats.maxHp / 4 + this.gt.def * 4); }
  computeLook() {
    const order: Slot[] = ["cape", "shoes", "bottom", "top", "gloves", "hat", "earrings", "shield", "weapon"];
    return lookKey(order.map((k) => this.eq[k]?.id).filter((x): x is number => !!x));
  }

  /** Destination sockets a gear item of the given category can be placed into. */
  socketsFor(category: string): Slot[] {
    if (category === "ring") return ["ring1", "ring2", "ring3", "ring4"];
    return [category as Slot];
  }

  /** Applies class-specific starting stats, skills and hotbar for a brand-new character. */
  applyClassDefaults(id: ClassId) {
    const c = classFor(id);
    this.stats.classId = c.id;
    this.stats.baseHp = c.base.hp;
    this.stats.baseMp = c.base.mp;
    this.stats.str = c.base.str;
    this.stats.dex = c.base.dex;
    this.stats.int = c.base.int;
    this.stats.luk = c.base.luk;
    this.stats.hp = c.base.hp;
    this.stats.mp = c.base.mp;
    // Fresh characters start with NO learned skills, then learn one usable
    // attack skill that is already on their default hotbar and eligible at level 1.
    this.skillLv = {};
    const attackIds = c.defaultQuick;
    const pick = Object.values(attackIds)
      .filter((a): a is { t: "skill"; id: string } => a?.t === "skill")
      .map((a) => a.id)
      .find((sid) => {
        const d = SKILL[sid];
        if (!d) return false;
        if (d.kind !== "attack" && d.kind !== "ranged") return false;
        if (this.stats.level < d.reqLevel) return false;
        if (!c.skillsByTab.some((tab) => tab.includes(sid))) return false;
        return true;
      });
    if (pick) this.skillLv[pick] = 1;
    this.quick = { ...c.defaultQuick };
    this.recalc();
  }
  /** Re-renders the character with new equipment; keeps the old look until the new frames are ready. */
  refreshLook() {
    const want = this.computeLook();
    if (want === this.look || want === this.lookWant) return;
    this.lookWant = want;
    // Stand/walk first so the switch is quick; the remaining frames stream in (old look fills gaps).
    const key = Object.entries(ANIMS).filter(([a]) => a === "stand1" || a === "walk1");
    const loads: Promise<unknown>[] = [];
    for (const [a, fr] of key) fr.forEach((_, i) => loads.push(Promise.resolve(this.assets.load(charUrlFor(want, a, i))).catch(() => null)));
    Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 15000))]).then(() => {
      if (this.lookWant !== want) return;
      if (this.assets.get(charUrlFor(want, "stand1", 0))) { this.prevLook = this.look; this.look = want; }
      this.lookWant = "";
      for (const [a, fr] of Object.entries(ANIMS)) fr.forEach((_, i) => this.assets.load(charUrlFor(want, a, i)));
    });
  }
  mastery() { return Math.min(0.9, 0.15 + this.lv("1100000") * 0.05); }
  damageRange() { const mx = this.maxDamage(); return [Math.max(1, Math.floor(mx * this.mastery())), Math.floor(mx)]; }
  speed() {
    let mult = 1 + this.lv("1000009") * 0.01;
    for (const [id] of Object.entries(this.buffs)) {
      const d = SKILL[id];
      if (d?.buff?.speed) mult += (d.buff.speed + this.lv(id)) * 0.01;
    }
    if (this.buffs["0001002"]) mult += this.lv("0001002") * 0.1;
    return WALK * mult;
  }
  jobFor(level: number) {
    const c = this.class;
    return level >= c.tabLevel[3] ? c.tabs[3] : level >= c.tabLevel[2] ? c.tabs[2] : c.tabs[1];
  }
  recalc() {
    const s = this.stats;
    const gt = { watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, att: 0, strP: 0, dexP: 0, intP: 0, lukP: 0, hpP: 0, boss: 0, meso: 0, drop: 0, exp: 0 };
    // Buff stat bonuses apply while the buff is active (level 1 = base bonus, +1 per level).
    for (const [id, b] of Object.entries(this.buffs)) {
      const d = SKILL[id];
      if (!d?.buff) continue;
      const l = Math.max(1, this.lv(id));
      gt.att += d.buff.att ? d.buff.att * l : 0;
      gt.str += d.buff.str ? d.buff.str * l : 0;
      gt.dex += d.buff.dex ? d.buff.dex * l : 0;
      gt.int += d.buff.int ? d.buff.int * l : 0;
      gt.luk += d.buff.luk ? d.buff.luk * l : 0;
      gt.def += d.buff.def ? d.buff.def * l : 0;
    }
    for (const g of Object.values(this.eq)) {
      if (!g) continue;
      const st = gearStats(g);
      gt.watk += st.watk; gt.str += st.str; gt.dex += st.dex; gt.int += st.int; gt.luk += st.luk; gt.hp += st.hp; gt.def += st.def;
      for (const p of g.pot) {
        if (p.stat === "att") gt.att += p.pct; else if (p.stat === "str") gt.strP += p.pct; else if (p.stat === "dex") gt.dexP += p.pct;
        else if (p.stat === "int") gt.intP += p.pct; else if (p.stat === "luk") gt.lukP += p.pct;
        else if (p.stat === "hp") gt.hpP += p.pct; else gt[p.stat] += p.pct;
      }
    }
    this.gt = gt;
    s.maxHp = Math.round((s.baseHp * (1 + this.lv("1000009") * 0.03) + gt.hp) * (1 + gt.hpP / 100));
    s.maxMp = Math.round(s.baseMp + s.int);
    s.hp = Math.min(s.hp, s.maxHp); s.mp = Math.min(s.mp, s.maxMp);
    s.job = this.jobFor(s.level);
  }
  addStat(k: "str" | "dex" | "int" | "luk", n = 1) {
    const s = this.stats;
    n = Math.min(n, s.ap);
    if (n <= 0) return;
    s[k] += n; s.ap -= n;
    this.recalc(); this.onChange();
  }
  autoAssign() {
    const s = this.stats, c = this.class;
    while (s.ap > 0) {
      // Real MapleStory: 4/3 of points to primary stat, rest to secondary. Simplified here
      // to a 3-then-1 rotation so the panel stays readable at every level.
      if (s[c.secondary] < 4 + s.level && (this.autoTick = !this.autoTick) === false) {
        this.addStat(c.secondary);
      } else {
        this.addStat(c.primary);
      }
    }
  }
  autoTick = false;
  /** A skill is learnable only if it belongs to this class's tabs and the player meets the level. */
  skillEligible(id: string) {
    const d = SKILL[id];
    if (!d) return false;
    const c = this.class;
    const inClass = c.skillsByTab.some((tab) => tab.includes(id));
    return inClass && this.stats.level >= d.reqLevel;
  }
  canLearn(id: string) {
    const d = SKILL[id];
    return !!d && this.skillEligible(id) && this.stats.sp > 0 && this.lv(id) < d.maxLevel;
  }
  learn(id: string) {
    if (!this.canLearn(id)) return false;
    this.skillLv[id] = this.lv(id) + 1; this.stats.sp--;
    this.recalc(); this.onChange();
    return true;
  }
  say(text: string) {
    this.balloon = { text, t: 5 };
    this.onChat("say", `${this.stats.name} : ${text}`);
  }

  // ------------------------------------------------------------ actions (quick slots, keys, auto)
  useAction(a: Action | null | undefined, quiet = false): boolean {
    if (!a) return false;
    const p = this.p, s = this.stats;
    if (a.t === "item") {
      const it = ITEMS[a.id], n = this.inv[a.id] ?? 0;
      if (!it || n <= 0) { if (!quiet) this.onChat("system", `You don't have any ${it?.name ?? "of that item"}.`); return false; }
      if ((it.hp && s.hp >= s.maxHp && !it.mp) || (it.mp && s.mp >= s.maxMp && !it.hp)) return false;
      this.inv[a.id] = n - 1;
      if (it.hp) s.hp = Math.min(s.maxHp, s.hp + it.hp);
      if (it.mp) s.mp = Math.min(s.maxMp, s.mp + it.mp);
      this.onChange();
      return true;
    }
    if (a.t === "attack") return this.startAttack(null);
    const d = SKILL[a.id], lv = this.lv(a.id);
    if (!d) return false;
    if (lv <= 0) { if (!quiet) this.onChat("system", "You haven't learned that skill yet."); return false; }
    if (!this.skillEligible(a.id)) { if (!quiet) this.onChat("system", "That skill doesn't belong to your class."); return false; }
    if (d.kind === "passive") return false;
    const cost = d.mp(lv);
    if (d.kind === "buff") {
      if (p.attack > 0 || p.ladder) return false;
      if (s.mp < cost) { if (!quiet) this.onChat("system", "Not enough MP."); return false; }
      s.mp -= cost;
      this.buffs[a.id] = { left: d.duration!(lv), dur: d.duration!(lv) };
      const art = this.skillArt[a.id];
      if (art?.effect.length) this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      p.alert = 2;
      this.recalc(); this.onChange();
      return true;
    }
    if (d.kind === "move") {
      if (p.fh || p.ladder || p.leapt || s.mp < cost) return false;
      s.mp -= cost; p.leapt = true;
      // War Leap: a much longer horizontal launch that grows with level.
      p.vy = -JUMP * 0.55;
      p.vx = p.face * this.speed() * (1.6 + lv * 0.12);
      return true;
    }
    return this.startAttack(a.id);
  }

  startAttack(id: string | null): boolean {
    const p = this.p, s = this.stats;
    if (p.attack > 0 || p.ladder || this.loadingMap) return false;
    const d = id ? SKILL[id] : null;
    if (d) {
      const cost = d.mp(this.lv(d.id));
      if (s.mp < cost) { this.onChat("system", "Not enough MP."); return false; }
      s.mp -= cost;
    }
    p.skill = id;
    p.attack = d ? 0.75 : 0.6; p.hitDone = false; p.alert = 3;
    p.attackAnim = d && d.kind !== "ranged" ? "swingO2" : "swingO1";
    p.frame = 0; p.ft = 0;
    const art = id ? this.skillArt[id] : null;
    if (art?.effect.length) this.fx.push({ frames: art.effect, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    if (art?.effect0.length) this.fx.push({ frames: art.effect0, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    if (this.loadingMap || !this.map) { this.pressed.clear(); return; }
    this.fade = Math.max(0, this.fade - dt * 2.5);
    this.updateBuffs(dt);
    this.runAuto(dt);
    this.updatePlayer(dt);
    this.updateProjectiles(dt);
    this.balloon.t = Math.max(0, this.balloon.t - dt);
    if (this.boss) { this.bossTimer -= dt; if (this.bossTimer <= 0) this.endBoss(false); }
    else if (this.auto.boss && this.bossReady() && !this.p.ladder) this.challengeBoss();
    if (this.auto.battle) { this.idle.autoTime += dt; if (this.idle.autoTime > 120) { this.idle.killRate = this.idle.autoKills / this.idle.autoTime; } if (this.idle.autoTime > 1800) { this.idle.autoTime /= 2; this.idle.autoKills /= 2; } }
    this.ahT = (this.ahT ?? 0) + dt;
    if (this.ahT > 5) { const sold = this.ah.tick(Date.now(), this.ahT); this.ahT = 0; if (sold) { this.onGain("meso", `Auction House: your ${goodsName(sold.goods)} sold for ${sold.price.toLocaleString()} mesos!`); this.onChat("system", `Auction House: your ${goodsName(sold.goods)} sold for ${sold.price.toLocaleString()} mesos! Collect it in the Auction House (H).`); this.onChange(); } }
    for (const m of this.mobs) this.updateMob(m, dt);
    this.updateDrops(dt);
    for (const f of this.fx) f.t += dt * 1000;
    this.fx = this.fx.filter((f) => f.t < f.frames.reduce((a, s) => a + (s.delay ?? 100), 0));
    for (const d of this.dmg) d.t += dt;
    this.dmg = this.dmg.filter((d) => d.t < 1.5);

    // Camera follow.
    const W = this.r.width, H = this.r.height;
    const tx = this.p.x - W / 2, ty = this.p.y - H / 2 - 60;
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.clampCam();
    this.pressed.clear();
    this.ai.pressed.clear();
  }

  updateBuffs(dt: number) {
    const s = this.stats, t = this.timers;
    let changed = false;
    for (const [id, b] of Object.entries(this.buffs)) {
      b.left -= dt;
      if (b.left <= 0) { delete this.buffs[id]; changed = true; }
    }
    if (changed) { this.recalc(); this.onChange(); }
    t.regen += dt;
    if (t.regen > 6) { t.regen = 0; s.hp = Math.min(s.maxHp, s.hp + 3 + Math.floor(s.level / 2)); s.mp = Math.min(s.maxMp, s.mp + 3 + Math.floor(s.level / 2)); }
    if (this.buffs["0001001"]) { t.recovery += dt; if (t.recovery > 2) { t.recovery = 0; s.hp = Math.min(s.maxHp, s.hp + 8 * this.lv("0001001")); } }
    const sr = this.lv("1110000");
    if (sr > 0) { t.self += dt; if (t.self > 4) { t.self = 0; s.hp = Math.min(s.maxHp, s.hp + 30 * sr); s.mp = Math.min(s.maxMp, s.mp + 10 * sr); } }
    // Auto potions run independently of auto battle.
    this.potCd = Math.max(0, this.potCd - dt);
    if (this.potCd <= 0) {
      if (this.auto.hp && s.hp / s.maxHp * 100 < this.auto.hpPct) {
        for (const id of [2000000, 2000001, 2000002]) if (this.useAction({ t: "item", id }, true)) { this.potCd = 0.6; break; }
      }
      if (this.potCd <= 0 && this.auto.mp && s.mp / s.maxMp * 100 < this.auto.mpPct) {
        for (const id of [2000003, 2000006]) if (this.useAction({ t: "item", id }, true)) { this.potCd = 0.6; break; }
      }
    }
    if (this.auto.buff && this.p.attack <= 0 && !this.p.ladder) this.autoBuffHotbar();
  }

  updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.t += dt;
      const tx = pr.target.x, ty = pr.target.y - 25;
      const dx = tx - pr.x, dy = ty - pr.y, dist = Math.hypot(dx, dy);
      const step = 650 * dt;
      if (dist <= step || pr.target.state === "dead") {
        if (pr.target.state !== "dead" && pr.target.state !== "die1") this.damageMob(pr.target, pr.dmg, pr.miss);
        pr.t = 99;
      } else { pr.x += (dx / dist) * step; pr.y += (dy / dist) * step; }
    }
    this.projectiles = this.projectiles.filter((p) => p.t < 2);
  }

  // ------------------------------------------------------------ auto battle
  liveMobs() { return this.mobs.filter((m) => m.state !== "dead" && m.state !== "die1" && m.alpha >= 1); }

  /** Skills currently on the hotbar that this character has learned and is eligible for. */
  hotbarSkills(): SkillDef[] {
    const ids = new Set<string>();
    for (const a of Object.values(this.quick)) {
      if (a?.t === "skill") ids.add(a.id);
    }
    return SKILL_DEFS.filter((d) => ids.has(d.id) && this.lv(d.id) > 0 && this.skillEligible(d.id));
  }

  /** Picks the best attack among only the skills the player has assigned to their hotbar. */
  bestAttack(dir: -1 | 1): { id: string | null; range: number } {
    const s = this.stats, p = this.p;
    let best: { id: string | null; range: number; score: number } = { id: null, range: 85, score: 1 };
    for (const d of this.hotbarSkills()) {
      if (d.kind !== "attack" && d.kind !== "ranged") continue;
      if (s.mp < d.mp(this.lv(d.id))) continue;
      const range = d.range ?? 90;
      const n = this.liveMobs().filter((m) => Math.abs(m.y - p.y) < 70 && (m.x - p.x) * dir > -20 && Math.abs(m.x - p.x) < range).length;
      const score = Math.min(n, d.targets ?? 1) * (d.dmg!(this.lv(d.id)) / 100) * (d.hits ?? 1) + (n ? 0.01 * range : 0);
      if (score > best.score) best = { id: d.id, range, score };
    }
    // Fall back to the basic attack when no hotbar skill is usable in this situation.
    if (best.id === null && this.hotbarSkills().length > 0 && Object.values(this.quick).some((a) => a?.t === "attack")) {
      return { id: null, range: 85 }; // Ctrl/X-style basic attack
    }
    return best;
  }

  /** Auto-buffs only skills on the hotbar. */
  autoBuffHotbar() {
    for (const d of this.hotbarSkills()) {
      if (d.kind !== "buff") continue;
      const b = this.buffs[d.id];
      if ((!b || b.left < 3) && this.stats.mp >= d.mp(this.lv(d.id)) + 10) {
        this.useAction({ t: "skill", id: d.id }, true);
        break;
      }
    }
  }

  runAuto(dt: number) {
    const ai = this.ai, p = this.p, tree = this.tree;
    ai.keys.clear();
    if (!this.auto.battle) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Alt", " "].some((k) => this.keys.has(k))) ai.hold = 1.2;
    ai.hold = Math.max(0, ai.hold - dt);
    if (ai.hold > 0 || p.attack > 0) return;
    if (this.auto.loot) ai.keys.add("z");
    for (const [m, t] of ai.ban) if (t < this.time) ai.ban.delete(m);

    ai.think -= dt;
    const alive = this.liveMobs().filter((m) => !ai.ban.has(m));
    // ---- Smarter target selection -------------------------------------------
    // Prefer targets already in the same horizontal band (so we don't ping-pong
    // between platforms) and prefer the one closest to the player on the current
    // floor, weighted against horizontal distance much more than vertical.
    if (!ai.target || ai.target.state === "dead" || ai.target.state === "die1" || ai.think <= 0) {
      ai.think = 0.8;
      const sameBand = alive.filter((m) => Math.abs(m.y - p.y) < 70);
      const pool = sameBand.length ? sameBand : alive;
      let best: Mob | null = null, bs = Infinity;
      for (const m of pool) {
        const sc = Math.abs(m.x - p.x) * (sameBand.length ? 1 : 0.5) + Math.abs(m.y - p.y) * 2.5;
        if (sc < bs) { bs = sc; best = m; }
      }
      if (best !== ai.target) ai.stuck = 0;
      ai.target = best;
    }
    // Loot nearby drops when nothing is close.
    const drop = this.auto.loot ? this.drops.find((d) => !d.picked && d.fh && Math.abs(d.y - p.y) < 30 && Math.abs(d.x - p.x) < 220) : null;
    const t = ai.target;
    const near = t && Math.abs(t.x - p.x) < 140 && Math.abs(t.y - p.y) < 60;
    const goal = drop && !near ? { x: drop.x, y: drop.y } : t ? { x: t.x, y: t.y } : null;
    if (!goal) return;
    const dx = goal.x - p.x, dy = goal.y - p.y;
    const dir = (dx >= 0 ? 1 : -1) as -1 | 1;

    // Stuck detection.
    if (Math.abs(p.x - ai.lastX) < 1.5 && !p.ladder) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
    ai.lastX = p.x;
    if (ai.stuck > 4 && t) { ai.ban.set(t, this.time + 6); ai.target = null; ai.stuck = 0; return; }

    if (p.ladder) {
      ai.keys.add(dy < 0 ? "ArrowUp" : "ArrowDown");
      if (Math.abs(dy) < 8) { ai.keys.add(dx > 0 ? "ArrowRight" : "ArrowLeft"); ai.pressed.add(" "); }
      return;
    }
    if (!p.fh) { if (Math.abs(dx) > 10) ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft"); return; }

    if (Math.abs(dy) < 40) {
      if (t && goal.x === t.x) {
        const atk = this.bestAttack(dir);
        if (Math.abs(dx) <= atk.range * 0.8) {
          p.face = dir;
          this.startAttack(atk.id);
          return;
        }
      }
      ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
      if (ai.stuck > 1.2) ai.pressed.add(" ");
      return;
    }
    if (dy < 0) {
      // Target is above: use a ladder/rope that reaches its height, otherwise jump toward it.
      const L = this.map.ladders
        .filter((L) => L.y1 <= goal.y + 15 && L.y2 >= p.y - 10)
        .sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.x - goal.x) * 0.3 - (Math.abs(b.x - p.x) + Math.abs(b.x - goal.x) * 0.3))[0];
      if (L && Math.abs(L.x - p.x) < 600) {
        if (Math.abs(L.x - p.x) > 8) ai.keys.add(L.x > p.x ? "ArrowRight" : "ArrowLeft");
        else ai.keys.add("ArrowUp");
        if (ai.stuck > 1.2) ai.pressed.add(" ");
        return;
      }
      ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
      if (dy > -140 && Math.abs(dx) < 160) ai.pressed.add(" ");
      else if (ai.stuck > 0.8) ai.pressed.add(" ");
      return;
    }
    // Target is below: drop through the platform or walk off the edge.
    const below = tree.below(p.x, p.y + 4, p.fh.id);
    if (below && Math.abs(dx) < 300) { ai.keys.add("ArrowDown"); ai.pressed.add(" "); return; }
    ai.keys.add(dir > 0 ? "ArrowRight" : "ArrowLeft");
  }

  updatePlayer(dt: number) {
    const p = this.p, s = this.stats, tree = this.tree;
    p.invuln = Math.max(0, p.invuln - dt);
    p.alert = Math.max(0, p.alert - dt);

    const left = this.down("ArrowLeft"), right = this.down("ArrowRight");
    const up = this.down("ArrowUp"), downK = this.down("ArrowDown");
    const jump = this.hit("Alt", "c", "C", " ");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    // Quick slots: attacks repeat while held, everything else fires once per press.
    for (const [k, a] of Object.entries(this.quick)) {
      if (!a) continue;
      const isAttack = a.t === "attack" || (a.t === "skill" && (SKILL[a.id]?.kind === "attack" || SKILL[a.id]?.kind === "ranged"));
      if (this.pressed.has(k) || (isAttack && this.keys.has(k) && p.attack <= 0)) this.useAction(a);
    }
    if (this.down("x") && p.attack <= 0) this.startAttack(null);

    // Pick up.
    if (this.down("z", "Z")) {
      for (const d of this.drops) {
        if (d.picked || !d.fh) continue;
        if (Math.abs(d.x - p.x) < 40 && Math.abs(d.y - p.y) < 40) {
          d.picked = 0.001;
          if (d.gear) {
            this.addGear(d.gear);
            this.onChat("item", `You have gained ${RARITY[d.gear.rarity]} ${GEAR.get(d.gear.id)?.name ?? "equipment"}.`);
          } else if (d.mat) {
            this.mats[d.mat] = (this.mats[d.mat] ?? 0) + 1;
            this.onChat("item", `You have gained an item (${MATS.get(d.mat) ?? d.mat})`);
          } else if (d.item) {
            this.inv[d.item] = (this.inv[d.item] ?? 0) + 1;
            this.onChat("item", `You have gained an item (${ITEMS[d.item]?.name ?? d.item})`);
          } else {
            s.meso += d.amount;
            this.onGain("meso", `You have gained mesos (+${d.amount})`);
          }
          this.onChange();
          break;
        }
      }
    }

    // Portals.
    if (up && p.fh && p.attack <= 0) {
      for (const pt of this.portals) {
        if (Math.abs(pt.x - p.x) < 30 && Math.abs(pt.y - p.y) < 50) {
          this.loadMap(pt.to, pt.side === "left" ? "right" : "left");
          return;
        }
      }
    }

    // Attacks.
    if (p.attack > 0) {
      p.attack -= dt;
      if (!p.hitDone && p.attack < (p.skill ? 0.45 : 0.32)) { p.hitDone = true; this.resolveAttack(p.skill); }
    }

    // Ladders & ropes.
    if (p.ladder) {
      const L = p.ladder;
      const vy = (downK ? 1 : 0) - (up ? 1 : 0);
      p.y += vy * CLIMB * dt;
      p.x = L.x;
      if (jump && dir !== 0) { p.ladder = null; p.vx = dir * this.speed() * 0.8; p.vy = -JUMP * 0.55; p.face = dir as -1 | 1; }
      else if (p.y < L.y1) {
        const f = tree.landing(p.x, L.y1 - 30, L.y1 + 15);
        p.ladder = null;
        if (f) { p.fh = f; p.y = FootholdTree.yAt(f, p.x); } else { p.vy = 0; }
      } else if (p.y > L.y2) {
        p.ladder = null; p.vy = 0;
      }
      this.animate(dt, L.isLadder ? "ladder" : "rope", vy !== 0);
      this.checkMobContact();
      return;
    }

    const nearLadder = (yTest: (L: Ladder) => boolean) =>
      tree && this.map.ladders.find((L) => Math.abs(L.x - p.x) < 14 && yTest(L));

    if (p.fh) {
      p.prone = false;
      // Grab ladder upwards / downwards.
      if (up && p.attack <= 0) {
        const L = nearLadder((L) => p.y > L.y1 + 5 && p.y <= L.y2 + 8);
        if (L) { p.ladder = L; p.fh = null; p.x = L.x; p.y = Math.min(p.y - 2, L.y2); this.animate(dt, L.isLadder ? "ladder" : "rope", false); return; }
      }
      if (downK && p.attack <= 0) {
        const L = nearLadder((L) => Math.abs(L.y1 - p.y) < 22);
        if (L) { p.ladder = L; p.fh = null; p.x = L.x; p.y = L.y1 + 6; return; }
      }
      if (downK && jump && p.attack <= 0) {
        const below = tree.below(p.x, p.y + 4, p.fh.id);
        if (below && FootholdTree.yAt(below, p.x) - p.y < 600) {
          p.ignoreFh = p.fh.id; p.fh = null; p.vy = -120; p.vx = 0;
        }
      } else if (jump && p.attack <= 0) {
        p.fh = null; p.vy = -JUMP; p.vx = dir * this.speed(); p.leapt = false;
      }
    }

    if (p.fh) {
      const canMove = p.attack <= 0 && !downK;
      const target = canMove ? dir * this.speed() : 0;
      p.leapt = false;
      p.vx += (target - p.vx) * Math.min(1, dt * (target === 0 ? 18 : 12));
      if (Math.abs(p.vx) < 2 && target === 0) p.vx = 0;
      if (dir !== 0 && p.attack <= 0) p.face = dir as -1 | 1;
      const res = groundMove(tree, p, p.vx * dt);
      if (res === "blocked") p.vx = 0;
      p.x = tree.wallClamp(p.x, p.x, p.y);
      if (res === "air") p.vy = 0;
      p.prone = downK && p.attack <= 0;
      const anim = p.attack > 0 ? p.attackAnim : p.prone ? "prone" : Math.abs(p.vx) > 10 ? "walk1" : p.alert > 0 ? "alert" : "stand1";
      this.animate(dt, anim, true);
    } else {
      // Airborne: limited air control, ladder grab mid-air.
      // War Leap only fires when it is actually assigned to the hotbar — the
      // hotbar is the single source of truth for which skills the character uses.
      const leapOnHotbar = Object.values(this.quick).some((a) => a?.t === "skill" && a.id === "1001008");
      if (jump && !downK && leapOnHotbar && this.lv("1001008") > 0) { if (dir !== 0) p.face = dir as -1 | 1; this.useAction({ t: "skill", id: "1001008" }, true); }
      const vmax = p.leapt ? Math.max(Math.abs(p.vx), this.speed()) : this.speed();
      if (dir !== 0) { p.vx += dir * 300 * dt; p.vx = Math.max(-vmax, Math.min(vmax, p.vx)); if (p.attack <= 0) p.face = dir as -1 | 1; }
      if (up) {
        const L = nearLadder((L) => p.y > L.y1 && p.y < L.y2);
        if (L) { p.ladder = L; p.vx = 0; p.vy = 0; p.x = L.x; return; }
      }
      airMove(tree, p, dt);
      this.animate(dt, p.attack > 0 ? p.attackAnim : "jump", true);
    }
    this.checkMobContact();
  }

  animate(dt: number, anim: string, advance: boolean) {
    const p = this.p;
    if (p.anim !== anim) { p.anim = anim; p.frame = 0; p.ft = 0; return; }
    if (!advance) return;
    p.ft += dt * 1000;
    const d = ANIMS[anim];
    while (p.ft > d[p.frame]) {
      p.ft -= d[p.frame];
      p.frame = anim.startsWith("swing") ? Math.min(p.frame + 1, d.length - 1) : (p.frame + 1) % d.length;
    }
  }

  mobBox(m: Mob) {
    const st = m.data.books.stand?.[0] ?? m.data.books.move?.[0];
    const w = st ? st.w * 0.7 : 40, h = st ? st.h * 0.85 : 40;
    return { x0: m.x - w / 2, x1: m.x + w / 2, y0: m.y - h, y1: m.y };
  }

  rollDamage(pct: number, mob: Mob) {
    const [lo, hi] = this.damageRange();
    const mobLv = mob.data.meta?.level ?? 1;
    const missChance = Math.max(0.02, Math.min(0.5, 0.06 + (mobLv - this.stats.level) * 0.03 - this.totalDex() * 0.002 - this.lv("1100000") * 0.004));
    if (Math.random() < missChance) return { dmg: 0, miss: true };
    const def = (mob.data.meta?.PDDamage ?? 0) * 0.5;
    const bossMul = mob.boss ? 1 + this.gt.boss / 100 : 1;
    return { dmg: Math.max(1, Math.round((rand(lo, hi) * pct / 100) * bossMul - def)), miss: false };
  }

  resolveAttack(id: string | null) {
    const p = this.p;
    const d: SkillDef | null = id ? SKILL[id] : null;
    const lv = id ? this.lv(id) : 0;
    const range = d?.range ?? 90;
    const x0 = p.face === 1 ? p.x - 10 : p.x - range, x1 = p.face === 1 ? p.x + range : p.x + 10;
    const y0 = p.y - (d ? 100 : 70), y1 = p.y + 10;
    const targets = this.liveMobs()
      .filter((m) => { const b = this.mobBox(m); return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1; })
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
      .slice(0, d?.targets ?? 1);
    const pct = d?.dmg ? d.dmg(lv) : 100;
    if (d?.kind === "ranged") {
      // Ranged skills now spawn one projectile per target, with a per-hit damage roll.
      for (const m of targets) {
        for (let h = 0; h < (d?.hits ?? 1); h++) {
          const r = this.rollDamage(pct, m);
          this.projectiles.push({ x: p.x + p.face * 20, y: p.y - 35, target: m, dmg: r.dmg, miss: r.miss, t: 0, skillId: id ?? undefined });
        }
      }
      return;
    }
    const art = id ? this.skillArt[id] : null;
    for (const m of targets) {
      for (let h = 0; h < (d?.hits ?? 1); h++) {
        if (m.state === "die1" || m.state === "dead") break;
        const r = this.rollDamage(pct, m);
        this.damageMob(m, r.dmg, r.miss);
      }
      if (art?.hit.length) this.fx.push({ frames: art.hit, x: m.x, y: m.y - 25, flip: p.face === 1, t: 0 });
    }
  }

  damageMob(m: Mob, dmg: number, miss: boolean) {
    const box = this.mobBox(m);
    const stack = this.dmg.filter((d) => !d.hurt && Math.abs(d.x - m.x) < 30 && d.t < 0.4).length;
    this.dmg.push({ value: dmg, miss, hurt: false, x: m.x, y: box.y0 - 6 - stack * 30, t: 0 });
    if (miss) return;
    m.hp -= dmg;
    m.hpShow = 4;
    m.aggro = 6;
    m.dir = this.p.x < m.x ? -1 : 1;
    if (m.hp <= 0) {
      m.state = "die1"; m.anim = 0; m.frame = 0;
      if (m.boss) { this.endBoss(true); return; }
      const exp = Math.max(1, Math.round((m.data.meta?.exp ?? 5) * m.mul.exp * (1 + this.gt.exp / 100)));
      this.gainExp(exp);
      if (this.stage.kills < STAGE_KILLS) {
        this.stage.kills++;
        if (this.stage.kills === STAGE_KILLS) this.onChat("notice", `Stage ${this.stage.n} boss is ready! Press the BOSS button${this.auto.boss ? " (Auto Boss will challenge it for you)" : ""}.`);
      }
      // Idle tracking (used for offline rewards).
      const id = this.idle;
      id.expPerKill = id.expPerKill * 0.9 + exp * 0.1;
      if (this.auto.battle) id.autoKills++;
      const dropMul = 1 + this.gt.drop / 100;
      const mat = MOB_MAT[m.data.id];
      if (mat && Math.random() < 0.45 * dropMul) this.drops.push({ x: m.x + rand(-10, 10), y: m.y - 20, vx: rand(-50, 50), vy: -400, fh: null, amount: 0, mat, t: 0, picked: 0 });
      if (Math.random() < 0.05 * dropMul) this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-50, 50), vy: -420, fh: null, amount: 0, mat: ORES[Math.floor(Math.random() * Math.min(ORES.length, 2 + Math.floor(this.stage.n / 4)))], t: 0, picked: 0 });
      if (Math.random() < 0.035 * dropMul) this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-50, 50), vy: -420, fh: null, amount: 0, gear: makeGear(randomGearFor(this.stats.level)), t: 0, picked: 0 });
      const roll = Math.random();
      if (roll < 0.14) {
        const pool = [2000000, 2000000, 2000000, 2000003, 2000003, 2000001, 2000002, 2000006];
        this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-40, 40), vy: -380, fh: null, amount: 0, item: pool[Math.floor(Math.random() * pool.length)], t: 0, picked: 0 });
      }
      if (Math.random() < 0.75) {
        const lv = m.data.meta?.level ?? 5;
        const amt = Math.round(rand(lv * 1.5, lv * 3.5) * m.mul.meso * (1 + this.gt.meso / 100));
        this.idle.mesoPerKill = this.idle.mesoPerKill * 0.9 + amt * 0.75 * 0.1;
        this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-40, 40), vy: -380, fh: null, amount: amt, t: 0, picked: 0 });
      }
    } else {
      if (!m.boss || Math.random() < 0.12) {
        m.state = "hit1"; m.t = m.boss ? 0.25 : 0.5; m.anim = 0; m.frame = 0; m.attacking = undefined;
        if (m.fh && !m.boss) groundMove(this.tree, m, this.p.face * 14, true);
      }
    }
  }

  gainExp(n: number) {
    const s = this.stats;
    s.exp += n;
    this.onGain("exp", `You have gained experience (+${n})`);
    while (s.exp >= expToLevel(s.level)) {
      s.exp -= expToLevel(s.level);
      s.level++;
      const oldJob = s.job;
      s.baseHp += Math.round(rand(18, 22)); s.baseMp += Math.round(rand(4, 6));
      s.ap += 5; s.sp += 3;
      this.recalc();
      s.hp = s.maxHp; s.mp = s.maxMp;
      if (this.auto.ap) this.autoAssign();
      else this.onChat("notice", `You have ${s.ap} Ability Points and ${s.sp} Skill Points. Press S and K to spend them.`);
      if (s.job !== oldJob) this.onChat("level", `You have advanced to ${s.job}! New skills are available in the Skill window (K).`);
      this.onChange();
      this.fx.push({ frames: this.fxData.levelUp, x: this.p.x, y: this.p.y, flip: false, t: 0, follow: true });
      this.onGain("level", `Congratulations! You have reached Level ${s.level}.`);
    }
  }

  checkMobContact() {
    const p = this.p;
    if (p.invuln > 0) return;
    for (const m of this.mobs) {
      if (m.state === "die1" || m.state === "dead" || m.alpha < 1) continue;
      const b = this.mobBox(m);
      if (p.x + 12 > b.x0 && p.x - 12 < b.x1 && p.y > b.y0 + 6 && p.y - 60 < b.y1) {
        const dmg = this.hurtAmount(m.atk);
        this.stats.hp = Math.max(0, this.stats.hp - dmg);
        this.dmg.push({ value: dmg, miss: false, hurt: true, x: p.x, y: p.y - 75, t: 0 });
        p.invuln = 2; p.alert = 3;
        const away = p.x < m.x ? -1 : 1;
        p.ladder = null; p.fh = null; p.vx = away * 130; p.vy = -260; p.attack = 0;
        if (this.stats.hp <= 0) this.die();
        return;
      }
    }
  }

  hurtAmount(atk: number) {
    const reduce = (1 - this.lv("1000003") * 0.02) * (100 / (100 + this.gt.def));
    return Math.max(1, Math.round((atk * rand(0.8, 1.2) - this.stats.level * 0.5) * reduce));
  }

  die() {
    if (this.boss) this.endBoss(false);
    const s = this.stats;
    const lost = Math.floor(s.exp * 0.1);
    s.exp -= lost;
    s.hp = Math.round(s.maxHp * 0.5); s.mp = Math.round(s.maxMp * 0.5);
    this.onChat("notice", `You have been defeated and lost ${lost} EXP. Returning to the town spawn.`);
    this.loadMap(this.map.id, "spawn").then(() => { this.p.invuln = 3; });
  }

  updateMob(m: Mob, dt: number) {
    const tree = this.tree;
    m.hpShow = Math.max(0, m.hpShow - dt);
    m.aggro = Math.max(0, m.aggro - dt);
    const books = m.data.books;
    const play = (book: string, loop: boolean) => {
      const fr = books[book];
      if (!fr?.length) return true;
      m.anim += dt * 1000;
      while (m.anim > (fr[m.frame]?.delay ?? 150)) {
        m.anim -= fr[m.frame]?.delay ?? 150;
        if (m.frame + 1 >= fr.length) { if (!loop) return true; m.frame = 0; } else m.frame++;
      }
      return false;
    };

    if (m.state === "dead") {
      m.respawn -= dt;
      if (m.boss) { this.mobs = this.mobs.filter((x) => x !== m); return; }
      if (m.respawn <= 0) Object.assign(m, this.makeMob(m.spawn), { alpha: 0 });
      return;
    }
    if (m.alpha < 1) m.alpha = Math.min(1, m.alpha + dt * 1.5);
    if (m.state === "die1") {
      if (play("die1", false)) { m.state = "dead"; m.respawn = rand(6, 9); }
      return;
    }
    if (!m.fh) {
      airMove(tree, m, dt);
      play("stand", true);
      return;
    }
    if (m.state === "hit1") {
      m.t -= dt;
      play("hit1", true);
      if (m.t <= 0) { m.state = "move"; m.t = rand(1, 3); m.frame = 0; m.anim = 0; }
      return;
    }
    if (m.boss) { this.updateBoss(m, dt, play); return; }
    m.t -= dt;
    if (m.aggro > 0) {
      m.state = "move";
      m.dir = this.p.x < m.x ? -1 : 1;
    } else if (m.t <= 0) {
      m.state = Math.random() < 0.4 ? "stand" : "move";
      m.dir = Math.random() < 0.5 ? -1 : 1;
      m.t = rand(1.2, 3.5);
      m.frame = 0; m.anim = 0;
    }
    if (m.state === "move") {
      const speed = 70 * (1 + (m.data.meta?.speed ?? 0) / 100) * (m.aggro > 0 ? 1.25 : 1);
      const res = groundMove(tree, m, m.dir * speed * dt, true);
      const lo = Math.min(m.spawn.rx0, m.spawn.rx1), hi = Math.max(m.spawn.rx0, m.spawn.rx1);
      if (res === "blocked" || (hi > lo && (m.x < lo || m.x > hi))) {
        m.dir = (m.dir * -1) as -1 | 1;
        if (hi > lo) m.x = Math.max(lo, Math.min(hi, m.x));
        if (m.fh) m.y = FootholdTree.yAt(m.fh, Math.max(m.fh.x1, Math.min(m.fh.x2, m.x)));
      }
      play(books.move ? "move" : "stand", true);
    } else play("stand", true);
  }

  /** Bosses chase the player and periodically use their real attack/skill animations as an area hit. */
  updateBoss(m: Mob, dt: number, play: (book: string, loop: boolean) => boolean) {
    const p = this.p, books = m.data.books;
    const dx = p.x - m.x;
    if (m.attacking) {
      if (play(m.attacking, false)) {
        if (Math.abs(dx) < 230 && Math.abs(p.y - m.y) < 140 && p.invuln <= 0 && this.stats.hp > 0) {
          const dmg = this.hurtAmount(m.atk * 1.6);
          this.stats.hp = Math.max(0, this.stats.hp - dmg);
          this.dmg.push({ value: dmg, miss: false, hurt: true, x: p.x, y: p.y - 75, t: 0 });
          p.invuln = 1.5; p.alert = 3; p.ladder = null; p.fh = null; p.vx = (dx < 0 ? -1 : 1) * 200; p.vy = -320; p.attack = 0;
          if (this.stats.hp <= 0) this.die();
        }
        m.attacking = undefined; m.skillT = rand(3, 5.5); m.frame = 0; m.anim = 0;
      }
      return;
    }
    m.skillT = (m.skillT ?? 3) - dt;
    m.dir = dx < 0 ? -1 : 1;
    const atkBook = ["attack1", "skill1"].filter((b) => books[b]?.length);
    if (m.skillT <= 0 && Math.abs(dx) < 280 && atkBook.length) {
      m.attacking = atkBook[Math.floor(Math.random() * atkBook.length)]; m.frame = 0; m.anim = 0;
      return;
    }
    if (m.skillT <= 0) { m.skillT = rand(3, 5); if (books.jump && m.fh) { m.vy = -480; m.fh = null; return; } }
    if (Math.abs(dx) > 50) {
      const res = groundMove(this.tree, m, m.dir * 75 * dt, true);
      if (res === "blocked") m.skillT = Math.min(m.skillT, 0.3);
      play(books.move ? "move" : "stand", true);
      if (m.state !== "move") { m.state = "move"; }
    } else { if (m.state !== "stand") { m.state = "stand"; m.frame = 0; m.anim = 0; } play("stand", true); }
  }

  updateDrops(dt: number) {
    const magnet = this.auto.battle && this.auto.magnet;
    for (const d of this.drops) {
      d.t += dt;
      if (d.picked) { d.picked += dt; d.x += (this.p.x - d.x) * Math.min(1, dt * 12); d.y += (this.p.y - 30 - d.y) * Math.min(1, dt * 12); continue; }
      // Meso magnet: while auto battle runs, resting drops are sucked toward
      // the player (and collected on contact), like the Meso Magnet / pet loot.
      if (magnet && d.t > 0.6) {
        const dx = this.p.x - d.x, dy = (this.p.y - 20) - d.y, dist = Math.hypot(dx, dy) || 1;
        const pull = Math.min(dist, 900 * dt);
        d.x += (dx / dist) * pull;
        d.y += (dy / dist) * pull;
        d.fh = null; // in flight toward the player; physics stays off
        d.ignoreFh = undefined;
        d.vx = 0; d.vy = 0;
      } else if (!d.fh) {
        airMove(this.tree, d, dt);
        if (d.fh) d.vx = 0;
      }
    }
    this.drops = this.drops.filter((d) => (d.picked ? d.picked < 0.25 : d.t < 60));
    // Magnet collects anything it has pulled onto the player.
    if (magnet) {
      for (const d of this.drops) {
        if (d.picked) continue;
        if (Math.abs(d.x - this.p.x) < 40 && Math.abs(d.y - (this.p.y - 20)) < 40) d.picked = 0.001;
      }
    }
  }

  // ------------------------------------------------------------ equipment
  equip(uid: string) {
    const i = this.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return false;
    const g = this.bag[i], b = GEAR.get(g.id)!;
    if (this.stats.level < b.req) { this.onChat("system", `You need to be Lv. ${b.req} to equip ${b.name}.`); return false; }
    // Find the first empty destination socket for this item's category.
    const sockets = this.socketsFor(b.slot);
    let target: Slot | null = null;
    for (const s of sockets) {
      if (!this.eq[s]) { target = s; break; }
    }
    if (!target) target = sockets[0]; // all full: swap into the first socket
    this.bag.splice(i, 1);
    const old = this.eq[target];
    if (old) this.bag.push(old);
    this.eq[target] = g;
    this.recalc(); this.refreshLook(); this.onChange();
    return true;
  }
  unequip(slot: Slot) {
    const g = this.eq[slot];
    if (!g) return;
    if (this.bag.length >= 48) { this.onChat("system", "Your Equip inventory is full."); return; }
    delete this.eq[slot];
    this.bag.push(g);
    this.recalc(); this.refreshLook(); this.onChange();
  }
  sellGear(uid: string) {
    const i = this.bag.findIndex((g) => g.uid === uid);
    if (i < 0) return;
    const g = this.bag[i], price = npcSellPrice(g);
    this.bag.splice(i, 1); this.stats.meso += price;
    this.onGain("meso", `Sold ${GEAR.get(g.id)?.name} for ${price.toLocaleString()} mesos.`);
    this.onChange();
  }
  sellJunk() {
    const junk = this.bag.filter((g) => g.rarity === 0 && g.star === 0);
    let total = 0;
    for (const g of junk) total += npcSellPrice(g);
    this.bag = this.bag.filter((g) => !junk.includes(g));
    this.stats.meso += total;
    this.onGain("meso", junk.length ? `Sold ${junk.length} Normal items for ${total.toLocaleString()} mesos.` : "No Normal-grade items to sell.");
    this.onChange();
  }
  findGear(uid: string) { return this.bag.find((g) => g.uid === uid) ?? Object.values(this.eq).find((g) => g?.uid === uid) ?? null; }
  addGear(g: Gear) {
    if (this.bag.length >= 48) { const p = npcSellPrice(g); this.stats.meso += p; this.onChat("meso", `Equip inventory full — auto-sold ${GEAR.get(g.id)?.name} for ${p} mesos.`); return; }
    this.bag.push(g);
  }

  // ------------------------------------------------------------ crafting
  canCraft(r: Recipe) {
    return this.stats.level >= r.level && this.stats.meso >= r.meso && r.needs.every(([id, n]) => (this.mats[id] ?? 0) >= n);
  }
  craft(r: Recipe) {
    if (!this.canCraft(r)) return null;
    for (const [id, n] of r.needs) this.mats[id] -= n;
    this.stats.meso -= r.meso;
    let msg = "";
    if (r.out.t === "mat") { this.mats[r.out.id] = (this.mats[r.out.id] ?? 0) + r.out.n; msg = `Crafted ${MATS.get(r.out.id)} ×${r.out.n}.`; }
    else if (r.out.t === "use") { this.inv[r.out.id] = (this.inv[r.out.id] ?? 0) + r.out.n; msg = `Crafted ${r.name}.`; }
    else {
      const id = recipeGearId(r.out.slot, r.out.tier);
      if (!id) return null;
      const g = makeGear(id, 1.2, 1);
      this.addGear(g);
      msg = `Crafted ${RARITY[g.rarity]} ${GEAR.get(id)?.name}!`;
    }
    this.onChat("item", msg); this.onChange();
    return msg;
  }
  enhance(uid: string): "success" | "fail" | "max" | "cost" | null {
    const g = this.findGear(uid);
    if (!g) return null;
    if (g.star >= 15) return "max";
    const cost = starCost(g), mat = starMat(g.star);
    if (this.stats.meso < cost || (this.mats[mat] ?? 0) < 1) return "cost";
    this.stats.meso -= cost; this.mats[mat]--;
    const ok = Math.random() < starRate(g.star);
    if (ok) g.star++;
    this.recalc(); this.onChange();
    this.onChat(ok ? "level" : "system", ok ? `Star Force succeeded! ${GEAR.get(g.id)?.name} is now ★${g.star}.` : `Star Force failed. ${GEAR.get(g.id)?.name} stays at ★${g.star}.`);
    return ok ? "success" : "fail";
  }
  cube(uid: string): boolean {
    const g = this.findGear(uid);
    if (!g) return false;
    const cost = cubeCost(g);
    if (this.stats.meso < cost || (this.mats[4000010] ?? 0) < 5) return false;
    this.stats.meso -= cost; this.mats[4000010] -= 5;
    const up = [0.3, 0.1, 0.04, 0.015, 0][g.rarity];
    const tier = Math.random() < up;
    if (tier) g.rarity++;
    g.pot = rollPotential(GEAR.get(g.id)!.slot, Math.max(1, g.rarity));
    if (g.rarity === 0) g.rarity = 1;
    this.recalc(); this.onChange();
    this.onChat(tier ? "level" : "item", tier ? `Potential tier up! ${GEAR.get(g.id)?.name} is now ${RARITY[g.rarity]}.` : `Potential reset on ${GEAR.get(g.id)?.name}.`);
    return true;
  }

  // ------------------------------------------------------------ auction house
  ahBuy(lid: string) {
    const L = this.ah.listings.find((l) => l.lid === lid);
    if (!L) return false;
    if (this.stats.meso < L.price) { this.onChat("system", "You don't have enough mesos."); return false; }
    if (L.goods.t === "gear" && this.bag.length >= 48) { this.onChat("system", "Your Equip inventory is full."); return false; }
    this.stats.meso -= L.price;
    this.receive(L.goods);
    this.ah.listings = this.ah.listings.filter((l) => l !== L);
    this.onChat("item", `Bought ${goodsName(L.goods)} from ${L.seller} for ${L.price.toLocaleString()} mesos.`);
    this.onChange();
    return true;
  }
  receive(g: Goods) {
    if (g.t === "gear") this.addGear(g.gear);
    else if (g.t === "mat") this.mats[g.id] = (this.mats[g.id] ?? 0) + g.n;
    else this.inv[g.id] = (this.inv[g.id] ?? 0) + g.n;
  }
  ahList(goods: Goods, price: number) {
    // Remove the goods from the player's inventory first.
    if (goods.t === "gear") { const i = this.bag.findIndex((x) => x.uid === goods.gear.uid); if (i < 0) return false; this.bag.splice(i, 1); }
    else if (goods.t === "mat") { if ((this.mats[goods.id] ?? 0) < goods.n) return false; this.mats[goods.id] -= goods.n; }
    else { if ((this.inv[goods.id] ?? 0) < goods.n) return false; this.inv[goods.id] -= goods.n; }
    const fee = Math.ceil(price * 0.01);
    this.stats.meso = Math.max(0, this.stats.meso - fee);
    this.ah.mine.push({ lid: `M${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, goods, price: Math.max(1, Math.round(price)), listedAt: Date.now(), sold: false });
    this.onChat("system", `Listed ${goodsName(goods)} for ${price.toLocaleString()} mesos (fee ${fee}).`);
    this.onChange();
    return true;
  }
  ahCollect(lid: string) {
    const i = this.ah.mine.findIndex((m) => m.lid === lid);
    if (i < 0) return;
    const m = this.ah.mine[i];
    if (m.sold) { const net = Math.floor(m.price * (1 - AH_TAX)); this.stats.meso += net; this.onGain("meso", `Collected ${net.toLocaleString()} mesos from the Auction House.`); }
    else { this.receive(m.goods); this.onChat("system", `Cancelled your listing for ${goodsName(m.goods)}.`); }
    this.ah.mine.splice(i, 1);
    this.onChange();
  }

  // ------------------------------------------------------------ stages & bosses
  stageMul(n = this.stage.n) { return { hp: Math.pow(1.16, n - 1), dmg: Math.pow(1.07, n - 1), exp: Math.pow(1.11, n - 1), meso: Math.pow(1.1, n - 1) }; }
  get stageNeed() { return STAGE_KILLS; }
  bossReady() { return this.stage.kills >= STAGE_KILLS && !this.boss; }
  bossFor(n = this.stage.n) { return BOSSES[(n - 1) % BOSSES.length]; }

  async challengeBoss() {
    if (this.boss || this.bossLoading || !this.bossReady() || this.loadingMap) return;
    this.bossLoading = true;
    const id = this.bossFor();
    try {
      if (!this.mobData.has(id)) this.mobData.set(id, await json(`./data/mobs/${id}.json`));
      const data = this.mobData.get(id)!;
      await Promise.race([Promise.all(Object.values(data.books).flat().map((s) => Promise.resolve(this.assets.load(s.url)).catch(() => null))), new Promise((r) => setTimeout(r, 15000))]);
      const p = this.p;
      const ref = this.mobs.find((m) => !m.boss);
      const refHp = ref ? ref.maxHp : 100 * this.stageMul().hp;
      const x = Math.max(this.tree.minX + 60, Math.min(this.tree.maxX - 60, p.x + p.face * 260));
      const fh = this.tree.landing(x, p.y - 200, p.y + 200) ?? p.fh;
      const spawn = { id, x, y: fh ? FootholdTree.yAt(fh, x) : p.y, fh: fh?.id ?? 0, rx0: this.bounds.l + 30, rx1: this.bounds.r - 30 };
      const m = this.makeMob(spawn)!;
      m.boss = true;
      m.maxHp = m.hp = Math.round(refHp * 28 * (1 + this.stage.n * 0.04));
      m.atk = Math.round((ref?.atk ?? 15) * 2.2);
      m.mul = { exp: (ref?.mul.exp ?? 1) * 1, meso: ref?.mul.meso ?? 1 };
      m.aggro = 999; m.skillT = 3; m.alpha = 0;
      this.mobs.push(m);
      this.boss = m;
      this.bossTimer = 120;
      this.onChat("notice", `Stage ${this.stage.n} boss: ${data.name.trim()} has appeared! Defeat it within 2 minutes.`);
      this.onBoss(m);
    } finally { this.bossLoading = false; }
  }
  endBoss(won: boolean) {
    const m = this.boss;
    if (!m) return;
    this.boss = null;
    if (!won) {
      this.mobs = this.mobs.filter((x) => x !== m);
      this.onChat("notice", `${m.data.name.trim()} escaped. Gather your strength and challenge it again.`);
    } else {
      const s = this.stage;
      const ref = this.mobs.find((x) => !x.boss);
      const exp = Math.round((ref?.data.meta?.exp ?? 15) * (ref?.mul.exp ?? 1) * 18);
      this.gainExp(exp);
      for (let i = 0; i < 6; i++) this.drops.push({ x: m.x + rand(-60, 60), y: m.y - 30, vx: rand(-90, 90), vy: -rand(380, 520), fh: null, amount: Math.round(rand(20, 40) * m.mul.meso * (1 + this.gt.meso / 100)), t: 0, picked: 0 });
      const gearN = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < gearN; i++) this.drops.push({ x: m.x + rand(-40, 40), y: m.y - 30, vx: rand(-80, 80), vy: -480, fh: null, amount: 0, gear: makeGear(randomGearFor(this.stats.level + 5), 1.6, 1), t: 0, picked: 0 });
      const bm = MOB_MAT[m.data.id];
      if (bm) for (let i = 0; i < 3; i++) this.drops.push({ x: m.x + rand(-50, 50), y: m.y - 30, vx: rand(-70, 70), vy: -440, fh: null, amount: 0, mat: bm, t: 0, picked: 0 });
      for (let i = 0; i < 2; i++) this.drops.push({ x: m.x + rand(-50, 50), y: m.y - 30, vx: rand(-70, 70), vy: -440, fh: null, amount: 0, mat: ORES[Math.min(ORES.length - 1, Math.floor(s.n / 3) % ORES.length)], t: 0, picked: 0 });
      s.n++; s.kills = 0; s.best = Math.max(s.best, s.n);
      this.onChat("level", `Stage cleared! Welcome to Stage ${s.n}. Monsters grow stronger — and so do their rewards.`);
      for (const x of this.mobs) if (!x.boss) { const sc = this.stageMul(); x.maxHp = Math.round((x.data.meta?.maxHP ?? 50) * sc.hp); x.hp = Math.min(x.hp, x.maxHp); x.mul = { exp: sc.exp, meso: sc.meso }; x.atk = this.mobAtk(x.data); }
    }
    this.onBoss(null);
    this.onChange();
  }
  mobAtk(d: MobData) { return Math.max(1, (d.meta?.physicalDamage ?? 10) * 0.4 * this.stageMul().dmg); }

  /** Grants progress earned while the game was closed (auto battle at 60% efficiency, up to 12 h). */
  offlineRewards(savedAt: number) {
    const seconds = Math.min(12 * 3600, Math.max(0, (Date.now() - savedAt) / 1000));
    if (seconds < 120) return;
    const kills = Math.floor(seconds * this.idle.killRate * 0.6);
    if (kills <= 0) return;
    const exp = Math.round(kills * this.idle.expPerKill);
    const meso = Math.round(kills * this.idle.mesoPerKill);
    const mats: Record<number, number> = {};
    const mm = this.map ? [...new Set(this.map.spawns.map((s) => MOB_MAT[s.id]).filter(Boolean))] : [4000001];
    for (const id of mm) mats[id] = Math.floor((kills * 0.35) / mm.length);
    mats[ORES[Math.floor(Math.random() * 3)]] = Math.floor(kills * 0.04);
    const gear: Gear[] = [];
    for (let i = 0; i < Math.min(8, Math.floor(kills / 120)); i++) gear.push(makeGear(randomGearFor(this.stats.level), 0.4));
    this.onOffline({ seconds, kills, exp, meso, mats, gear });
  }
  claimOffline(r: { kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }, mult = 1) {
    this.stats.meso += Math.round(r.meso * mult);
    for (const [id, n] of Object.entries(r.mats)) this.mats[+id] = (this.mats[+id] ?? 0) + Math.round(n * mult);
    for (const g of r.gear) this.addGear(g);
    this.stage.kills = Math.min(STAGE_KILLS, this.stage.kills + r.kills);
    this.gainExp(Math.round(r.exp * mult));
    this.onChange();
  }

  // ------------------------------------------------------------ save data
  save() {
    return {
      v: 1, stats: this.stats, inv: this.inv, skillLv: this.skillLv, quick: this.quick, auto: this.auto, map: this.map?.id,
      mats: this.mats, bag: this.bag, eq: this.eq, stage: this.stage, idle: this.idle, ah: this.ah.save(), savedAt: Date.now(),
    };
  }
  restore(d: any) {
    if (!d || d.v !== 1) return;
    Object.assign(this.stats, d.stats ?? {});
    if (d.inv) this.inv = d.inv;
    if (d.skillLv) this.skillLv = d.skillLv;
    if (d.quick) this.quick = d.quick;
    if (d.auto) Object.assign(this.auto, d.auto, { battle: false });
    if (d.mats) this.mats = d.mats;
    if (d.bag) this.bag = d.bag.filter((g: Gear) => GEAR.has(g.id));
    if (d.eq) { this.eq = {}; for (const [k, g] of Object.entries(d.eq as Record<string, Gear>)) if (g && GEAR.has(g.id)) this.eq[k as Slot] = g; }
    if (d.stage) Object.assign(this.stage, d.stage);
    if (d.idle) Object.assign(this.idle, d.idle);
    if (d.ah) this.ah.restore(d.ah);
    this.recalc();
  }

  // ------------------------------------------------------------ rendering
  draw() {
    const r = this.r;
    r.resize();
    r.begin();
    if (!this.map) { r.end(); return; }
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    this.drawBacks(false, cx, cy);
    const mt = this.assets.get(this.map.render);
    if (mt) r.draw(mt, -this.map.renderOrigin.x - cx, -this.map.renderOrigin.y - cy);

    // Portals.
    const pf: Sprite[] = this.fxData.portal;
    if (pf?.length) {
      // Animate only through frames that have finished loading, so a slow or failed frame never blinks the portal out.
      const ready = pf.filter((f) => this.assets.get(f.url));
      if (ready.length) {
        const total = ready.reduce((n, f) => n + (f.delay ?? 100), 0);
        let t = (this.time * 1000) % total, fr = ready[0];
        for (const f of ready) { if (t < (f.delay ?? 100)) { fr = f; break; } t -= f.delay ?? 100; }
        const tex = this.assets.get(fr.url)!;
        for (const pt of this.portals) r.draw(tex, Math.round(pt.x - fr.ox - cx), Math.round(pt.y - fr.oy - cy), fr.w, fr.h);
      }
    }

    for (const m of this.mobs) this.drawMob(m, cx, cy);
    for (const d of this.drops) {
      if (d.item || d.mat || d.gear) {
        const t = this.assets.get(itemIconRaw(d.item ?? d.mat ?? d.gear!.id));
        if (t && d.gear && d.gear.rarity > 0) {
          const c = [[1, 1, 1], [0.4, 0.85, 1], [0.78, 0.49, 1], [1, 0.8, 0.2], [0.36, 1, 0.48]][d.gear.rarity];
          const pulse = 0.35 + 0.25 * Math.sin(this.time * 6);
          r.rect(Math.round(d.x - 12 - cx), Math.round(d.y - 4 - cy), 24, 4, [c[0], c[1], c[2], pulse]);
        }
        if (t) r.draw(t, Math.round(d.x - t.w / 2 - cx), Math.round(d.y - t.h - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0)), t.w, t.h, { alpha: d.picked ? 1 - d.picked * 4 : 1 });
        continue;
      }
      const fr: Sprite = this.fxData.meso[Math.floor(d.t * 8) % this.fxData.meso.length];
      const t = fr && this.assets.get(fr.url);
      if (t) r.draw(t, d.x - fr.ox - cx, d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0), fr.w, fr.h, { alpha: d.picked ? 1 - d.picked * 4 : 1 });
    }
    this.drawPlayer(cx, cy);
    for (const f of this.fx) this.drawFx(f, cx, cy);
    // Projectiles render with the skill's real effect frame when available, otherwise
    // the shared snail-shell sprite (the default basic-attack visual).
    for (const pr of this.projectiles) {
      let fr: Sprite | null = null;
      if (pr.skillId) {
        const art = this.skillArt[pr.skillId];
        if (art?.effect?.length) fr = art.effect[0];
      }
      if (!fr) fr = this.snailShell;
      if (!fr) continue;
      const st = this.assets.get(fr.url);
      if (st) r.draw(st, Math.round(pr.x - fr.w / 2 - cx), Math.round(pr.y - fr.h / 2 - cy), fr.w, fr.h, { flip: Math.floor(pr.t * 12) % 2 === 0 });
    }
    for (const m of this.mobs) this.drawMobHp(m, cx, cy);
    for (const d of this.dmg) this.drawDamage(d, cx, cy);
    this.drawBacks(true, cx, cy);
    if (this.fade > 0) r.rect(0, 0, r.width, r.height, [0, 0, 0, this.fade]);
    if (this.loadingMap) r.rect(0, 0, r.width, r.height, [0, 0, 0, 1]);
    r.end();
  }

  drawBacks(front: boolean, cx: number, cy: number) {
    const r = this.r, W = r.width, H = r.height;
    const viewx = -cx, viewy = -cy;
    const WO = W / 2, HO = H / 2;
    for (const b of this.map.backs) {
      if (b.front !== front) continue;
      const s = b.sprite, t = this.assets.get(s.url);
      if (!t) continue;
      const cxx = b.cx || s.w, cyy = b.cy || s.h;
      const hmove = b.type === 4 || b.type === 6, vmove = b.type === 5 || b.type === 7;
      const htile = [1, 3, 4, 6, 7].includes(b.type), vtile = [2, 3, 5, 6, 7].includes(b.type);
      let x = hmove ? b.x + this.time * b.rx * 5 + viewx : b.x + (b.rx * (WO - viewx)) / 100 + WO;
      let y = vmove ? b.y + this.time * b.ry * 5 + viewy : b.y + (b.ry * (HO - viewy)) / 100 + HO;
      // Convert anchor to top-left using the sprite origin.
      const ox = b.flip ? s.w - s.ox : s.ox;
      x -= ox; y -= s.oy;
      let nx = 1, ny = 1;
      if (htile) { x = ((x % cxx) + cxx) % cxx - cxx; nx = Math.ceil(W / cxx) + 2; }
      if (vtile) { y = ((y % cyy) + cyy) % cyy - cyy; ny = Math.ceil(H / cyy) + 2; }
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
        r.draw(t, Math.round(x + i * cxx), Math.round(y + j * cyy), s.w, s.h, { flip: b.flip, alpha: b.a / 255 });
    }
  }

  drawPlayer(cx: number, cy: number) {
    const p = this.p;
    const t = this.assets.get(charUrlFor(this.look, p.anim, p.frame))
      ?? (this.prevLook ? this.assets.get(charUrlFor(this.prevLook, p.anim, p.frame)) : null)
      ?? this.assets.get(charUrlFor(this.look, "stand1", 0));
    if (!t) return;
    const blink = p.invuln > 0 && Math.floor(this.time * 16) % 2 === 0;
    this.r.draw(t, Math.round(p.x - t.w / 2 - cx), Math.round(p.y - t.h / 2 - cy), t.w, t.h, { flip: p.face === 1, alpha: blink ? 0.35 : 1 });
  }

  drawMob(m: Mob, cx: number, cy: number) {
    if (m.state === "dead") return;
    const book = m.attacking ?? (m.state === "move" ? (m.data.books.move ? "move" : "stand") : m.state);
    const fr = m.data.books[book]?.[m.frame] ?? m.data.books.stand?.[0];
    if (!fr) return;
    const t = this.assets.get(fr.url);
    if (!t) return;
    const flip = m.dir === 1;
    const left = flip ? m.x - (fr.w - fr.ox) : m.x - fr.ox;
    this.r.draw(t, Math.round(left - cx), Math.round(m.y - fr.oy - cy), fr.w, fr.h, { flip, alpha: m.alpha });
  }

  drawMobHp(m: Mob, cx: number, cy: number) {
    if (m.hpShow <= 0 || m.state === "dead" || m.state === "die1") return;
    const b = this.mobBox(m);
    const w = 50, x = Math.round(m.x - w / 2 - cx), y = Math.round(b.y0 - 14 - cy);
    this.r.rect(x - 1, y - 1, w + 2, 7, [0.1, 0.1, 0.1, 0.85]);
    this.r.rect(x, y, w, 5, [0.35, 0.05, 0.05, 1]);
    this.r.rect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 5, [0.95, 0.2, 0.25, 1]);
  }

  drawFx(f: Fx, cx: number, cy: number) {
    let t = f.t, i = 0;
    while (i < f.frames.length && t > (f.frames[i].delay ?? 100)) { t -= f.frames[i].delay ?? 100; i++; }
    const fr = f.frames[i];
    if (!fr) return;
    const tex = this.assets.get(fr.url);
    if (!tex) return;
    const x = f.follow ? this.p.x : f.x, y = f.follow ? this.p.y : f.y;
    const left = f.flip ? x - (fr.w - fr.ox) : x - fr.ox;
    this.r.draw(tex, Math.round(left - cx), Math.round(y - fr.oy - cy), fr.w, fr.h, { flip: f.flip });
  }

  drawDamage(d: DmgText, cx: number, cy: number) {
    const fx = this.fxData;
    const rise = Math.min(1, d.t / 1.0) * 40;
    const alpha = d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) / 0.6) : 1;
    if (d.miss) {
      const s: Sprite = fx.miss, t = s && this.assets.get(s.url);
      if (t) this.r.draw(t, Math.round(d.x - s.w / 2 - cx), Math.round(d.y - rise - s.h - cy), s.w, s.h, { alpha });
      return;
    }
    const str = String(d.value);
    const glyphs: Sprite[] = [...str].map((c, i) => (i === 0 ? (d.hurt ? fx.hurtFirst : fx.dmgFirst)[c] : (d.hurt ? fx.hurt : fx.dmg)[c]));
    const overlap = 6;
    const total = glyphs.reduce((a, g) => a + (g?.w ?? 20) - overlap, overlap);
    let x = d.x - total / 2;
    const base = d.y - rise;
    glyphs.forEach((g, i) => {
      if (!g) return;
      const t = this.assets.get(g.url);
      if (t) this.r.draw(t, Math.round(x - cx), Math.round(base - g.h - (i === 0 ? 4 : 0) - cy), g.w, g.h, { alpha });
      x += g.w - overlap;
    });
  }
}
