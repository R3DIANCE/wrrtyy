// Gear (rarity, potential, star force), materials, crafting recipes and market prices.

export type Slot =
  | "weapon" | "hat" | "top" | "bottom" | "shoes" | "gloves" | "shield" | "cape" | "earrings"
  | "pendant" | "ring1" | "ring2" | "ring3" | "ring4" | "shoulder" | "belt" | "pocket" | "emblem" | "badge"
  | "face" | "eye";

/** Equip destination sockets in the order they appear in the Equipment panel (left to right). */
export const SLOTS: Slot[] = [
  "hat", "earrings", "ring1", "pendant", "weapon", "top", "bottom", "shield",
  "cape", "gloves", "shoes", "ring2", "ring3", "ring4", "shoulder", "belt", "pocket", "emblem", "badge",
  "face", "eye",
];

export const SLOT_NAME: Record<Slot, string> = {
  weapon: "Weapon", hat: "Hat", top: "Top", bottom: "Bottom", shoes: "Shoes", gloves: "Gloves", shield: "Shield",
  cape: "Cape", earrings: "Earrings", pendant: "Pendant", ring1: "Ring 1", ring2: "Ring 2", ring3: "Ring 3", ring4: "Ring 4",
  shoulder: "Shoulder", belt: "Belt", pocket: "Pocket", emblem: "Emblem", badge: "Badge",
  face: "Face Accessory", eye: "Eye Accessory",
};

/** The item-category name behind each socket (rings share a pool). */
export const SLOT_CATEGORY: Partial<Record<Slot, "ring">> = {
  ring1: "ring", ring2: "ring", ring3: "ring", ring4: "ring",
};
export const slotCategory = (s: Slot) => SLOT_CATEGORY[s] ?? (s as string);

export interface GearBase { id: number; name: string; slot: string; req: number; watk: number; str: number; dex: number; int: number; luk: number; hp: number; def: number; price: number; cosmetic?: boolean }

export interface Potential { stat: "att" | "str" | "dex" | "int" | "luk" | "hp" | "boss" | "meso" | "drop" | "exp"; pct: number }
export interface Gear { uid: string; id: number; rarity: number; star: number; pot: Potential[] }

export const RARITY = ["Normal", "Rare", "Epic", "Unique", "Legendary"];
export const RARITY_COLOR = ["#ffffff", "#66d9ff", "#c77dff", "#ffcc33", "#5cff7a"];
/** Darker variants for text on light window backgrounds. */
export const RARITY_INK = ["#333333", "#0f7fb3", "#7a32c2", "#a87400", "#12893a"];
export const MAX_STAR = 15;

// Starter look (also real equips) plus everything gathered from maplestory.io.
const STARTER: GearBase[] = [
  { id: 1302000, name: "Sword", slot: "weapon", req: 0, watk: 17, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 50 },
  { id: 1040002, name: "White Undershirt", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 3, price: 30 },
  { id: 1060002, name: "Blue Jean Shorts", slot: "bottom", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 30 },
  { id: 1072001, name: "Red Rubber Boots", slot: "shoes", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 30 },
];

export const COSMETICS: GearBase[] = [
  // Transparent cosmetics
  { id: 1002140, name: "Transparent Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1042003, name: "Transparent Top", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1062007, name: "Transparent Bottom", slot: "bottom", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1072153, name: "Transparent Shoes", slot: "shoes", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1082149, name: "Transparent Gloves", slot: "gloves", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1102039, name: "Transparent Cape", slot: "cape", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  
  // Hats & Bandanas & Ears
  { id: 1002008, name: "Green Bandana", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 3, price: 500, cosmetic: true },
  { id: 1002057, name: "White Bandana", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 1, luk: 1, hp: 10, def: 4, price: 500, cosmetic: true },
  { id: 1002058, name: "Black Bandana", slot: "hat", req: 0, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 15, def: 5, price: 800, cosmetic: true },
  { id: 1002064, name: "Red Bandana", slot: "hat", req: 0, watk: 0, str: 2, dex: 0, int: 0, luk: 0, hp: 10, def: 3, price: 500, cosmetic: true },
  { id: 1002186, name: "Red Beret", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 1, luk: 1, hp: 20, def: 8, price: 1200, cosmetic: true },
  { id: 1002274, name: "Chief Stan Hat", slot: "hat", req: 0, watk: 0, str: 3, dex: 3, int: 0, luk: 0, hp: 30, def: 12, price: 2000, cosmetic: true },
  { id: 1003112, name: "Bunny Ears", slot: "hat", req: 0, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 50, def: 10, price: 3000, cosmetic: true },
  { id: 1002798, name: "Fox Ears", slot: "hat", req: 0, watk: 0, str: 3, dex: 3, int: 3, luk: 3, hp: 45, def: 12, price: 3500, cosmetic: true },
  { id: 1002419, name: "Angelic Halo", slot: "hat", req: 0, watk: 2, str: 4, dex: 4, int: 4, luk: 4, hp: 80, def: 15, price: 5000, cosmetic: true },
  { id: 1002067, name: "Skull Cap", slot: "hat", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 15, def: 5, price: 600, cosmetic: true },
  { id: 1002175, name: "Cat Hat", slot: "hat", req: 0, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 35, def: 10, price: 2500, cosmetic: true },

  // Tops & Casual
  { id: 1040004, name: "Blue Sailor Shirt", slot: "top", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 6, price: 400, cosmetic: true },
  { id: 1040008, name: "Orange T-Shirt", slot: "top", req: 0, watk: 0, str: 1, dex: 0, int: 0, luk: 1, hp: 10, def: 5, price: 350, cosmetic: true },
  { id: 1040014, name: "Striped T-Shirt", slot: "top", req: 0, watk: 0, str: 0, dex: 1, int: 1, luk: 0, hp: 10, def: 5, price: 350, cosmetic: true },
  { id: 1040036, name: "Red Cross Shirt", slot: "top", req: 0, watk: 0, str: 2, dex: 1, int: 0, luk: 0, hp: 20, def: 8, price: 800, cosmetic: true },
  { id: 1050018, name: "Bath Towel (M)", slot: "top", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 50, def: 10, price: 1500, cosmetic: true },
  { id: 1050037, name: "Red Kimono", slot: "top", req: 0, watk: 1, str: 3, dex: 3, int: 0, luk: 0, hp: 40, def: 15, price: 2800, cosmetic: true },

  // Bottoms
  { id: 1060006, name: "Denim Jeans", slot: "bottom", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 5, price: 400, cosmetic: true },
  { id: 1060014, name: "Blue Jean Pants", slot: "bottom", req: 0, watk: 0, str: 1, dex: 0, int: 0, luk: 1, hp: 10, def: 5, price: 400, cosmetic: true },
  { id: 1060026, name: "Camo Pants", slot: "bottom", req: 0, watk: 0, str: 2, dex: 1, int: 0, luk: 0, hp: 15, def: 8, price: 800, cosmetic: true },

  // Shoes
  { id: 1072005, name: "Red High Tops", slot: "shoes", req: 0, watk: 0, str: 1, dex: 1, int: 0, luk: 0, hp: 10, def: 4, price: 500, cosmetic: true },
  { id: 1072008, name: "Blue High Tops", slot: "shoes", req: 0, watk: 0, str: 0, dex: 2, int: 0, luk: 0, hp: 10, def: 4, price: 500, cosmetic: true },
  { id: 1072037, name: "Yellow Snowshoes", slot: "shoes", req: 0, watk: 0, str: 1, dex: 2, int: 0, luk: 0, hp: 15, def: 6, price: 900, cosmetic: true },

  // Gloves
  { id: 1082002, name: "Work Gloves", slot: "gloves", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 2, price: 1000, cosmetic: true },
  { id: 1082145, name: "Yellow Work Gloves", slot: "gloves", req: 0, watk: 1, str: 1, dex: 0, int: 0, luk: 0, hp: 0, def: 3, price: 2500, cosmetic: true },
  { id: 1082146, name: "Red Work Gloves", slot: "gloves", req: 0, watk: 2, str: 2, dex: 0, int: 0, luk: 0, hp: 0, def: 4, price: 5000, cosmetic: true },
  { id: 1082147, name: "Blue Work Gloves", slot: "gloves", req: 0, watk: 1, str: 0, dex: 2, int: 0, luk: 0, hp: 0, def: 3, price: 3000, cosmetic: true },

  // Capes & Wings
  { id: 1102041, name: "Black Seraph's Cape", slot: "cape", req: 0, watk: 2, str: 3, dex: 3, int: 0, luk: 0, hp: 50, def: 15, price: 8000, cosmetic: true },
  { id: 1102042, name: "White Seraph's Cape", slot: "cape", req: 0, watk: 2, str: 0, dex: 0, int: 3, luk: 3, hp: 50, def: 15, price: 8000, cosmetic: true },
  { id: 1102084, name: "Pink Adventurer Cape", slot: "cape", req: 0, watk: 3, str: 2, dex: 2, int: 2, luk: 2, hp: 40, def: 12, price: 10000, cosmetic: true },

  // Iconic Weapons
  { id: 1302001, name: "Wooden Club", slot: "weapon", req: 0, watk: 19, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 100, cosmetic: true },
  { id: 1302005, name: "Aluminum Baseball Bat", slot: "weapon", req: 0, watk: 25, str: 2, dex: 0, int: 0, luk: 0, hp: 0, def: 0, price: 1500, cosmetic: true },
  { id: 1302014, name: "Frozen Tuna", slot: "weapon", req: 0, watk: 60, str: 5, dex: 0, int: 0, luk: 0, hp: 50, def: 0, price: 15000, cosmetic: true },
  { id: 1302016, name: "Red Whip", slot: "weapon", req: 0, watk: 38, str: 0, dex: 5, int: 0, luk: 0, hp: 0, def: 0, price: 8000, cosmetic: true },
  { id: 1302063, name: "Pan Lid", slot: "shield", req: 0, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 10, price: 2000, cosmetic: true },
  { id: 1302066, name: "Frying Pan", slot: "weapon", req: 0, watk: 32, str: 3, dex: 0, int: 0, luk: 0, hp: 20, def: 0, price: 4000, cosmetic: true },
  { id: 1302081, name: "Maple Sword", slot: "weapon", req: 0, watk: 48, str: 3, dex: 3, int: 0, luk: 0, hp: 30, def: 0, price: 12000, cosmetic: true },

  // Additional Iconic Helms & Hats
  { id: 1002357, name: "Zakum Helmet", slot: "hat", req: 50, watk: 15, str: 15, dex: 15, int: 15, luk: 15, hp: 150, def: 50, price: 50000, cosmetic: true },
  { id: 1002011, name: "Brown Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 3, int: 0, luk: 0, hp: 20, def: 12, price: 3000, cosmetic: true },
  { id: 1002012, name: "Blue Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 0, int: 3, luk: 0, hp: 20, def: 12, price: 3000, cosmetic: true },
  { id: 1002013, name: "Green Bamboo Hat", slot: "hat", req: 25, watk: 0, str: 0, dex: 0, int: 0, luk: 3, hp: 20, def: 12, price: 3000, cosmetic: true },
  { id: 1002434, name: "Maple Hat", slot: "hat", req: 0, watk: 1, str: 2, dex: 2, int: 2, luk: 2, hp: 50, def: 15, price: 10000, cosmetic: true },
  { id: 1002001, name: "Wizard Hat", slot: "hat", req: 0, watk: 0, str: 0, dex: 0, int: 5, luk: 2, hp: 30, def: 10, price: 2500, cosmetic: true },

  // Iconic Capes & Cloaks
  { id: 1102046, name: "Cape of Warmth", slot: "cape", req: 25, watk: 0, str: 2, dex: 2, int: 2, luk: 2, hp: 50, def: 10, price: 4000, cosmetic: true },
  { id: 1102085, name: "Yellow Adventurer Cape", slot: "cape", req: 50, watk: 2, str: 0, dex: 5, int: 0, luk: 0, hp: 40, def: 15, price: 12000, cosmetic: true },
  { id: 1102086, name: "Black Adventurer Cape", slot: "cape", req: 50, watk: 3, str: 3, dex: 0, int: 0, luk: 3, hp: 40, def: 15, price: 15000, cosmetic: true },

  // Iconic Weapons & Boards
  { id: 1442011, name: "Surfboard", slot: "weapon", req: 15, watk: 35, str: 2, dex: 0, int: 0, luk: 0, hp: 30, def: 0, price: 5000, cosmetic: true },
  { id: 1442012, name: "Red Surfboard", slot: "weapon", req: 35, watk: 55, str: 5, dex: 0, int: 0, luk: 0, hp: 50, def: 0, price: 15000, cosmetic: true },
  { id: 1442007, name: "Sky Snowboard", slot: "weapon", req: 18, watk: 40, str: 2, dex: 2, int: 0, luk: 0, hp: 20, def: 0, price: 6000, cosmetic: true },
  { id: 1442010, name: "Blood Snowboard", slot: "weapon", req: 48, watk: 68, str: 6, dex: 2, int: 0, luk: 0, hp: 60, def: 0, price: 20000, cosmetic: true },
  { id: 1332025, name: "Maple Wagner", slot: "weapon", req: 43, watk: 58, str: 0, dex: 0, int: 0, luk: 4, hp: 0, def: 0, price: 18000, cosmetic: true },
  { id: 1382009, name: "Maple Staff", slot: "weapon", req: 35, watk: 48, str: 0, dex: 0, int: 5, luk: 2, hp: 100, def: 0, price: 14000, cosmetic: true },
  { id: 1452016, name: "Maple Bow", slot: "weapon", req: 35, watk: 48, str: 0, dex: 4, int: 0, luk: 0, hp: 40, def: 0, price: 14000, cosmetic: true },
  { id: 1472030, name: "Maple Claw", slot: "weapon", req: 35, watk: 24, str: 0, dex: 0, int: 0, luk: 4, hp: 0, def: 0, price: 14000, cosmetic: true },

  // Iconic Outfits & Robes
  { id: 1050014, name: "Sauna Robe (M)", slot: "top", req: 30, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 100, def: 20, price: 8000, cosmetic: true },
  { id: 1051013, name: "Sauna Robe (F)", slot: "top", req: 30, watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 100, def: 20, price: 8000, cosmetic: true },
];

export const GEAR = new Map<number, GearBase>([...STARTER, ...COSMETICS].map((g) => [g.id, { ...g }]));
export const MATS = new Map<number, string>();

export function loadItemData(d: { gear: (GearBase & { slot: string })[]; mats: { id: number; name: string }[] }) {
  for (const g of [...STARTER, ...COSMETICS, ...d.gear]) {
    const b = { ...g } as GearBase;
    // Some accessories only carry magic defence in the data; give them level-scaled stats.
    if (!b.watk && !b.str && !b.dex && !b.hp && !b.def) { b.def = 2 + Math.round(b.req / 4); b.hp = b.req * 2; if (b.slot === "earrings") b.str = Math.round(b.req / 10); }
    if (b.slot === "weapon" && !b.watk) b.watk = 17 + b.req;
    b.price = Math.max(b.price, 40 + b.req * 60);
    GEAR.set(b.id, b);
  }
  for (const m of d.mats) MATS.set(m.id, m.name);
}

export const gearIcon = (id: number) => `https://maplestory.io/api/GMS/240/item/${id}/icon`;
let uidN = Date.now() % 100000;
export const newUid = () => `g${(uidN++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Rolls a rarity with an optional luck bonus (bosses, crafting). */
export function rollRarity(luck = 0) {
  const r = Math.random() * 100;
  const leg = 0.4 + luck * 0.6, uni = leg + 2 + luck * 2.5, epi = uni + 8 + luck * 6, rare = epi + 26 + luck * 8;
  return r < leg ? 4 : r < uni ? 3 : r < epi ? 2 : r < rare ? 1 : 0;
}

const POT_POOL: Record<string, Potential["stat"][]> = {
  weapon: ["att", "att", "str", "boss", "boss", "exp"],
  default: ["str", "dex", "hp", "hp", "att", "meso", "drop", "exp"],
};
export function rollPotential(slot: string, rarity: number): Potential[] {
  if (rarity <= 0) return [];
  const lines = rarity >= 3 ? 3 : rarity + 1;
  const pool = POT_POOL[slot === "weapon" ? "weapon" : "default"];
  const tierPct = [0, 3, 6, 9, 12][rarity];
  return Array.from({ length: lines }, (_, i) => {
    const stat = pick(pool);
    const scale = stat === "att" || stat === "boss" ? 1 : stat === "meso" || stat === "drop" || stat === "exp" ? 0.8 : 1.2;
    // First line always at tier, the rest may roll a tier lower (like real potential).
    const pct = Math.max(1, Math.round((i === 0 ? tierPct : tierPct - (Math.random() < 0.6 ? 3 : 0)) * scale));
    return { stat, pct };
  });
}

export function makeGear(id: number, luck = 0, minRarity = 0): Gear {
  const b = GEAR.get(id)!;
  const rarity = Math.max(minRarity, rollRarity(luck));
  return { uid: newUid(), id, rarity, star: 0, pot: rollPotential(b.slot, rarity) };
}

/** Picks a random gear base appropriate for a level. */
export function randomGearFor(level: number) {
  const list = [...GEAR.values()].filter((g) => g.req <= level + 5 && g.req >= Math.max(0, level - 25) && g.id !== 1302000);
  return pick(list.length ? list : [...GEAR.values()]).id;
}

export interface GearStats { watk: number; str: number; dex: number; int: number; luk: number; hp: number; def: number }
export function gearStats(g: Gear): GearStats {
  const b = GEAR.get(g.id);
  if (!b) return { watk: 0, str: 0, dex: 0, int: 0, luk: 0, hp: 0, def: 0 };
  const rb = 1 + g.rarity * 0.08; // higher rarity also rolls slightly better base stats
  const s = g.star;
  return {
    watk: Math.round(b.watk * rb + (b.slot === "weapon" ? s * Math.max(2, b.watk * 0.05) : s >= 5 ? s - 4 : 0)),
    str: Math.round(b.str * rb + s * 2),
    dex: Math.round(b.dex * rb + s * 2),
    int: Math.round((b.int ?? 0) * rb + s * 2),
    luk: Math.round((b.luk ?? 0) * rb + s * 2),
    hp: Math.round(b.hp * rb + s * 8),
    def: Math.round(b.def * rb + s * 2),
  };
}
export const POT_LABEL: Record<Potential["stat"], string> = {
  att: "ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "Max HP", boss: "Boss Damage", meso: "Meso Obtained", drop: "Item Drop Rate", exp: "EXP Obtained",
};

// ------------------------------------------------------------- star force & cubes
export const starRate = (star: number) => Math.max(0.3, 0.95 - star * 0.045);
export const starCost = (g: Gear) => { const b = GEAR.get(g.id)!; return Math.round((100 + b.req * 25) * Math.pow(1.35, g.star)); };
export const starMat = (star: number) => (star < 5 ? 4011000 : star < 10 ? 4011001 : 4011002);
export const cubeCost = (g: Gear) => { const b = GEAR.get(g.id)!; return 400 + b.req * 40 + g.rarity * 300; };

// ------------------------------------------------------------- materials & recipes
/** Material dropped by each regular mob and boss. */
export const MOB_MAT: Record<number, number> = {
  1210102: 4000001, 1110100: 4000012, 210100: 4000010,
  2220000: 4000019, 3220000: 4000003, 6130101: 4000040, 9300003: 4000010, 8220007: 4000040, 5220000: 4000013, 6300005: 4000040,
};
export const ORES = [4010000, 4010001, 4010002, 4020000, 4020007];
export const MAT_PRICE: Record<number, number> = {
  4000001: 12, 4000010: 14, 4000012: 18, 4000019: 30, 4000003: 25, 4000013: 40, 4000040: 220,
  4010000: 60, 4010001: 110, 4010002: 180, 4011000: 700, 4011001: 1300, 4011002: 2100,
  4020000: 260, 4020007: 900, 4021000: 2800, 4021007: 9500, 4001126: 50,
};
export const matIcon = (id: number) => `https://maplestory.io/api/GMS/240/item/${id}/icon`;

export interface Recipe {
  id: string; name: string; kind: "refine" | "potion" | "gear";
  needs: [number, number][]; meso: number; level: number;
  out: { t: "mat"; id: number; n: number } | { t: "use"; id: number; n: number } | { t: "gear"; slot: Slot; tier: number };
}

export function recipes(): Recipe[] {
  const r: Recipe[] = [
    { id: "r-bronze", name: "Bronze Plate", kind: "refine", needs: [[4010000, 10]], meso: 300, level: 1, out: { t: "mat", id: 4011000, n: 1 } },
    { id: "r-steel", name: "Steel Plate", kind: "refine", needs: [[4010001, 10]], meso: 500, level: 1, out: { t: "mat", id: 4011001, n: 1 } },
    { id: "r-mithril", name: "Mithril Plate", kind: "refine", needs: [[4010002, 10]], meso: 800, level: 1, out: { t: "mat", id: 4011002, n: 1 } },
    { id: "r-garnet", name: "Garnet", kind: "refine", needs: [[4020000, 10]], meso: 1200, level: 1, out: { t: "mat", id: 4021000, n: 1 } },
    { id: "r-diamond", name: "Diamond", kind: "refine", needs: [[4020007, 10]], meso: 4000, level: 1, out: { t: "mat", id: 4021007, n: 1 } },
    { id: "p-red", name: "Red Potion ×20", kind: "potion", needs: [[4000001, 5]], meso: 100, level: 1, out: { t: "use", id: 2000000, n: 20 } },
    { id: "p-orange", name: "Orange Potion ×15", kind: "potion", needs: [[4000001, 10], [4000012, 5]], meso: 300, level: 1, out: { t: "use", id: 2000001, n: 15 } },
    { id: "p-white", name: "White Potion ×10", kind: "potion", needs: [[4000012, 10], [4000010, 5]], meso: 600, level: 1, out: { t: "use", id: 2000002, n: 10 } },
    { id: "p-blue", name: "Blue Potion ×20", kind: "potion", needs: [[4000010, 6]], meso: 150, level: 1, out: { t: "use", id: 2000003, n: 20 } },
    { id: "p-elixir", name: "Mana Elixir ×10", kind: "potion", needs: [[4000010, 10], [4000012, 6]], meso: 700, level: 1, out: { t: "use", id: 2000006, n: 10 } },
  ];
  // Gear: one recipe per slot per 10-level tier; crafted items are always at least Rare.
  const plates = [4011000, 4011000, 4011001, 4011001, 4011002, 4011002, 4011002, 4011002];
  for (const slot of SLOTS) {
    for (let tier = 1; tier <= 7; tier++) {
      const base = [...GEAR.values()].find((g) => g.slot === slot && Math.floor(g.req / 10) === tier);
      if (!base) continue;
      const mat = tier <= 2 ? 4000001 : tier <= 4 ? 4000012 : 4000010;
      const needs: [number, number][] = [[mat, 8 + tier * 4], [plates[tier], Math.ceil(tier / 2)]];
      if (tier >= 3) needs.push([tier >= 5 ? 4021007 : 4021000, tier >= 5 ? 1 : 2]);
      if (tier >= 4) needs.push([4000040, tier - 2]);
      r.push({ id: `g-${slot}-${tier}`, name: base.name, kind: "gear", needs, meso: 500 * tier * tier, level: base.req, out: { t: "gear", slot, tier } });
    }
  }
  return r;
}
export const recipeGearId = (slot: Slot, tier: number) => [...GEAR.values()].find((g) => g.slot === slot && Math.floor(g.req / 10) === tier)?.id;

// ------------------------------------------------------------- prices
export const USE_PRICE: Record<number, number> = { 2000000: 25, 2000001: 80, 2000002: 160, 2000003: 100, 2000006: 320 };
export function gearValue(g: Gear) {
  const b = GEAR.get(g.id);
  if (!b) return 100;
  return Math.round(b.price * (1 + g.rarity * g.rarity * 0.9) * (1 + g.star * 0.35) * 1.2);
}
export const npcSellPrice = (g: Gear) => Math.max(1, Math.round(gearValue(g) * 0.25));
export { rand, pick };
