import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";
import { DEFAULT_QUICK, ITEMS, SKILL, SKILL_DEFS, itemIconRaw, type Action, type SkillArt, type SkillDef } from "./skills.ts";

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

const CHAR_EQUIP = [2000, 12000, 20000, 30030, 1040002, 1060002, 1072001, 1302000];
const CHAR_ITEMS = encodeURIComponent(CHAR_EQUIP.map((i) => JSON.stringify({ itemId: i, region: "GMS", version: "240" })).join(","));
const charUrl = (anim: string, f: number) => `https://maplestory.io/api/character/${CHAR_ITEMS}/${anim}/${f}?renderMode=4`;
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
}
interface Drop { x: number; y: number; vx: number; vy: number; fh: Foothold | null; amount: number; item?: number; t: number; picked: number; ignoreFh?: number }
interface Projectile { x: number; y: number; target: Mob; dmg: number; miss: boolean; t: number }
interface Fx { frames: Sprite[]; x: number; y: number; flip: boolean; t: number; follow?: boolean }
interface DmgText { value: number; miss: boolean; hurt: boolean; x: number; y: number; t: number }
interface Portal { x: number; y: number; to: number; side: "left" | "right" }

export interface Stats {
  name: string; level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number; meso: number; job: string;
  str: number; dex: number; int: number; luk: number; ap: number; sp: number; baseHp: number; baseMp: number; fame: number;
}
export interface AutoSettings { battle: boolean; hp: boolean; hpPct: number; mp: boolean; mpPct: number; buff: boolean; loot: boolean; ap: boolean }

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
  onMapChange: (m: MapData) => void = () => {};

  stats: Stats = {
    name: "Wayfarer", level: 1, exp: 0, hp: 50, maxHp: 50, mp: 30, maxMp: 30, meso: 0, job: "Warrior",
    str: 12, dex: 5, int: 4, luk: 4, ap: 0, sp: 2, baseHp: 50, baseMp: 30, fame: 0,
  };
  inv: Record<number, number> = { 2000000: 30, 2000001: 10, 2000002: 5, 2000003: 30, 2000006: 5 };
  skillLv: Record<string, number> = { "1001005": 1, "0001000": 1 };
  skillArt: Record<string, SkillArt> = {};
  snailShell: Sprite | null = null;
  buffs: Record<string, { left: number; dur: number }> = {};
  quick: Record<string, Action | null> = { ...DEFAULT_QUICK };
  auto: AutoSettings = { battle: false, hp: true, hpPct: 50, mp: true, mpPct: 30, buff: true, loot: true, ap: true };
  balloon = { text: "", t: 0 };
  projectiles: Projectile[] = [];
  potCd = 0;
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
    for (const [a, fr] of Object.entries(ANIMS)) fr.forEach((_, i) => loads.push(this.assets.load(charUrl(a, i))));
    const fxs = [this.fxData.dmg, this.fxData.dmgFirst, this.fxData.hurt, this.fxData.hurtFirst].flatMap((o: any) => Object.values(o));
    for (const s of [...fxs, ...this.fxData.meso, ...this.fxData.portal, this.fxData.miss] as Sprite[]) if (s) loads.push(this.assets.load(s.url));
    for (const a of Object.values(this.skillArt)) for (const f of [...a.effect, ...a.effect0, ...a.hit]) this.assets.load(f.url);
    await this.loadMap(startMap, "spawn");
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 25000))]);
  }

  // ------------------------------------------------------------ map loading
  async loadMap(id: number, arrive: "spawn" | "left" | "right") {
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
    const maxHp = data.meta?.maxHP ?? 50;
    return {
      data, spawn: s, x: s.x, y: fh ? FootholdTree.yAt(fh, s.x) : s.y, vx: 0, vy: 0, fh,
      dir: Math.random() < 0.5 ? -1 : 1, state: "stand", t: rand(0.5, 2.5), anim: 0, frame: 0,
      hp: maxHp, maxHp, aggro: 0, hpShow: 0, respawn: 0, alpha: 1,
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
  totalStr() { return this.stats.str + this.lv("1100009") * 4; }
  totalDex() { return this.stats.dex + this.lv("1100009") * 4; }
  watk() { return 17 + (this.buffs["1101006"] ? this.lv("1101006") * 2 : 0); }
  maxDamage() { return Math.max(1, ((4 * this.totalStr() + this.totalDex()) * this.watk()) / 40); }
  mastery() { return Math.min(0.9, 0.15 + this.lv("1100000") * 0.05); }
  damageRange() { const mx = this.maxDamage(); return [Math.max(1, Math.floor(mx * this.mastery())), Math.floor(mx)]; }
  speed() { return WALK * (1 + (this.buffs["0001002"] ? this.lv("0001002") * 0.1 : 0) + this.lv("1000009") * 0.01); }
  jobFor(level: number) { return level >= 20 ? "Crusader" : level >= 10 ? "Fighter" : "Warrior"; }
  recalc() {
    const s = this.stats;
    s.maxHp = Math.round(s.baseHp * (1 + this.lv("1000009") * 0.03));
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
    const s = this.stats;
    while (s.ap > 0) { if (s.dex < 4 + s.level) this.addStat("dex"); else this.addStat("str"); }
  }
  canLearn(id: string) {
    const d = SKILL[id];
    return !!d && this.stats.sp > 0 && this.stats.level >= d.reqLevel && this.lv(id) < d.maxLevel;
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
      p.vy = -JUMP * 0.7; p.vx = p.face * this.speed() * (1.9 + lv * 0.04);
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
    if (this.auto.buff && this.p.attack <= 0 && !this.p.ladder) {
      for (const d of SKILL_DEFS) {
        if (d.kind !== "buff" || this.lv(d.id) <= 0) continue;
        const b = this.buffs[d.id];
        if ((!b || b.left < 3) && s.mp >= d.mp(this.lv(d.id)) + 10) { this.useAction({ t: "skill", id: d.id }, true); break; }
      }
    }
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

  /** Picks the best attack for the mobs in front of the player. */
  bestAttack(dir: -1 | 1): { id: string | null; range: number } {
    const s = this.stats, p = this.p;
    let best: { id: string | null; range: number; score: number } = { id: null, range: 85, score: 1 };
    for (const d of SKILL_DEFS) {
      const lv = this.lv(d.id);
      if ((d.kind !== "attack" && d.kind !== "ranged") || lv <= 0 || s.mp < d.mp(lv)) continue;
      const range = d.range ?? 90;
      const n = this.liveMobs().filter((m) => Math.abs(m.y - p.y) < 70 && (m.x - p.x) * dir > -20 && Math.abs(m.x - p.x) < range).length;
      const score = Math.min(n, d.targets ?? 1) * (d.dmg!(lv) / 100) * (d.hits ?? 1) + (n ? 0.01 * range : 0);
      if (score > best.score) best = { id: d.id, range, score };
    }
    return best;
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
    if (!ai.target || ai.target.state === "dead" || ai.target.state === "die1" || ai.think <= 0) {
      ai.think = 0.6;
      let best: Mob | null = null, bs = Infinity;
      for (const m of alive) {
        const sc = Math.abs(m.x - p.x) + Math.abs(m.y - p.y) * 2.5;
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
          if (d.item) {
            this.inv[d.item] = (this.inv[d.item] ?? 0) + 1;
            this.onChat("item", `You have gained an item (${ITEMS[d.item]?.name ?? d.item})`);
          } else {
            s.meso += d.amount;
            this.onChat("meso", `You have gained mesos (+${d.amount})`);
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
      if (jump && !downK && this.lv("1001008") > 0) { if (dir !== 0) p.face = dir as -1 | 1; this.useAction({ t: "skill", id: "1001008" }, true); }
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
    return { dmg: Math.max(1, Math.round(rand(lo, hi) * pct / 100 - def)), miss: false };
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
      const m = targets[0];
      if (m) { const r = this.rollDamage(pct, m); this.projectiles.push({ x: p.x + p.face * 20, y: p.y - 35, target: m, dmg: r.dmg, miss: r.miss, t: 0 }); }
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
      const exp = m.data.meta?.exp ?? 5;
      this.gainExp(exp);
      const roll = Math.random();
      if (roll < 0.14) {
        const pool = [2000000, 2000000, 2000000, 2000003, 2000003, 2000001, 2000002, 2000006];
        this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-40, 40), vy: -380, fh: null, amount: 0, item: pool[Math.floor(Math.random() * pool.length)], t: 0, picked: 0 });
      }
      if (Math.random() < 0.75) {
        const lv = m.data.meta?.level ?? 5;
        this.drops.push({ x: m.x, y: m.y - 20, vx: rand(-40, 40), vy: -380, fh: null, amount: Math.round(rand(lv * 1.5, lv * 3.5)), t: 0, picked: 0 });
      }
    } else {
      m.state = "hit1"; m.t = 0.5; m.anim = 0; m.frame = 0;
      if (m.fh) groundMove(this.tree, m, this.p.face * 14, true);
    }
  }

  gainExp(n: number) {
    const s = this.stats;
    s.exp += n;
    this.onChat("exp", `You have gained experience (+${n})`);
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
      this.onChat("level", `Congratulations! You have reached Level ${s.level}.`);
    }
  }

  checkMobContact() {
    const p = this.p;
    if (p.invuln > 0) return;
    for (const m of this.mobs) {
      if (m.state === "die1" || m.state === "dead" || m.alpha < 1) continue;
      const b = this.mobBox(m);
      if (p.x + 12 > b.x0 && p.x - 12 < b.x1 && p.y > b.y0 + 6 && p.y - 60 < b.y1) {
        const base = m.data.meta?.physicalDamage ?? 10;
        const reduce = 1 - this.lv("1000003") * 0.02;
        const dmg = Math.max(1, Math.round((base * 0.4 * rand(0.8, 1.2) - this.stats.level * 0.5) * reduce));
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

  die() {
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

  updateDrops(dt: number) {
    for (const d of this.drops) {
      d.t += dt;
      if (d.picked) { d.picked += dt; d.x += (this.p.x - d.x) * Math.min(1, dt * 12); d.y += (this.p.y - 30 - d.y) * Math.min(1, dt * 12); continue; }
      if (!d.fh) { airMove(this.tree, d, dt); if (d.fh) d.vx = 0; }
    }
    this.drops = this.drops.filter((d) => (d.picked ? d.picked < 0.25 : d.t < 60));
  }

  // ------------------------------------------------------------ save data
  save() {
    return { v: 1, stats: this.stats, inv: this.inv, skillLv: this.skillLv, quick: this.quick, auto: this.auto, map: this.map?.id };
  }
  restore(d: any) {
    if (!d || d.v !== 1) return;
    Object.assign(this.stats, d.stats ?? {});
    if (d.inv) this.inv = d.inv;
    if (d.skillLv) this.skillLv = d.skillLv;
    if (d.quick) this.quick = d.quick;
    if (d.auto) Object.assign(this.auto, d.auto, { battle: false });
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
      const fr = pf[Math.floor(this.time * 10) % pf.length];
      const t = this.assets.get(fr.url);
      for (const pt of this.portals) if (t) r.draw(t, pt.x - fr.ox - cx, pt.y - fr.oy - cy);
    }

    for (const m of this.mobs) this.drawMob(m, cx, cy);
    for (const d of this.drops) {
      if (d.item) {
        const t = this.assets.get(itemIconRaw(d.item));
        if (t) r.draw(t, Math.round(d.x - t.w / 2 - cx), Math.round(d.y - t.h - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0)), t.w, t.h, { alpha: d.picked ? 1 - d.picked * 4 : 1 });
        continue;
      }
      const fr: Sprite = this.fxData.meso[Math.floor(d.t * 8) % this.fxData.meso.length];
      const t = fr && this.assets.get(fr.url);
      if (t) r.draw(t, d.x - fr.ox - cx, d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0), fr.w, fr.h, { alpha: d.picked ? 1 - d.picked * 4 : 1 });
    }
    this.drawPlayer(cx, cy);
    for (const f of this.fx) this.drawFx(f, cx, cy);
    const sh = this.snailShell, st = sh && this.assets.get(sh.url);
    if (st) for (const pr of this.projectiles) r.draw(st, Math.round(pr.x - sh!.w / 2 - cx), Math.round(pr.y - sh!.h / 2 - cy), sh!.w, sh!.h, { flip: Math.floor(pr.t * 12) % 2 === 0 });
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
    const t = this.assets.get(charUrl(p.anim, p.frame)) ?? this.assets.get(charUrl("stand1", 0));
    if (!t) return;
    const blink = p.invuln > 0 && Math.floor(this.time * 16) % 2 === 0;
    this.r.draw(t, Math.round(p.x - t.w / 2 - cx), Math.round(p.y - t.h / 2 - cy), t.w, t.h, { flip: p.face === 1, alpha: blink ? 0.35 : 1 });
  }

  drawMob(m: Mob, cx: number, cy: number) {
    if (m.state === "dead") return;
    const book = m.state === "move" ? (m.data.books.move ? "move" : "stand") : m.state;
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
