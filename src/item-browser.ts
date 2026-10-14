// "All Items" browser panel — lists every gear/material/use item in the game.
// Icons and other maplestory.io assets are cached to /assets/ on the server the
// first time they appear in the UI, so the game keeps working offline.
import { GEAR, MATS, makeGear, type GearBase } from "./items.ts";
import { ITEMS, itemIcon } from "./skills.ts";
import { renderBaseGearTooltip, renderUseTooltip, renderMatTooltip } from "./tooltip.ts";
import { esc, fmt, cacheAsset, warmCache } from "./util.ts";
import { clampWindow } from "./windows.ts";
export { cacheAsset, warmCache };

/** Categories shown in the All Items browser. */
export type ItemCat = "all" | "cosmetic" | "weapon" | "armor" | "accessory" | "material" | "use" | "etc";

const ALL_TABS: { key: ItemCat; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "cosmetic", label: "COSMETICS" },
  { key: "weapon", label: "WEAPONS" },
  { key: "armor", label: "ARMOR" },
  { key: "accessory", label: "ACCESSORIES" },
  { key: "material", label: "MATERIALS" },
  { key: "use", label: "CONSUMABLES" },
  { key: "etc", label: "ETC" },
];

export class ItemBrowser {
  win: HTMLElement;
  body: HTMLElement;
  tab: ItemCat = "all";
  search = "";
  page = 0;
  perPage = 48;
  searchInput: HTMLInputElement | null = null;

  constructor(public parent: any) {
    this.win = parent.makeWindow("allitems-win", 460, 460, "ALL ITEMS", innerWidth / 2 - 230, 70);
    this.win.classList.add("allitems");
    this.body = this.win.querySelector(".x-body") as HTMLElement;
    if (!this.body) {
      this.body = document.createElement("div");
      this.body.className = "x-body";
      this.win.appendChild(this.body);
    }
    this.win.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (t) {
        const a = t.dataset.act!;
        if (a === "cat") { this.tab = t.dataset.v as ItemCat; this.page = 0; }
        else if (a === "page") { this.page = Math.max(0, Number(t.dataset.v)); }
        this.render();
        return;
      }
      const itemEl = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
      if (itemEl && this.parent?.game) {
        const id = Number(itemEl.dataset.itemId);
        const kind = itemEl.dataset.kind;
        const g = this.parent.game;
        if (kind === "gear") {
          const gear = makeGear(id);
          g.addGear(gear);
          g.onGain?.("level", `Claimed ${GEAR.get(id)?.name ?? "item"} into inventory!`);
          g.onChat?.("item", `Obtained ${GEAR.get(id)?.name ?? "gear"} from All Items browser.`);
        } else if (kind === "use") {
          g.inv[id] = (g.inv[id] ?? 0) + 10;
          g.onGain?.("exp", `+10 ${ITEMS[id]?.name ?? "potions"}`);
          g.onChat?.("item", `Obtained 10x ${ITEMS[id]?.name ?? "potion"}.`);
        } else if (kind === "mat") {
          g.mats[id] = (g.mats[id] ?? 0) + 10;
          g.onGain?.("exp", `+10 ${MATS.get(id) ?? "materials"}`);
          g.onChat?.("item", `Obtained 10x ${MATS.get(id) ?? "material"}.`);
        }
        g.onChange?.();
        // Immediately refresh open Inventory or Equipment panels
        this.parent?.ext?.renderInv?.();
        this.parent?.ext?.renderEquip?.();
      }
    });

    this.win.addEventListener("pointermove", (e) => {
      const itemEl = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
      if (!itemEl) {
        this.parent.hideTip();
        return;
      }
      const id = Number(itemEl.dataset.itemId);
      const kind = itemEl.dataset.kind;
      const playerLevel = this.parent.game?.stats?.level ?? 200;
      let html = "";
      if (kind === "gear") {
        const b = GEAR.get(id);
        if (b) html = renderBaseGearTooltip(b, "Click to claim into inventory", playerLevel);
      } else if (kind === "use") {
        html = renderUseTooltip(id, this.parent.game?.inv?.[id] ?? 0, "Click to claim 10x into inventory");
      } else if (kind === "mat") {
        html = renderMatTooltip(id, this.parent.game?.mats?.[id] ?? 0, "Click to claim 10x into inventory");
      }
      if (html) this.parent.showTip(html, (e as PointerEvent).clientX, (e as PointerEvent).clientY);
      else this.parent.hideTip();
    });
    this.win.addEventListener("pointerleave", () => this.parent.hideTip());
  }

  open() {
    this.win.classList.remove("hidden");
    this.win.style.zIndex = String(++this.parent.z);
    clampWindow(this.win);
    this.render();
  }

  /** One flat list of every item in the current category, with search applied. */
  private items(): { id: number; name: string; kind: "gear" | "mat" | "use"; icon: string; slot?: string; req?: number; cosmetic?: boolean }[] {
    const q = this.search.trim().toLowerCase();
    const list: { id: number; name: string; kind: "gear" | "mat" | "use"; icon: string; slot?: string; req?: number; cosmetic?: boolean }[] = [];
    const accSlots = new Set(["ring", "ring1", "ring2", "ring3", "ring4", "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge"]);

    const addGears = (filter?: (g: GearBase) => boolean) => {
      for (const g of GEAR.values()) {
        if (filter && !filter(g)) continue;
        if (q && !g.name.toLowerCase().includes(q) && !String(g.id).includes(q)) continue;
        list.push({ id: g.id, name: g.name, kind: "gear", icon: itemIcon(g.id), slot: g.slot, req: g.req, cosmetic: g.cosmetic });
      }
    };
    const addMats = () => {
      for (const [id, name] of MATS) {
        if (q && !name.toLowerCase().includes(q) && !String(id).includes(q)) continue;
        list.push({ id, name, kind: "mat", icon: itemIcon(id) });
      }
    };
    const addUse = () => {
      for (const [id, it] of Object.entries(ITEMS)) {
        const n = Number(id);
        if (q && !it.name.toLowerCase().includes(q) && !String(n).includes(q)) continue;
        list.push({ id: n, name: it.name, kind: "use", icon: itemIcon(n) });
      }
    };

    if (this.tab === "all") {
      addGears();
      addUse();
      addMats();
    } else if (this.tab === "cosmetic") {
      addGears((g) => !!g.cosmetic);
    } else if (this.tab === "material" || this.tab === "etc") {
      addMats();
    } else if (this.tab === "use") {
      addUse();
    } else {
      const isWeapon = this.tab === "weapon";
      const isAcc = this.tab === "accessory";
      addGears((g) => {
        const isAccItem = accSlots.has(g.slot);
        if (this.tab === "armor") return !isAccItem && g.slot !== "weapon" && !g.cosmetic;
        if (isWeapon) return g.slot === "weapon" && !g.cosmetic;
        if (isAcc) return isAccItem && !g.cosmetic;
        return true;
      });
    }
    list.sort((a, b) => (a.req ?? 0) - (b.req ?? 0) || a.name.localeCompare(b.name));
    return list;
  }

  render() {
    const list = this.items();
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / this.perPage));
    this.page = Math.min(this.page, pages - 1);
    const start = this.page * this.perPage;
    const shown = list.slice(start, start + this.perPage);

    const tabs = ALL_TABS.map((t) => `<span data-act="cat" data-v="${t.key}" class="${t.key === this.tab ? "on" : ""}">${t.label}</span>`).join("");

    const hadFocus = document.activeElement === this.searchInput;
    const prevQuery = this.search;
    this.body.innerHTML = `<div class="xtabs">${tabs}</div>
      <div class="ai-search">
        <input type="text" class="ai-search-input" placeholder="Search items…" value="${esc(prevQuery)}" aria-label="Search items">
        <span class="ai-count">${fmt(total)}${total > this.perPage ? " · page " + (this.page + 1) + "/" + pages : ""}</span>
      </div>
      <div class="ai-grid">
        ${shown.map((it) => `<div class="gcell ${it.kind === "gear" ? "" : "blank"}" data-item-id="${it.id}" data-kind="${it.kind}">
          <span class="ic" style="background-image:url('${it.icon}')" data-cache="${it.id}"></span>
          ${it.kind === "gear" ? `<span class="gstar">${it.cosmetic ? "★" : "L" + (it.req ?? 0)}</span>` : ""}
        </div>`).join("")}
      </div>
      <div class="inv-foot ai-foot">
        ${pages > 1 ? `
          <button type="button" class="xbtn" data-act="page" data-v="${Math.max(0, this.page - 1)}" ${this.page === 0 ? "disabled" : ""}>‹ Prev</button>
          <button type="button" class="xbtn" data-act="page" data-v="${Math.min(pages - 1, this.page + 1)}" ${this.page >= pages - 1 ? "disabled" : ""}>Next ›</button>` : "<span></span>"}
        <span class="tip-dim">${fmt(total)} items · click any item to claim</span>
      </div>`;

    const inp = this.body.querySelector(".ai-search-input") as HTMLInputElement;
    this.searchInput = inp;
    if (hadFocus) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
    inp.addEventListener("input", () => {
      this.search = inp.value;
      this.page = 0;
      const pos = inp.selectionStart ?? inp.value.length;
      this.render();
      const n = this.body.querySelector(".ai-search-input") as HTMLInputElement;
      n.focus();
      n.setSelectionRange(pos, pos);
    });
    // Kick off caching for any icons rendered in this page.
    for (const cell of this.body.querySelectorAll<HTMLElement>("[data-cache]")) {
      cacheAsset(cell.style.backgroundImage.replace(/^url\(['"]?|['"]?\)$/g, ""));
    }
  }
}

