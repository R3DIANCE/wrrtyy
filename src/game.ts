import { Assets, json, type Sprite } from "./assets.ts";
import type { Renderer, Tex } from "./gpu.ts";
import { FootholdTree, airMove, groundMove, type Foothold, type Ladder } from "./physics.ts";

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

const ITEMS = [2000, 12000, 20000, 30030, 1040002, 1060002, 1072001, 1302000];
const CHAR_ITEMS = encodeURIComponent(ITEMS.map((i) => JSON.stringify({ itemId: i, region: "GMS", version: "240" })).join(","));
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
interface Drop { x: number; y: number; vx: number; vy: number; fh: Foothold | null; amount: number; t: number; picked: number; ignoreFh?: number }
interface Fx { frames: Sprite[]; x: number; y: number; flip: boolean; t: number; follow?: boolean }
interface DmgText { value: number; miss: boolean; hurt: boolean; x: number; y: number; t: number }
interface Portal { x: number; y: number; to: number; side: "left" | "right" }

export interface Stats { name: string; level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number; meso: number; job: string }

export type ChatKind = "system" | "exp" | "meso" | "level" | "notice";

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

  stats: Stats = { name: "Wayfarer", level: 1, exp: 0, hp: 50, maxHp: 50, mp: 30, maxMp: 30, meso: 0, job: "Beginner" };
  potions = { red: 30, blue: 30 };

  p = {
    x: 0, y: 0, vx: 0, vy: 0, fh: null as Foothold | null, ignoreFh: undefined as number | undefined,
    face: -1 as -1 | 1, anim: "stand1", frame: 0, ft: 0,
    ladder: null as Ladder | null, attack: 0, attackAnim: "swingO1", hitDone: false, skill: false,
    invuln: 0, prone: false, alert: 0, regen: 0, dead: false,
  };

  keys = new Set<string>();
  pressed = new Set<string>();

  constructor(public r: Renderer) {
    this.assets = new Assets(r);
  }

  async init(startMap: number) {
    this.fxData = await json("./data/fx.json");
    // Warm up character frames (rendered server-side, so they can be slow the first time).
    const loads: Promise<unknown>[] = [];
    for (const [a, fr] of Object.entries(ANIMS)) fr.forEach((_, i) => loads.push(this.assets.load(charUrl(a, i))));
    const fxs = [this.fxData.dmg, this.fxData.dmgFirst, this.fxData.hurt, this.fxData.hurtFirst].flatMap((o: any) => Object.values(o));
    for (const s of [...fxs, ...this.fxData.meso, ...this.fxData.portal, this.fxData.miss] as Sprite[]) if (s) loads.push(this.assets.load(s.url));
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
  down(...k: string[]) { return k.some((x) => this.keys.has(x)); }
  hit(...k: string[]) { return k.some((x) => this.pressed.has(x)); }

  // ------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    if (this.loadingMap || !this.map) { this.pressed.clear(); return; }
    this.fade = Math.max(0, this.fade - dt * 2.5);
    this.updatePlayer(dt);
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
  }

  updatePlayer(dt: number) {
    const p = this.p, s = this.stats, tree = this.tree;
    p.invuln = Math.max(0, p.invuln - dt);
    p.alert = Math.max(0, p.alert - dt);
    p.regen += dt;
    if (p.regen > 6) { p.regen = 0; s.hp = Math.min(s.maxHp, s.hp + 5 + s.level); s.mp = Math.min(s.maxMp, s.mp + 3 + s.level); }

    const left = this.down("ArrowLeft"), right = this.down("ArrowRight");
    const up = this.down("ArrowUp"), downK = this.down("ArrowDown");
    const jump = this.hit("Alt", "c", "C", " ");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    // Consumables.
    if (this.hit("Delete", "1") && this.potions.red > 0 && s.hp < s.maxHp) { this.potions.red--; s.hp = Math.min(s.maxHp, s.hp + 50); }
    if (this.hit("End", "2") && this.potions.blue > 0 && s.mp < s.maxMp) { this.potions.blue--; s.mp = Math.min(s.maxMp, s.mp + 100); }

    // Pick up.
    if (this.down("z", "Z")) {
      for (const d of this.drops) {
        if (d.picked || !d.fh) continue;
        if (Math.abs(d.x - p.x) < 40 && Math.abs(d.y - p.y) < 40) {
          d.picked = 0.001; s.meso += d.amount;
          this.onChat("meso", `You have gained mesos (+${d.amount})`);
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
      if (!p.hitDone && p.attack < 0.45) { p.hitDone = true; this.resolveAttack(p.skill); }
    } else if (!p.ladder) {
      const skill = this.hit("Shift", "a", "A");
      if (this.hit("Control", "x", "X") || (skill && s.mp >= 8)) {
        if (skill) s.mp -= 8;
        p.skill = skill;
        p.attack = 0.8; p.hitDone = false; p.alert = 3;
        p.attackAnim = skill ? "swingO2" : "swingO1";
        p.frame = 0; p.ft = 0;
        if (skill) this.fx.push({ frames: this.fxData.slashBlast, x: p.x, y: p.y, flip: p.face === 1, t: 0, follow: true });
      }
    }

    // Ladders & ropes.
    if (p.ladder) {
      const L = p.ladder;
      const vy = (downK ? 1 : 0) - (up ? 1 : 0);
      p.y += vy * CLIMB * dt;
      p.x = L.x;
      if (jump && dir !== 0) { p.ladder = null; p.vx = dir * WALK * 0.8; p.vy = -JUMP * 0.55; p.face = dir as -1 | 1; }
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
        p.fh = null; p.vy = -JUMP; p.vx = dir * WALK;
      }
    }

    if (p.fh) {
      const canMove = p.attack <= 0 && !downK;
      const target = canMove ? dir * WALK : 0;
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
      if (dir !== 0) { p.vx += dir * 300 * dt; p.vx = Math.max(-WALK, Math.min(WALK, p.vx)); if (p.attack <= 0) p.face = dir as -1 | 1; }
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

  resolveAttack(skill: boolean) {
    const p = this.p;
    const range = skill ? 170 : 90;
    const x0 = p.face === 1 ? p.x - 10 : p.x - range, x1 = p.face === 1 ? p.x + range : p.x + 10;
    const y0 = p.y - (skill ? 90 : 70), y1 = p.y + 10;
    const targets = this.mobs
      .filter((m) => m.state !== "die1" && m.state !== "dead")
      .filter((m) => { const b = this.mobBox(m); return b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1; })
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
      .slice(0, skill ? 6 : 1);
    for (const m of targets) {
      const atk = 22 + this.stats.level * 5;
      const miss = !skill && Math.random() < 0.05;
      const dmg = miss ? 0 : Math.max(1, Math.round(atk * rand(0.8, 1.25) * (skill ? 1.6 : 1)));
      this.damageMob(m, dmg, miss);
      if (skill) this.fx.push({ frames: this.fxData.slashHit, x: m.x, y: m.y - 25, flip: p.face === 1, t: 0 });
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
      s.maxHp += Math.round(rand(14, 20)); s.maxMp += Math.round(rand(8, 12));
      s.hp = s.maxHp; s.mp = s.maxMp;
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
        const dmg = Math.max(1, Math.round(base * 0.4 * rand(0.8, 1.2) - this.stats.level * 0.5));
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
      const fr: Sprite = this.fxData.meso[Math.floor(d.t * 8) % this.fxData.meso.length];
      const t = fr && this.assets.get(fr.url);
      if (t) r.draw(t, d.x - fr.ox - cx, d.y - fr.oy - cy - (d.fh ? Math.abs(Math.sin(d.t * 3)) * 3 : 0), fr.w, fr.h, { alpha: d.picked ? 1 - d.picked * 4 : 1 });
    }
    this.drawPlayer(cx, cy);
    for (const f of this.fx) this.drawFx(f, cx, cy);
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
