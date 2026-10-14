// MapleStory-style foothold physics. Footholds are line segments chained via prev/next.
// A foothold with x1 < x2 is a floor you can stand on; x1 === x2 is a wall.

export interface Foothold { id: number; x1: number; y1: number; x2: number; y2: number; prev: number; next: number; layer: number; group: number }
export interface Ladder { x: number; y1: number; y2: number; isLadder: boolean }

export const GRAVITY = 2000;
export const MAX_FALL = 670;

export class FootholdTree {
  byId = new Map<number, Foothold>();
  floors: Foothold[] = [];
  walls: Foothold[] = [];
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;

  constructor(list: Foothold[]) {
    for (const f of list) {
      this.byId.set(f.id, f);
      if (f.x1 === f.x2) this.walls.push(f);
      else if (f.x1 < f.x2) this.floors.push(f);
      this.minX = Math.min(this.minX, f.x1, f.x2); this.maxX = Math.max(this.maxX, f.x1, f.x2);
      this.minY = Math.min(this.minY, f.y1, f.y2); this.maxY = Math.max(this.maxY, f.y1, f.y2);
    }
  }

  static yAt(f: Foothold, x: number) {
    if (f.x2 === f.x1) return f.y1;
    return f.y1 + ((x - f.x1) / (f.x2 - f.x1)) * (f.y2 - f.y1);
  }

  /** Highest floor whose surface is crossed while moving from y0 down to y1 at x. */
  landing(x: number, y0: number, y1: number, ignore?: number): Foothold | null {
    let best: Foothold | null = null, by = Infinity;
    for (const f of this.floors) {
      if (x < f.x1 || x > f.x2 || f.id === ignore) continue;
      const gy = FootholdTree.yAt(f, x);
      if (gy >= y0 - 1 && gy <= y1 + 0.5 && gy < by) { by = gy; best = f; }
    }
    return best;
  }

  /** First floor directly below (x, y). */
  below(x: number, y: number, ignore?: number): Foothold | null {
    return this.landing(x, y + 2, y + 2000, ignore);
  }

  /** Clamp horizontal movement against walls spanning the body. */
  wallClamp(x0: number, x1: number, y: number): number {
    for (const w of this.walls) {
      const top = Math.min(w.y1, w.y2), bot = Math.max(w.y1, w.y2);
      if (y <= top + 1 || y - 40 > bot) continue;
      if (x0 <= w.x1 && x1 > w.x1) x1 = w.x1 - 0.01;
      else if (x0 >= w.x1 && x1 < w.x1) x1 = w.x1 + 0.01;
    }
    return Math.max(this.minX + 10, Math.min(this.maxX - 10, x1));
  }
}

export interface Body {
  x: number; y: number; vx: number; vy: number;
  fh: Foothold | null;
  ignoreFh?: number;
}

/**
 * Move a body along its foothold chain. Returns false if it walked off an edge
 * (the body becomes airborne) and "blocked" if a wall or chain end stopped it
 * (when `stopAtEdges` is set, used for monsters).
 */
export function groundMove(tree: FootholdTree, b: Body, dx: number, stopAtEdges = false): "ok" | "air" | "blocked" {
  let f = b.fh!;
  let x = b.x + dx;
  for (let guard = 0; guard < 16; guard++) {
    if (x > f.x2) {
      const n = f.next ? tree.byId.get(f.next) : undefined;
      if (!n) { if (stopAtEdges) { b.x = f.x2; b.y = f.y2; return "blocked"; } b.x = x; b.fh = null; return "air"; }
      if (n.x1 === n.x2) {
        // Wall: rising walls block, dropping walls are edges.
        if (n.y2 < n.y1 || stopAtEdges) { b.x = f.x2 - 0.01; b.y = FootholdTree.yAt(f, b.x); return "blocked"; }
        b.x = x; b.fh = null; return "air";
      }
      f = n;
    } else if (x < f.x1) {
      const p = f.prev ? tree.byId.get(f.prev) : undefined;
      if (!p) { if (stopAtEdges) { b.x = f.x1; b.y = f.y1; return "blocked"; } b.x = x; b.fh = null; return "air"; }
      if (p.x1 === p.x2) {
        if (p.y1 > p.y2 || stopAtEdges) { b.x = f.x1 + 0.01; b.y = FootholdTree.yAt(f, b.x); return "blocked"; }
        b.x = x; b.fh = null; return "air";
      }
      f = p;
    } else break;
  }
  b.fh = f;
  b.x = x;
  b.y = FootholdTree.yAt(f, x);
  return "ok";
}

/** Integrate an airborne body; lands it on a floor if it crosses one. */
export function airMove(tree: FootholdTree, b: Body, dt: number) {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  const nx = tree.wallClamp(b.x, b.x + b.vx * dt, b.y);
  const ny = b.y + b.vy * dt;
  if (b.vy > 0) {
    const land = tree.landing(nx, b.y, ny, b.ignoreFh);
    if (land) {
      b.x = nx; b.y = FootholdTree.yAt(land, nx); b.vy = 0; b.fh = land; b.ignoreFh = undefined;
      return true;
    }
  }
  if (b.ignoreFh !== undefined) {
    const f = tree.byId.get(b.ignoreFh);
    if (f && ny > Math.max(f.y1, f.y2) + 4) b.ignoreFh = undefined;
  }
  b.x = nx; b.y = ny;
  if (b.y > tree.maxY + 600) { b.y = tree.minY - 100; b.vy = 0; } // safety net
  return false;
}
