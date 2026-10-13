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
  summary: (lv: number) => string;
}

export interface SkillArt {
  id: string; name: string; desc: string;
  icon: Sprite; iconMouseOver: Sprite | null; iconDisabled: Sprite | null;
  effect: Sprite[]; effect0: Sprite[]; hit: Sprite[];
}

export const JOB_TABS = ["Beginner", "Warrior", "Fighter", "Crusader"] as const;
export const TAB_LEVEL = [1, 1, 10, 20];

export const SKILL_DEFS: SkillDef[] = [
  // Beginner
  { id: "0001000", kind: "ranged", tab: 0, reqLevel: 1, maxLevel: 3, mp: (l) => 4 + l * 2, dmg: (l) => 70 + l * 20, hits: 1, targets: 1, range: 320,
    summary: (l) => `Throws a snail shell. Damage ${70 + l * 20}%, range 320.` },
  { id: "0001001", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 20 + l * 10,
    summary: (l) => `Recovers ${8 * l} HP every 2 seconds for ${20 + l * 10} sec.` },
  { id: "0001002", kind: "buff", tab: 0, reqLevel: 1, maxLevel: 3, mp: () => 10, duration: (l) => 30 + l * 15,
    summary: (l) => `Movement speed +${l * 10}% for ${30 + l * 15} sec.` },
  // Warrior
  { id: "1001005", kind: "attack", tab: 1, reqLevel: 1, maxLevel: 20, mp: (l) => 8 + Math.floor(l / 4), dmg: (l) => 100 + l * 5, hits: 1, targets: 6, range: 170,
    summary: (l) => `Attacks up to 6 enemies in front of you. Damage ${100 + l * 5}%.` },
  { id: "1001008", kind: "move", tab: 1, reqLevel: 1, maxLevel: 10, mp: (l) => Math.max(2, 6 - Math.floor(l / 2)),
    summary: (l) => `Jump again in mid-air. Distance +${l * 4}%.` },
  { id: "1000003", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10,  mp: () => 0,
    summary: (l) => `Permanently reduces damage taken by ${l * 2}%.` },
  { id: "1000009", kind: "passive", tab: 1, reqLevel: 1, maxLevel: 10, mp: () => 0,
    summary: (l) => `Max HP +${l * 3}%, Speed +${l}%.` },
  // Fighter
  { id: "1101011", kind: "attack", tab: 2, reqLevel: 10, maxLevel: 20, mp: (l) => 12 + Math.floor(l / 2), dmg: (l) => 140 + l * 6, hits: 2, targets: 3, range: 150,
    summary: (l) => `Strikes up to 3 enemies twice. Damage ${140 + l * 6}%.` },
  { id: "1101006", kind: "buff", tab: 2, reqLevel: 10, maxLevel: 10, mp: (l) => 16 + l, duration: (l) => 60 + l * 12,
    summary: (l) => `Weapon ATT +${l * 2} for ${60 + l * 12} sec.` },
  { id: "1100000", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 10, mp: () => 0,
    summary: (l) => `Weapon Mastery +${l * 5}%, Accuracy +${l * 2}.` },
  { id: "1100009", kind: "passive", tab: 2, reqLevel: 10, maxLevel: 5, mp: () => 0,
    summary: (l) => `Permanently increases STR and DEX by ${l * 4}.` },
  // Crusader
  { id: "1111010", kind: "attack", tab: 3, reqLevel: 20, maxLevel: 20, mp: (l) => 18 + Math.floor(l / 2), dmg: (l) => 180 + l * 7, hits: 2, targets: 8, range: 230,
    summary: (l) => `Slashes up to 8 enemies twice. Damage ${180 + l * 7}%.` },
  { id: "1110000", kind: "passive", tab: 3, reqLevel: 20, maxLevel: 5, mp: () => 0,
    summary: (l) => `Recovers ${l * 30} HP and ${l * 10} MP every 4 sec.` },
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
export const KEY_LABEL: Record<string, string> = { Shift: "Shift", Insert: "Ins", Home: "Hm", PageUp: "PgUp", Control: "Ctrl", Delete: "Del", End: "End", PageDown: "PgDn" };

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
