// Single-player Auction House: simulated sellers list goods, simulated buyers purchase your listings.
import { GEAR, MAT_PRICE, MATS, USE_PRICE, gearValue, makeGear, pick, rand, randomGearFor, type Gear } from "./items.ts";
import { ITEMS } from "./skills.ts";

export type Goods = { t: "gear"; gear: Gear } | { t: "mat"; id: number; n: number } | { t: "use"; id: number; n: number };
export interface Listing { lid: string; goods: Goods; price: number; seller: string; until: number }
export interface MyListing { lid: string; goods: Goods; price: number; listedAt: number; sold: boolean }

const SELLERS = ["MapleMomo", "xXSlayerXx", "PinkBeanFan", "Henesys4Life", "SnailHunter", "Lumi", "BigBadMushmom", "Ellinia", "ZakumSlayer", "KerningKid",
  "Sugar", "Arwen", "NoobWarrior", "PerionPride", "BlueSnail", "DrakeTamer", "AmoriaBride", "Nautilus", "MesoMarket", "Elnath"];

let n = 0;
const lid = () => `L${Date.now().toString(36)}${(n++).toString(36)}`;

export function goodsValue(g: Goods) {
  if (g.t === "gear") return gearValue(g.gear);
  if (g.t === "mat") return (MAT_PRICE[g.id] ?? 20) * g.n;
  return (USE_PRICE[g.id] ?? 30) * g.n;
}
export function goodsName(g: Goods) {
  if (g.t === "gear") return GEAR.get(g.gear.id)?.name ?? "Equipment";
  if (g.t === "mat") return `${MATS.get(g.id) ?? "Material"} ×${g.n}`;
  return `${ITEMS[g.id]?.name ?? "Item"} ×${g.n}`;
}

export class AuctionHouse {
  listings: Listing[] = [];
  mine: MyListing[] = [];
  nextRefresh = 0;
  history: number[] = []; // recent sale ratios (price / value) to show market mood

  constructor(public level: () => number) {}

  refresh(now: number) {
    this.listings = this.listings.filter((l) => l.until > now);
    while (this.listings.length < 28) this.listings.push(this.makeListing(now));
    this.listings.sort((a, b) => a.price - b.price);
    this.nextRefresh = now + 120_000;
  }

  makeListing(now: number): Listing {
    const r = Math.random();
    let goods: Goods;
    if (r < 0.5) goods = { t: "gear", gear: makeGear(randomGearFor(this.level() + Math.round(rand(-5, 15))), 0.6) };
    else if (r < 0.82) {
      const mats = Object.keys(MAT_PRICE).map(Number).filter((id) => MATS.has(id));
      const id = pick(mats);
      goods = { t: "mat", id, n: id >= 4011000 ? Math.ceil(rand(1, 4)) : Math.ceil(rand(5, 40)) };
    } else {
      const id = pick(Object.keys(USE_PRICE).map(Number));
      goods = { t: "use", id, n: Math.ceil(rand(10, 100)) };
    }
    const price = Math.max(1, Math.round(goodsValue(goods) * rand(0.75, 1.45)));
    return { lid: lid(), goods, price, seller: pick(SELLERS), until: now + rand(5, 30) * 60_000 };
  }

  /** Simulated buyers check your listings; cheaper-than-market listings sell faster. */
  tick(now: number, dtSec: number) {
    if (now > this.nextRefresh) this.refresh(now);
    for (const m of this.mine) {
      if (m.sold) continue;
      const ratio = m.price / Math.max(1, goodsValue(m.goods));
      const perMinute = Math.max(0.01, Math.min(0.9, 1.5 - ratio)) * 0.6;
      if (Math.random() < perMinute * (dtSec / 60)) { m.sold = true; this.history.push(ratio); if (this.history.length > 30) this.history.shift(); return m; }
    }
    return null;
  }

  save() { return { mine: this.mine }; }
  restore(d: any) { if (d?.mine) this.mine = d.mine; }
}
export const AH_TAX = 0.05;
