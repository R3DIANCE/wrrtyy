// CPU mirror of the GPU terrain functions (src/terrain.wgsl).
// Both sides use the same integer hash so the world is identical on CPU and GPU.

export function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(s | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function h01(x: number, y: number, s: number): number {
  return (hash(x, y, s) & 0xffffff) / 16777215;
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Value noise on a lattice with cell size C (world units). */
export function vn(x: number, y: number, C: number, s: number): number {
  const gx = x / C, gy = y / C;
  const cx = Math.floor(gx), cy = Math.floor(gy);
  const ux = fade(gx - cx), uy = fade(gy - cy);
  const a = h01(cx, cy, s), b = h01(cx + 1, cy, s), c = h01(cx, cy + 1, s), d = h01(cx + 1, cy + 1, s);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function height(x: number, y: number, seed: number): number {
  const h =
    0.35 * vn(x, y, 1024, seed) +
    0.29 * vn(x, y, 256, seed + 1) +
    0.19 * vn(x, y, 64, seed + 2) +
    0.11 * vn(x, y, 16, seed + 3) +
    0.06 * vn(x, y, 4, seed + 4);
  return clamp01((h - 0.5) * 1.9 + 0.5);
}

export function moisture(x: number, y: number, seed: number): number {
  const m = 0.5 * vn(x, y, 512, seed + 10) + 0.3 * vn(x, y, 128, seed + 11) + 0.2 * vn(x, y, 32, seed + 12);
  return clamp01((m - 0.5) * 1.8 + 0.5);
}

export const WATER = 0.45;
export const DEEP = 0.38;

export enum Biome {
  Deep, Shallow, Beach, Desert, Grassland, Forest, Highlands, Snow, Marsh,
}

export const BIOME_NAMES = [
  "Open Sea", "Shallows", "Coast", "Dunes", "Meadows", "Old Forest", "Highlands", "Snowcaps", "Fen",
];

// Keep in sync with terrain.wgsl palette.
export const BIOME_COLORS: [number, number, number][] = [
  [31, 78, 107], [63, 138, 160], [226, 207, 154], [217, 183, 120], [139, 170, 94],
  [79, 125, 58], [138, 130, 115], [238, 241, 242], [108, 138, 90],
];

export function biomeOf(h: number, m: number): Biome {
  if (h < DEEP) return Biome.Deep;
  if (h < WATER) return Biome.Shallow;
  if (h < 0.47) return Biome.Beach;
  if (h > 0.82) return Biome.Snow;
  if (h > 0.7) return Biome.Highlands;
  if (h < 0.53 && m > 0.68) return Biome.Marsh;
  if (m < 0.32) return Biome.Desert;
  if (m > 0.55) return Biome.Forest;
  return Biome.Grassland;
}

export function biomeAt(x: number, y: number, seed: number): Biome {
  return biomeOf(height(x, y, seed), moisture(x, y, seed));
}

/** Movement speed multiplier for terrain. 0 = impassable. */
export function terrainSpeed(b: Biome): number {
  switch (b) {
    case Biome.Deep: return 0;
    case Biome.Shallow: return 0.45;
    case Biome.Marsh: return 0.6;
    case Biome.Snow: return 0.65;
    case Biome.Forest: return 0.85;
    case Biome.Desert: return 0.9;
    default: return 1;
  }
}

// ---------- Points of interest ----------

export const RELIC_CHUNK = 32;
export const LANDMARK_REGION = 160;

export interface Relic { key: string; x: number; y: number }
export interface Landmark { key: string; x: number; y: number; name: string }

export function relicInChunk(cx: number, cy: number, seed: number): Relic | null {
  if (h01(cx, cy, seed + 101) > 0.55) return null;
  const x = cx * RELIC_CHUNK + 4 + h01(cx, cy, seed + 102) * (RELIC_CHUNK - 8);
  const y = cy * RELIC_CHUNK + 4 + h01(cx, cy, seed + 103) * (RELIC_CHUNK - 8);
  const h = height(x, y, seed);
  if (h < 0.47 || h > 0.82) return null;
  return { key: `${cx},${cy}`, x, y };
}

const SYL_A = ["Ash", "Thorn", "Mire", "Glen", "Hollow", "Raven", "Stone", "Ember", "Frost", "Wyn", "Dusk", "Briar", "Cinder", "Gale", "Moss", "Iron", "Sable", "Tide"];
const SYL_B = ["mere", "hold", "watch", "fell", "reach", "spire", "gate", "barrow", "crest", "ford", "henge", "wick", "moor", "cairn"];
const PREFIX = ["The", "Old", "Lost", "Silent", "Sunken", "High", "Broken", "Elder"];

export function landmarkInRegion(rx: number, ry: number, seed: number): Landmark | null {
  if (h01(rx, ry, seed + 201) > 0.75) return null;
  // Try a few positions until one lands on dry ground.
  for (let i = 0; i < 6; i++) {
    const x = rx * LANDMARK_REGION + 20 + h01(rx, ry, seed + 210 + i) * (LANDMARK_REGION - 40);
    const y = ry * LANDMARK_REGION + 20 + h01(rx, ry, seed + 220 + i) * (LANDMARK_REGION - 40);
    const h = height(x, y, seed);
    if (h >= 0.48 && h <= 0.78) {
      const a = SYL_A[hash(rx, ry, seed + 230) % SYL_A.length];
      const b = SYL_B[hash(rx, ry, seed + 231) % SYL_B.length];
      const p = PREFIX[hash(rx, ry, seed + 232) % PREFIX.length];
      return { key: `${rx},${ry}`, x, y, name: `${p} ${a}${b}` };
    }
  }
  return null;
}

/** Find a dry, walkable spawn point near the origin. */
export function findSpawn(seed: number): { x: number; y: number } {
  for (let r = 0; r < 4000; r += 8) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      const b = biomeAt(x, y, seed);
      if (b === Biome.Grassland || b === Biome.Forest) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
