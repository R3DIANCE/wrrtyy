// "All Items" browser panel — lists every gear/material/use item in the game.
// Icons and other maplestory.io assets are cached to /assets/ on the server the
// first time they appear in the UI, so the game keeps working offline.
import { GEAR, MATS, SLOT_NAME, RARITY, RARITY_INK, RARITY_COLOR, type GearBase, type Slot } from "./items.ts";
import { ITEMS, itemIcon, type Action } from "./skills.ts";

const esc = (s: string) => s.replace(/[<>'"]/g, (c) => ({ '<': ' ', '>': ' ', '"': ' ', "'": ' ' })[c] ?? c);
const fmt = (n: number) => Math.round(n).toLocaleString();

/** Categories shown in the All Items browser. */
export type ItemCat = "weapon" | "armor" | "accessory" | "material" | "use" | "etc";

const ALL_TABS: { key: ItemCat; label: string }[] = [
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
  tab: ItemCat = "weapon";
  search = "";
  page = 0;
  perPage = 48;
  sig = "";
  searchInput: HTMLInputElement | null = null;

  constructor(parent: { makeWindow(id: string, w: number, h: number, title: string, x: number, y: number): HTMLElement }) {
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
      if (!t) return;
      const a = t.dataset.act!;
      if (a === "cat") { this.tab = t.dataset.v as ItemCat; this.page = 0; this.sig = ""; }
      else if (a === "page") { this.page = Math.max(0, Number(t.dataset.v)); this.sig = ""; }
      this.render();
    });
  }

  open() {
    this.win.classList.remove("hidden");
    this.render();
  }

  /** One flat list of every item in the current category, with search applied. */
  private items(): { id: number; name: string; kind: "gear" | "mat" | "use"; icon: string; slot?: string; req?: number }[] {
    const q = this.search.trim().toLowerCase();
    let list: { id: number; name: string; kind: "gear" | "mat" | "use"; icon: string; slot?: string; req?: number }[] = [];
    if (this.tab === "material" || this.tab === "etc") {
      for (const [id, name] of MATS) {
        if (q && !name.toLowerCase().includes(q) && !String(id).includes(q)) continue;
        list.push({ id, name, kind: "mat", icon: itemIcon(id) });
      }
    } else if (this.tab === "use") {
      for (const [id, it] of Object.entries(ITEMS)) {
        const n = Number(id);
        if (q && !it.name.toLowerCase().includes(q) && !String(n).includes(q)) continue;
        list.push({ id: n, name: it.name, kind: "use", icon: itemIcon(n) });
      }
    } else {
      const isWeapon = this.tab === "weapon";
      const isAcc = this.tab === "accessory";
      const accSlots = new Set(["ring1", "ring2", "ring3", "ring4", "earrings", "pendant"]);
      for (const g of GEAR.values()) {
        const isAccItem = accSlots.has(g.slot);
        if (this.tab === "armor" && (isAccItem || g.slot === "weapon")) continue;
        if (isWeapon && g.slot !== "weapon") continue;
        if (isAcc && !isAccItem) continue;
        if (q && !g.name.toLowerCase().includes(q) && !String(g.id).includes(q)) continue;
        list.push({ id: g.id, name: g.name, kind: "gear", icon: itemIcon(g.id), slot: g.slot, req: g.req });
      }
      list.sort((a, b) => (a.req ?? 0) - (b.req ?? 0) || a.name.localeCompare(b.name));
    }
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
        ${shown.map((it) => `<div class="gcell ${it.kind === "gear" ? "" : "blank"}" title="${esc(it.name)}">
          <span class="ic" style="background-image:url('${it.icon}')" data-cache="${it.id}"></span>
          ${it.kind === "gear" ? `<span class="gstar">L${it.req ?? 0}</span>` : ""}
        </div>`).join("")}
      </div>
      <div class="inv-foot ai-foot">
        ${pages > 1 ? `
          <button type="button" class="xbtn" data-act="page" data-v="${Math.max(0, this.page - 1)}" ${this.page === 0 ? "disabled" : ""}>‹ Prev</button>
          <button type="button" class="xbtn" data-act="page" data-v="${Math.min(pages - 1, this.page + 1)}" ${this.page >= pages - 1 ? "disabled" : ""}>Next ›</button>` : "<span></span>"}
        <span class="tip-dim">${fmt(total)} items</span>
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

// ============================================================
// Asset cache — saves maplestory.io images to /assets/ on the server.
// ============================================================
const CACHE_KEY = "maple-wayfarer-asset-cache";
const memory = new Set<string>();

/** API base URL — works locally (http://localhost:3000) and after deploy (via proxy). */
const API = ("__PORT_3000__" as string).startsWith("__") ? "" : "__PORT_3000__";

/** Saves one URL to the server-side /assets/ folder (fire-and-forget). */
export function cacheAsset(url: string) {
  if (!url || memory.has(url)) return;
  memory.add(url);
  const clean = url.split("?")[0];
  fetch(`${API}/api/cache-asset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: clean }) })
    .catch(() => {});
  try {
    const seen = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as string[];
    if (!seen.includes(clean)) { seen.push(clean); localStorage.setItem(CACHE_KEY, JSON.stringify(seen.slice(-5000))); }
  } catch {}
}

/** Rewarms the server cache for URLs the client has seen before. */
export function warmCache() {
  try {
    const seen = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as string[];
    if (seen.length) fetch(`${API}/api/warm-assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: seen }) }).catch(() => {});
  } catch {}
}
