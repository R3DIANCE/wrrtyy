// Gameplay definitions for the skills whose art/strings come from public/data/skills.json.
import type { Sprite } from "./assets.ts";

export type SkillKind = "attack" | "ranged" | "buff" | "passive" | "move";

export interface SkillDef {
  id: string;
  kind: SkillKind;
  tab: 0 | 1 | 2 | 3; // Beginner, 1st, 2nd, 3rd job
  reqLevel: number;
  maxLevel: number;
  mp: (lv: number) => number;
  /** Damage % of the base attack. */
  dmg?: (lv: number) => number;
  hits?: number;
  targets?: number;
  range?: number;
  /** Buff duration in seconds. */
  duration?: (lv: number) => number;
  /** Flat stat bonuses this buff grants while active (per level). */
  buff?: { att?: number; str?: number; dex?: number; int?: number; luk?: number; hp?: number; def?: number; speed?: number };
  summary: (lv: number) => string;
}

export interface SkillArt {
  id: string; name: string; desc: string;
  icon: Sprite; iconMouseOver: Sprite | null; iconDisabled: Sprite | null;
  effect: Sprite[]; effect0: Sprite[]; hit: Sprite[];
}

// ----------------------------------------------------------------- classes

export type ClassId = "warrior" | "magician" | "bowman" | "thief";

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Which stat drives this class's damage + is auto-assigned on level-up. */
  primary: "str" | "dex" | "int" | "luk";
  /** Which stat improves accuracy. */
  secondary: "str" | "dex" | "int" | "luk";
  tabs: string[]; // Beginner, 1st job, 2nd job, 3rd job
  tabLevel: [number, number, number, number];
  /** Skill IDs for each tab. */
  skillsByTab: string[][];
  /** Starting equipment (weapon, top, bottom, shoes) ids. */
  startingGear: { weapon: number; top: number; bottom: number; shoes: number };
  /** Default hotbar assignments when a new character starts. */
  defaultQuick: Record<string, Action>;
  /** Base stats for a fresh character (HP/MP/STR/DEX/INT/LUK). */
  base: { hp: number; mp: number; str: number; dex: number; int: number; luk: number };
}

/** Classes the player can pick at the title screen. */
export const CLASSES: ClassDef[] = [
  {
    id: "warrior", name: "Warrior", primary: "str", secondary: "dex",
    tabs: ["Beginner", "Warrior", "Fighter", "Crusader"], tabLevel: [1, 1, 10, 20],
    skillsByTab: [
      ["0001000", "0001001", "0001002"],
      ["1001005", "1001008", "1000003", "1000009"],
      ["1101011", "1101006", "1100000", "1100009"],
      ["1111010", "1110000"],
    ],
    startingGear: { weapon: 1302000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "1001005" }, Insert: { t: "skill", id: "1101011" },
      Home: { t: "skill", id: "1111010" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "1101006" },
    },
    base: { hp: 50, mp: 30, str: 12, dex: 5, int: 4, luk: 4 },
  },
  {
    id: "magician", name: "Magician", primary: "int", secondary: "int",
    tabs: ["Beginner", "Magician", "Wizard (F/P)", "Mage"], tabLevel: [1, 1, 10, 20],
    skillsByTab: [
      ["0001000", "0001001", "0001002"],
      ["2001002", "2001003", "2001004", "2001005"],
      ["2101001", "2101002", "2101004", "2101005"],
      ["2111002", "2111003", "2111004", "2111005", "2111006", "2111007"],
    ],
    startingGear: { weapon: 1302000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "2001005" }, Insert: { t: "skill", id: "2001004" },
      Home: { t: "skill", id: "2101004" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "2101001" },
    },
    base: { hp: 30, mp: 70, str: 4, dex: 4, int: 12, luk: 4 },
  },
  {
    id: "bowman", name: "Bowman", primary: "dex", secondary: "dex",
    tabs: ["Beginner", "Archer", "Hunter", "Ranger"], tabLevel: [1, 1, 10, 20],
    skillsByTab: [
      ["0001000", "0001001", "0001002"],
      ["3001004", "3001005", "3001007"],
      ["3101003", "3101004", "3101005", "3101008"],
      ["3111002", "3111003", "3111004", "3111005", "3111006"],
    ],
    startingGear: { weapon: 1302000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "3001004" }, Insert: { t: "skill", id: "3001005" },
      Home: { t: "skill", id: "3101005" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "3101004" },
    },
    base: { hp: 40, mp: 40, str: 4, dex: 12, int: 4, luk: 4 },
  },
  {
    id: "thief", name: "Thief", primary: "luk", secondary: "dex",
    tabs: ["Beginner", "Rogue", "Assassin", "Hermit"], tabLevel: [1, 1, 10, 20],
    skillsByTab: [
      ["0001000", "0001001", "0001002"],
      ["4001002", "4001003", "4001005", "4001011"],
      ["4101003", "4101005", "4101008", "4101009"],
      ["4111001", "4111002", "4111003", "4111004", "4111005", "4111007"],
    ],
    startingGear: { weapon: 1302000, top: 1040002, bottom: 1060002, shoes: 1072001 },
    defaultQuick: {
      Shift: { t: "skill", id: "4001011" }, Insert: { t: "skill", id: "4001002" },
      Home: { t: "skill", id: "4101008" }, PageUp: { t: "skill", id: "0001000" },
      Control: { t: "attack" }, Delete: { t: "item", id: 2000000 }, End: { t: "item", id: 2000003 },
      PageDown: { t: "item", id: 2000001 }, "1": { t: "skill", id: "0001001" },
      "2": { t: "skill", id: "0001002" }, "3": { t: "skill", id: "4001003" },
    },
    base: { hp: 40, mp: 40, str: 4, dex: 6, int: 4, luk: 12 },
  },
];

export const CLASS_MAP = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<ClassId, ClassDef>;
export const classFor = (id: string | null | undefined): ClassDef => CLASS_MAP[(id ?? "warrior") as ClassId] ?? CLASSES[0];

/** Legacy aliases used before the class system was introduced. */
export const JOB_TABS = ["Beginner", "Warrior", "Fighter", "Crusader"] as const;
export const TAB_LEVEL = [1, 1, 10, 20];

// ----------------------------------------------------------------- skill defs

export const SKILL_DEFS: SkillDef[] = [
  // ---- Beginner (shared across all classes)
  { id: "0001000", kind: "ranged", tab: 0, reqLevel: 1, maxLevel: 3, mp: (l) => 4 + l * 2, dmg: (l) => 70 + l * 20, hits: 1, targets: 1, range: 320,
    summary: (l) => `Throws a snail shell. Damage ${70 + l * 20}%, range 320.` },
  { id: "0001001", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 20 + l * 10,
    summary: (l) => `Recovers ${8 * l} HP every 2 seconds for ${20 + l * 10} sec.` },
  { id: "0001002", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 30 + l * 15,
    summary: (l) => `Movement speed +${l * 10}% for ${30 + l * 15} sec.` },

  // ---- Warrior
  { id: "1001005", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 8 + Math.floor(l / 4), dmg: (l) => 100 + l * 5, hits: 1, targets: 6, range: 170,
    summary: (l) => `Attacks up to 6 enemies in front of you. Damage ${100 + l * 5}%.` },
  { id: "1001008", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(2, 6 - Math.floor(l / 2)),
    summary: (l) => `Launch much farther horizontally while in the air. Range +${l * 12}%.` },
  { id: "1000003", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Permanently reduces damage taken by ${l * 2}%.` },
  { id: "1000009", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Max HP +${l * 3}%, Speed +${l}%.` },
  { id: "1101011", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 2, targets: 3, range: 150,
    summary: (l) => `Strikes up to 3 enemies twice. Damage ${140 + l * 6}%.` },
  { id: "1101006", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 16 + l, duration: (l) => 60 + l * 12,
    summary: (l) => `Weapon ATT +${l * 2} for ${60 + l * 12} sec.` },
  { id: "1100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Weapon Mastery +${l * 5}%, Accuracy +${l * 2}.` },
  { id: "1100009", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Permanently increases STR and DEX by ${l * 4}.` },
  { id: "1111010", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 18 + Math.floor(l / 2), dmg: (l) => 180 + l * 7, hits: 2, targets: 8, range: 230,
    summary: (l) => `Slashes up to 8 enemies twice. Damage ${180 + l * 7}%.` },
  { id: "1110000", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 5, mp: () => 0,
    summary: (l) => `Recovers ${l * 30} HP and ${l * 10} MP every 4 sec.` },

  // ---- Magician
  { id: "2001002", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 60 + l * 12, buff: { def: 4 },
    summary: (l) => `Diverts ${(l * 8)}% of incoming damage to your MP for ${60 + l * 12} sec.` },
  { id: "2001003", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 10 + l, duration: (l) => 60 + l * 15, buff: { def: 5 },
    summary: (l) => `DEF +${l * 20}, Accuracy +${l * 5} for ${60 + l * 15} sec.` },
  { id: "2001004", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 100 + l * 5, hits: 1, targets: 1, range: 400,
    summary: (l) => `Fires a bolt of energy at one enemy. Damage ${100 + l * 5}%.` },
  { id: "2001005", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 120 + l * 6, hits: 2, targets: 2, range: 360,
    summary: (l) => `Claws up to 2 enemies with magic. Damage ${120 + l * 6}%.` },
  { id: "2101001", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 60 + l * 15, buff: { int: 4 },
    summary: (l) => `Magic ATT +${l * 2} for ${60 + l * 15} sec.` },
  { id: "2101002", kind: "move", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => Math.max(4, 18 - Math.floor(l / 2)),
    summary: (l) => `Teleport ${l * 12}% farther instantly (double-tap the direction).` },
  { id: "2101004", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 150 + l * 7, hits: 2, targets: 3, range: 400,
    summary: (l) => `Hurls an orb of flame at up to 3 enemies. Damage ${150 + l * 7}%.` },
  { id: "2101005", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 14 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 3, targets: 3, range: 380,
    summary: (l) => `Breathes poison at up to 3 enemies. Damage ${140 + l * 6}%.` },

  // ---- Magician 3rd job (Mage, Fire/Poison)
  { id: "2111002", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 190 + l * 9, hits: 2, targets: 6, range: 400,
    summary: (l) => `Explosion: fire burst hits up to 6 enemies. Damage ${190 + l * 9}%.` },
  { id: "2111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 3, targets: 4, range: 380,
    summary: (l) => `Poison Mist: toxic cloud hits up to 4 enemies. Damage ${160 + l * 7}%.` },
  { id: "2111004", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 18 + l, duration: (l) => 90 + l * 15, buff: { att: 4 },
    summary: (l) => `Seal: ATT +${l * 4} for ${90 + l * 15} sec.` },
  { id: "2111005", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 20 + l, duration: (l) => 120 + l * 20, buff: { int: 6 },
    summary: (l) => `Spell Booster: INT +${l * 6} for ${120 + l * 20} sec.` },
  { id: "2111006", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 24 + l, dmg: (l) => 210 + l * 10, hits: 3, targets: 4, range: 400,
    summary: (l) => `Fire Demon: flames hit up to 4 enemies. Damage ${210 + l * 10}%.` },
  { id: "2111007", kind: "move", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => Math.max(6, 18 - l),
    summary: (l) => `Teleport Mastery: a short magic dash. Range +${l * 14}%.` },

  // ---- Bowman (Archer)
  { id: "3001004", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 10 + Math.floor(l / 2), dmg: (l) => 120 + l * 5, hits: 1, targets: 2, range: 400,
    summary: (l) => `Fires a strong arrow at up to 2 enemies. Damage ${120 + l * 5}%.` },
  { id: "3001005", kind: "ranged", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 2, targets: 2, range: 400,
    summary: (l) => `Fires two arrows at once at up to 2 enemies. Damage ${140 + l * 6}%.` },
  { id: "3001007", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 16 - l),
    summary: (l) => `Jump again in mid-air. Range +${l * 12}%.` },
  { id: "3101003", kind: "move", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => Math.max(4, 14 - l),
    summary: (l) => `Jump again in mid-air (stronger). Range +${l * 15}%.` },
  { id: "3101004", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 60 + l * 15, buff: { att: 3 },
    summary: (l) => `Soul Arrow: ATT +${l * 3} for ${60 + l * 15} sec.` },
  { id: "3101005", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 160 + l * 7, hits: 2, targets: 4, range: 420,
    summary: (l) => `Looses a wind-touched arrow at up to 4 enemies. Damage ${160 + l * 7}%.` },
  { id: "3101008", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 18 + l, dmg: (l) => 180 + l * 8, hits: 3, targets: 6, range: 420,
    summary: (l) => `Fires a volley of arrows at up to 6 enemies. Damage ${180 + l * 8}%.` },

  // ---- Bowman 3rd job (Ranger)
  { id: "3111002", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 20 + l, duration: (l) => 90 + l * 20, buff: { att: 4 },
    summary: (l) => `Puppet: ATT +${l * 4} for ${90 + l * 20} sec.` },
  { id: "3111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 180 + l * 8, hits: 2, targets: 4, range: 400,
    summary: (l) => `Flame Surge: burning arrows hit up to 4 enemies. Damage ${180 + l * 8}%.` },
  { id: "3111004", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 24 + l, dmg: (l) => 200 + l * 10, hits: 3, targets: 6, range: 400,
    summary: (l) => `Arrow Rain: arrows rain on up to 6 enemies. Damage ${200 + l * 10}%.` },
  { id: "3111005", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 22 + l, duration: (l) => 100 + l * 20, buff: { att: 5 },
    summary: (l) => `Phoenix: ATT +${l * 5} for ${100 + l * 20} sec.` },
  { id: "3111006", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 190 + l * 9, hits: 4, targets: 2, range: 420,
    summary: (l) => `Strafe: four arrows at up to 2 enemies. Damage ${190 + l * 9}%.` },

  // ---- Thief (Rogue)
  { id: "4001002", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 8 + Math.floor(l / 2), dmg: (l) => 100 + l * 5, hits: 2, targets: 1, range: 140,
    summary: (l) => `Two quick stabs at one enemy. Damage ${100 + l * 5}%.` },
  { id: "4001003", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 40 + l * 15,
    summary: (l) => `Dark Sight: DEF +${l * 2} for ${40 + l * 15} sec.` },
  { id: "4001005", kind: "buff", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => 12 + l, duration: (l) => 60 + l * 15, buff: { speed: 15 },
    summary: (l) => `Haste: speed +${15 + l * 2}% for ${60 + l * 15} sec.` },
  { id: "4001011", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(4, 14 - l),
    summary: (l) => `Blink forward instantly. Range +${l * 14}%.` },
  { id: "4101003", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 14 + l, duration: (l) => 60 + l * 15, buff: { att: 5 },
    summary: (l) => `Claw Booster: ATT +${l * 5} for ${60 + l * 15} sec.` },
  { id: "4101005", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 130 + l * 6, hits: 2, targets: 3, range: 360,
    summary: (l) => `Throw claws at up to 3 enemies. Damage ${130 + l * 6}%.` },
  { id: "4101008", kind: "ranged", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 16 + Math.floor(l / 2), dmg: (l) => 150 + l * 7, hits: 4, targets: 4, range: 380,
    summary: (l) => `Burst of shurikens hits up to 4 enemies. Damage ${150 + l * 7}%.` },
  { id: "4101009", kind: "move", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => Math.max(4, 14 - l),
    summary: (l) => `Flash Jump: leap farther in mid-air. Range +${l * 16}%.` },

  // ---- Thief 3rd job (Hermit)
  { id: "4111001", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 10, mp: () => 0,
    summary: (l) => `Meso Up: permanently +${l * 5}% mesos from monsters.` },
  { id: "4111002", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 20 + l, duration: (l) => 100 + l * 20, buff: { att: 5 },
    summary: (l) => `Shadow Partner: ATT +${l * 5} for ${100 + l * 20} sec.` },
  { id: "4111003", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 170 + l * 8, hits: 2, targets: 4, range: 380,
    summary: (l) => `Shadow Web: binds up to 4 enemies. Damage ${170 + l * 8}%.` },
  { id: "4111004", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 22 + l, dmg: (l) => 180 + l * 8, hits: 3, targets: 3, range: 400,
    summary: (l) => `Shadow Meso: thrown mesos hit up to 3 enemies. Damage ${180 + l * 8}%.` },
  { id: "4111005", kind: "ranged", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 20 + Math.floor(l / 2), dmg: (l) => 190 + l * 9, hits: 4, targets: 6, range: 420,
    summary: (l) => `Avenger: a massive star hits up to 6 enemies. Damage ${190 + l * 9}%.` },
  { id: "4111007", kind: "buff", tab: 3, reqLevel: 20, maxLevel: 10, mp: (l) => 22 + l, duration: (l) => 90 + l * 20, buff: { def: 6 },
    summary: (l) => `Dark Flare: DEF +${l * 6} for ${90 + l * 20} sec.` },
];

export const SKILL = Object.fromEntries(SKILL_DEFS.map((s) => [s.id, s])) as Record<string, SkillDef>;

export interface ItemDef { id: number; name: string; hp?: number; mp?: number }
export const ITEMS: Record<number, ItemDef> = {
  2000000: { id: 2000000, name: "Red Potion", hp: 50 },
  2000001: { id: 2000001, name: "Orange Potion", hp: 150 },
  2000002: { id: 2000002, name: "White Potion", hp: 300 },
  2000003: { id: 2000003, name: "Blue Potion", mp: 100 },
  2000006: { id: 2000006, name: "Mana Elixir", mp: 300 },
};
export const itemIcon = (id: number) => `https://maplestory.io/api/GMS/240/item/${id}/icon`;
export const itemIconRaw = (id: number) => `https://maplestory.io/api/GMS/240/item/${id}/iconRaw`;
export const WEAPON_ICON = "https://maplestory.io/api/GMS/240/item/1302000/icon";

export type Action = { t: "skill"; id: string } | { t: "item"; id: number } | { t: "attack" };

/** Quick-slot keys (KeyboardEvent-normalised names) in on-screen order, two rows of 16. */
export const QUICK_KEYS = [
  "Shift", "Insert", "Home", "PageUp", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
  "Control", "Delete", "End", "PageDown", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];
export const KEY_LABEL: Record<string, string> = {
  Shift: "Shift", Insert: "Ins", Home: "Hm", PageUp: "Pup",
  Control: "Ctrl", Delete: "Del", End: "End", PageDown: "Pdn",
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "0": "0", "-": "-", "=": "=",
  F1: "Q", F2: "W", F3: "E", F4: "R", F5: "T", F6: "Y", F7: "U", F8: "I", F9: "O", F10: "P", F11: "[", F12: "]",
};

export const KEY_BADGES: Record<string, { text: string; color: "green" | "blue" | "orange" | "yellow" }> = {
  Shift: { text: "ATTACK", color: "green" },
  Insert: { text: "TO ALL", color: "green" },
  Home: { text: "TO PARTY", color: "green" },
  PageUp: { text: "TO BUDDY", color: "green" },
  Control: { text: "ATTACK", color: "green" },
  Delete: { text: "TO GUILD", color: "green" },
  End: { text: "TO ALLIANCE", color: "green" },
  PageDown: { text: "TO ALL", color: "green" },
  "-": { text: "SKILL", color: "blue" },
  "=": { text: "QUEST", color: "orange" },
  F10: { text: "GUILD", color: "green" },
  F11: { text: "WORLD MAP", color: "yellow" },
  F12: { text: "MINI MAP", color: "orange" },
};

export const DEFAULT_QUICK: Record<string, Action> = {
  Shift: { t: "skill", id: "1001005" },
  Insert: { t: "skill", id: "1101011" },
  Home: { t: "skill", id: "1111010" },
  PageUp: { t: "skill", id: "0001000" },
  Control: { t: "attack" },
  Delete: { t: "item", id: 2000000 },
  End: { t: "item", id: 2000003 },
  PageDown: { t: "item", id: 2000001 },
  "1": { t: "skill", id: "0001001" },
  "2": { t: "skill", id: "0001002" },
  "3": { t: "skill", id: "1101006" },
};

/** Strip MapleStory string markup (#c...#, \n, #mpCon etc.). */
export function cleanDesc(s: string) {
  return s.replace(/\\n|\\r/g, " ").replace(/#[a-zA-Z]+/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
}
