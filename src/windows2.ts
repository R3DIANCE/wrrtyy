// Idle-RPG windows: Equipment, Inventory, Crafting, Auction House, stage/boss HUD, offline rewards and the main menu.
import { AH_TAX, goodsName, goodsValue, type Goods } from "./auction.ts";
import { charUrlFor } from "./game.ts";
import { ItemBrowser } from "./item-browser.ts";
import {
  GEAR, MATS, MAX_STAR, POT_LABEL, RARITY, RARITY_COLOR, RARITY_INK, SLOTS, SLOT_NAME, cubeCost, gearIcon, gearStats, gearValue, matIcon,
  npcSellPrice, recipeGearId, recipes, starCost, starMat, starRate, type Gear, type Recipe, type Slot,
} from "./items.ts";
import { ITEMS, itemIcon } from "./skills.ts";
import { el, type Windows } from "./windows.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => Math.round(n).toLocaleString();
const icon = (url: string, cls = "ic") => `<span class="${cls}" style="background-image:url('${url}')"></span>`;
const stars = (n: number) => (n ? `<span class="stars">${"★".repeat(Math.min(n, 15))}</span>` : "");
const dur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

type Tab<T extends string> = { cur: T };

export class ExtWindows {
  equipWin: HTMLElement; invWin: HTMLElement; craftWin: HTMLElement; ahWin: HTMLElement; menuPop: HTMLElement;
  stageHud: HTMLElement; bossBar: HTMLElement; offline: HTMLElement | null = null;
  items: ItemBrowser;
  tips = new Map<string, () => string>();
  sig: Record<string, string> = {};
  invTab: Tab<"equip" | "use" | "etc"> = { cur: "equip" };
  craftTab: Tab<"gear" | "refine" | "star" | "cube"> = { cur: "gear" };
  ahTab: Tab<"browse" | "sell" | "mine"> = { cur: "browse" };
  ahFilter: "all" | "gear" | "mat" | "use" = "all";
  pick: string | null = null; // gear uid chosen in Star Force / Cube
  lastResult = "";

  constructor(public w: Windows) {
    const g = w.game;
    const E = w.win.equip;
    // The real MapleStory equip panel background is 184×290; we lay our socket
    // columns out beside it with the stats block underneath, so the window is
    // wider than the raw sprite but keeps its MapleStory chrome.
    this.equipWin = w.makeWindow("equip-win", 350, 440, "EQUIPMENT", 40, 60);
    this.invWin = w.makeWindow("inv-win", 222, 318, "ITEM INVENTORY", innerWidth - 470, 110);
    this.craftWin = w.makeWindow("craft-win", 340, 380, "CRAFTING", innerWidth / 2 - 170, 80);
    this.ahWin = w.makeWindow("ah-win", 440, 400, "AUCTION HOUSE", innerWidth / 2 - 220, 70);
    for (const win of [this.equipWin, this.invWin, this.craftWin, this.ahWin]) {
      el("div", "x-body", win);
      win.addEventListener("click", (e) => this.onClick(e as MouseEvent));
      win.addEventListener("contextmenu", (e) => this.onRightClick(e as MouseEvent));
      win.addEventListener("pointermove", (e) => {
        if (w.ghost) return;
        const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
        const f = t && this.tips.get(t.dataset.tip!);
        if (f) w.showTip(f(), (e as PointerEvent).clientX, (e as PointerEvent).clientY); else w.hideTip();
      });
      win.addEventListener("pointerleave", () => w.hideTip());
    }
    w.item = this.invWin;

    this.menuPop = el("div", "menu-pop hidden", document.body);
    this.items = new ItemBrowser(w);
    const entries: [string, string, () => void][] = [
      ["Character Stats", "S", () => w.toggle(w.stat)], ["Skills", "K", () => w.toggle(w.skill)], ["Equipment", "E", () => this.open("equip")],
      ["Inventory", "I", () => this.open("inv")], ["Crafting", "J", () => this.open("craft")], ["Auction House", "H", () => this.open("ah")],
      ["All Items", "L", () => this.items.open()],
      ["Auto Settings", "B·RMB", () => w.toggle(w.autoWin)],
    ];
    for (const [label, key, fn] of entries) {
      const b = el("button", "menu-pop-item", this.menuPop) as HTMLButtonElement;
      b.type = "button"; b.innerHTML = `<span>${label}</span><kbd>${key}</kbd>`;
      b.addEventListener("click", () => { this.menuPop.classList.add("hidden"); fn(); });
    }
    addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".menu-pop, .menu-btn")) this.menuPop.classList.add("hidden"); });

    this.stageHud = el("div", "stage-hud", w.hudRoot);
    this.stageHud.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest(".boss-go")) g.challengeBoss(); });
    this.bossBar = el("div", "boss-bar hidden", w.hudRoot);
    g.onBoss = (m) => {
      this.bossBar.classList.toggle("hidden", !m);
      if (m) this.bossBar.innerHTML = `${icon(m.data.books.stand?.[0]?.url ?? "", "boss-ic")}<div class="boss-main"><div class="boss-name">${esc(m.data.name.trim())} <small>Lv.${m.data.meta?.level ?? "?"}</small></div><div class="boss-hp"><div class="boss-fill"></div><span class="boss-num"></span></div></div><div class="boss-time"></div>`;
    };
    g.onOffline = (r) => this.showOffline(r);
  }

  open(k: "equip" | "inv" | "craft" | "ah") {
    const win = { equip: this.equipWin, inv: this.invWin, craft: this.craftWin, ah: this.ahWin }[k];
    const wasHidden = win.classList.contains("hidden");
    if (k === "ah" && wasHidden) this.w.game.ah.refresh(Date.now());
    // Panels open in full (sprite) mode; the compact text-only mode is available
    // as a secondary view via the window's own toggle, not forced on open.
    win.classList.remove("text-only");
    if (k === "equip") this.renderEquip();
    else if (k === "inv") this.renderInv();
    else if (k === "craft") this.renderCraft();
    else this.renderAh();
    if (wasHidden) win.classList.remove("hidden");
    this.sig = {};
  }
  toggleMenu(anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    this.menuPop.classList.toggle("hidden");
    this.menuPop.style.left = `${Math.min(innerWidth - 170, r.left - 60)}px`;
    this.menuPop.style.bottom = `${innerHeight - r.top + 4}px`;
  }

  // ------------------------------------------------------------- tooltips
  gearTip(g: Gear, note = "") {
    const b = GEAR.get(g.id);
    if (!b) return "";
    const st = gearStats(g), game = this.w.game;
    const sockets = game.socketsFor(b.slot);
    const cur = sockets.map((s) => game.eq[s]).find((x) => x && x.uid !== g.uid) ?? game.eq[sockets[0]];
    const cs = cur && cur.uid !== g.uid ? gearStats(cur) : null;
    const diff = (k: keyof typeof st) => (cs ? (st[k] - cs[k] > 0 ? ` <span class="up">(+${st[k] - cs[k]})</span>` : st[k] - cs[k] < 0 ? ` <span class="down">(${st[k] - cs[k]})</span>` : "") : "");
    const lines = (["watk", "str", "dex", "int", "luk", "hp", "def"] as const).filter((k) => st[k]).map((k) => `<p>${{ watk: "ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "Max HP", def: "DEF" }[k]}: +${st[k]}${diff(k)}</p>`).join("");
    const pot = g.pot.length ? `<p class="pot-head" style="color:${RARITY_COLOR[g.rarity]}">${RARITY[g.rarity]} Potential</p>${g.pot.map((p) => `<p class="pot">${POT_LABEL[p.stat]}: +${p.pct}%</p>`).join("")}` : "";
    const req = game.stats.level < b.req ? `<p class="tip-warn">REQ LEV ${b.req}</p>` : `<p class="tip-dim">REQ LEV ${b.req}</p>`;
    const slotLabel = sockets.length > 1 ? "Ring" : SLOT_NAME[b.slot as Slot] ?? b.slot;
    return `<div class="gtip" style="--rc:${RARITY_COLOR[g.rarity]}">${stars(g.star)}<b style="color:${RARITY_COLOR[g.rarity]}">${esc(b.name)}${g.star ? ` (+${g.star})` : ""}</b><p class="tip-dim">${RARITY[g.rarity]} · ${slotLabel}</p>${req}${lines}${pot}<p class="tip-dim">Value ≈ ${fmt(gearValue(g))} mesos</p>${note ? `<p class="tip-dim">${note}</p>` : ""}</div>`;
  }
  tip(key: string, f: () => string) { this.tips.set(key, f); return `data-tip="${key}"`; }
  gearCell(g: Gear, action: string, note: string, extra = "") {
    return `<div class="gcell r${g.rarity}" data-act="${action}" data-uid="${g.uid}" ${this.tip("g" + g.uid, () => this.gearTip(g, note))} ${extra}>${icon(gearIcon(g.id))}${g.star ? `<span class="gstar">★${g.star}</span>` : ""}</div>`;
  }

  // ------------------------------------------------------------- clicks
  onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const g = this.w.game, a = t.dataset.act!, uid = t.dataset.uid ?? "";
    this.w.hideTip();
    switch (a) {
      case "unequip": g.unequip(t.dataset.slot as Slot); break;
      case "equip": g.equip(uid); break;
      case "invtab": this.invTab.cur = t.dataset.v as any; break;
      case "selljunk": g.sellJunk(); break;
      case "crafttab": this.craftTab.cur = t.dataset.v as any; this.lastResult = ""; break;
      case "craft": { const r = recipes().find((x) => x.id === t.dataset.v); if (r) this.lastResult = g.craft(r) ?? ""; break; }
      case "pick": this.pick = uid; this.lastResult = ""; break;
      case "star": {
        const r = g.enhance(this.pick ?? "");
        this.lastResult = r === "success" ? "SUCCESS" : r === "fail" ? "FAILED" : r === "max" ? "MAX STARS" : r === "cost" ? "NOT ENOUGH MESOS OR MATERIALS" : "";
        this.flash(r === "success");
        break;
      }
      case "cube": { const ok = g.cube(this.pick ?? ""); this.lastResult = ok ? "POTENTIAL RESET" : "NOT ENOUGH MESOS OR SLIME BUBBLES"; this.flash(ok); break; }
      case "ahtab": this.ahTab.cur = t.dataset.v as any; break;
      case "ahfilter": this.ahFilter = t.dataset.v as any; break;
      case "ahrefresh": if (g.stats.meso >= 100) { g.stats.meso -= 100; g.ah.listings = []; g.ah.refresh(Date.now()); g.onChange(); } break;
      case "buy": g.ahBuy(t.dataset.v!); break;
      case "list": {
        const row = t.closest<HTMLElement>(".ah-row")!;
        const price = Math.max(1, Math.round(Number((row.querySelector("input") as HTMLInputElement).value) || 0));
        const goods = this.sellGoods(t.dataset.v!);
        if (goods) g.ahList(goods, price);
        break;
      }
      case "collect": g.ahCollect(t.dataset.v!); break;
      default: return;
    }
    this.sig = {};
  }
  onRightClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act='equip']");
    if (!t) return;
    e.preventDefault();
    this.w.hideTip();
    this.w.game.sellGear(t.dataset.uid!);
    this.sig = {};
  }
  flash(ok: boolean) {
    const r = this.craftWin.querySelector(".craft-result");
    r?.classList.remove("ok", "bad");
    requestAnimationFrame(() => r?.classList.add(ok ? "ok" : "bad"));
  }

  // ------------------------------------------------------------- equipment
  renderEquip() {
    const g = this.w.game, gt = g.gt;
    const body = this.equipWin.querySelector(".x-body") as HTMLElement;
    // KMS 2026: accessories on the left, armor on the right, character in the middle.
    const leftAcc: Slot[] = ["ring1", "ring2", "ring3", "ring4", "earrings", "pendant"];
    const leftAcc2: Slot[] = ["hat", "top", "bottom", "shoes"];
    const rightArm: Slot[] = ["weapon", "shield", "cape", "gloves", "shoulder"];
    const rightArm2: Slot[] = ["belt", "pocket", "emblem", "badge"];
    const cellFor = (s: Slot) => {
      const it = g.eq[s];
      if (!it) return `<div class="eslot empty" title="${SLOT_NAME[s]}"><span>${SLOT_NAME[s]}</span></div>`;
      return `<div class="eslot" data-slot="${s}">${this.gearCell(it, "unequip", "Click to unequip", `data-slot="${s}"`)}</div>`;
    };
    let cells = `<div class="e-left-col">${leftAcc.map(cellFor).join("")}</div>`;
    cells += `<div class="e-left-col">${leftAcc2.map(cellFor).join("")}</div>`;
    cells += `<div class="eprev"><img alt="Character preview" src="${charUrlFor(g.look, "stand1", 0)}"></div>`;
    cells += `<div class="e-right-col">${rightArm.map(cellFor).join("")}</div>`;
    cells += `<div class="e-right-col">${rightArm2.map(cellFor).join("")}</div>`;
    const [lo, hi] = g.damageRange();
    const row = (k: string, v: string) => `<div class="erow"><span>${k}</span><b>${v}</b></div>`;
    body.innerHTML = `<div class="egrid-new">${cells}</div>
      <div class="ecp"><small>COMBAT POWER</small><b>${fmt(g.combatPower())}</b></div>
      <div class="estats">${row("Damage", `${fmt(lo)} ~ ${fmt(hi)}`)}${row("ATT", fmt(g.watk()))}${row("STR", fmt(g.totalStr()))}${row("DEX", fmt(g.totalDex()))}${row("INT", fmt(g.totalInt()))}${row("LUK", fmt(g.totalLuk()))}
      ${row("Max HP", fmt(g.stats.maxHp))}${row("DEF", fmt(gt.def))}${row("Boss Dmg", `${gt.boss}%`)}${row("EXP / Meso / Drop", `+${gt.exp}% / +${gt.meso}% / +${gt.drop}%`)}</div>
      <p class="ehint">Click a piece to unequip it. Equip from the Inventory (I). Rings, pendants and badges stack in multiple sockets.</p>`;
  }

  // ------------------------------------------------------------- inventory
  renderInv() {
    const g = this.w.game, tab = this.invTab.cur;
    const body = this.invWin.querySelector(".x-body") as HTMLElement;
    const tabs = (["equip", "use", "etc"] as const).map((t) => `<span data-act="invtab" data-v="${t}" class="${t === tab ? "on" : ""}">${t.toUpperCase()}</span>`).join("");
    let grid = "";
    if (tab === "equip") {
      const bag = [...g.bag].sort((a, b) => b.rarity - a.rarity || (GEAR.get(b.id)?.req ?? 0) - (GEAR.get(a.id)?.req ?? 0));
      for (const it of bag) grid += this.gearCell(it, "equip", `Click to equip · right-click to sell (${fmt(npcSellPrice(it))} mesos)`);
      for (let i = bag.length; i < 20; i++) grid += `<div class="gcell blank"></div>`;
    } else if (tab === "use") {
      for (const id of Object.keys(ITEMS).map(Number)) {
        if (!(g.inv[id] > 0)) continue;
        grid += `<div class="gcell" data-use="${id}" ${this.tip("u" + id, () => this.w.actionTip({ t: "item", id }) + `<p class="tip-dim">Click to use · drag to a quick slot</p>`)}>${icon(itemIcon(id), "ic grab")}<span class="cnt">${g.inv[id]}</span></div>`;
      }
      for (let i = 0; i < 15; i++) grid += `<div class="gcell blank"></div>`;
    } else {
      for (const [id, n] of Object.entries(g.mats)) {
        if (!(n > 0)) continue;
        grid += `<div class="gcell" ${this.tip("m" + id, () => `<b>${esc(MATS.get(+id) ?? "Material")}</b><p class="tip-dim">Crafting material · ${n} owned</p>`)}>${icon(matIcon(+id))}<span class="cnt">${n}</span></div>`;
      }
      for (let i = 0; i < 15; i++) grid += `<div class="gcell blank"></div>`;
    }
    body.innerHTML = `<div class="xtabs">${tabs}</div><div class="inv-grid">${grid}</div>
      <div class="inv-foot">${tab === "equip" ? `<button type="button" class="xbtn" data-act="selljunk" title="Sell every Normal-grade item without stars">Sell Normal</button><span class="tip-dim">${g.bag.length}/48</span>` : "<span></span>"}<span class="meso">${fmt(g.stats.meso)}</span></div>`;
    for (const c of body.querySelectorAll<HTMLElement>("[data-use]")) {
      const id = Number(c.dataset.use);
      this.w.draggable(c, () => ({ t: "item", id }), undefined, () => g.useAction({ t: "item", id }));
    }
  }

  // ------------------------------------------------------------- crafting
  needsHtml(r: Recipe) {
    const g = this.w.game;
    return r.needs.map(([id, n]) => {
      const have = g.mats[id] ?? 0;
      return `<span class="need ${have >= n ? "" : "miss"}" ${this.tip("n" + id, () => `<b>${esc(MATS.get(id) ?? "Material")}</b><p class="tip-dim">Owned ${g.mats[id] ?? 0}</p>`)}>${icon(matIcon(id), "ic sm")}${have}/${n}</span>`;
    }).join("") + `<span class="need ${g.stats.meso >= r.meso ? "" : "miss"}">${fmt(r.meso)} m</span>`;
  }
  renderCraft() {
    const g = this.w.game, tab = this.craftTab.cur;
    const body = this.craftWin.querySelector(".x-body") as HTMLElement;
    const tabs = ([["gear", "GEAR"], ["refine", "REFINE & POTIONS"], ["star", "STAR FORCE"], ["cube", "CUBE"]] as const)
      .map(([t, l]) => `<span data-act="crafttab" data-v="${t}" class="${t === tab ? "on" : ""}">${l}</span>`).join("");
    let html = "";
    if (tab === "gear" || tab === "refine") {
      const list = recipes().filter((r) => (tab === "gear" ? r.kind === "gear" : r.kind !== "gear"))
        .sort((a, b) => Number(g.stats.level < a.level) - Number(g.stats.level < b.level) || a.level - b.level);
      html = `<p class="xnote">${tab === "gear" ? "Crafted gear is always Rare or better. Materials drop from monsters and bosses." : "Refine 10 ores into a plate or gem. Brew potions from monster drops."}</p><div class="xlist">`;
      for (const r of list) {
        const out = r.out;
        const ic = out.t === "gear" ? gearIcon(recipeGearId(out.slot, out.tier) ?? 1302000) : out.t === "mat" ? matIcon(out.id) : itemIcon(out.id);
        const locked = g.stats.level < r.level;
        const tipKey = "r" + r.id;
        this.tips.set(tipKey, () => {
          if (out.t !== "gear") return `<b>${esc(r.name)}</b>`;
          const b = GEAR.get(recipeGearId(out.slot, out.tier)!)!;
          return `<b>${esc(b.name)}</b><p class="tip-dim">${SLOT_NAME[out.slot as Slot]} · REQ LEV ${b.req}</p><p>ATT +${b.watk} · STR +${b.str} · DEX +${b.dex} · INT +${b.int ?? 0} · LUK +${b.luk ?? 0} · HP +${b.hp} · DEF +${b.def}</p><p class="tip-dim">Crafting rolls Rare ~ Legendary potential.</p>`;
        });
        html += `<div class="xrow ${locked ? "locked" : ""}"><div class="gcell" data-tip="${tipKey}">${icon(ic)}</div><div class="xinfo"><b>${esc(r.name)}</b>${out.t === "gear" ? `<small>${SLOT_NAME[out.slot as Slot]} · Lv ${r.level}</small>` : ""}<div class="needs">${this.needsHtml(r)}</div></div>
          <button type="button" class="xbtn" data-act="craft" data-v="${r.id}" ${g.canCraft(r) ? "" : "disabled"}>${locked ? `Lv ${r.level}` : "Craft"}</button></div>`;
      }
      html += `</div>`;
    } else {
      const all: { g: Gear; where: string }[] = [
        ...SLOTS.map((s) => g.eq[s]).filter((x): x is Gear => !!x).map((x) => ({ g: x, where: "Equipped" })),
        ...g.bag.map((x) => ({ g: x, where: "Inventory" })),
      ];
      if (!this.pick || !all.some((x) => x.g.uid === this.pick)) this.pick = all[0]?.g.uid ?? null;
      const sel = all.find((x) => x.g.uid === this.pick)?.g;
      const list = all.map((x) => `<div class="pickc ${x.g.uid === this.pick ? "on" : ""}">${this.gearCell(x.g, "pick", x.where)}</div>`).join("");
      let panel = "<p class='xnote'>No equipment.</p>";
      if (sel) {
        const b = GEAR.get(sel.id)!;
        if (tab === "star") {
          const cost = starCost(sel), mat = starMat(sel.star), have = g.mats[mat] ?? 0;
          const st = gearStats(sel), next = gearStats({ ...sel, star: Math.min(MAX_STAR, sel.star + 1) });
          const gain = (["watk", "str", "dex", "int", "luk", "hp", "def"] as const).filter((k) => next[k] > st[k]).map((k) => `${{ watk: "ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", hp: "HP", def: "DEF" }[k]} +${next[k] - st[k]}`).join(" · ");
          panel = `<div class="sf-head">${icon(gearIcon(sel.id), "ic lg")}<div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="stars big">${"★".repeat(sel.star)}<span class="dim">${"★".repeat(MAX_STAR - sel.star)}</span></div></div></div>
            ${sel.star >= MAX_STAR ? `<p class="xnote">Maximum stars reached.</p>` : `<div class="sf-grid"><span>Success</span><b>${Math.round(starRate(sel.star) * 100)}%</b><span>Failure</span><b>${100 - Math.round(starRate(sel.star) * 100)}% (stars kept)</b>
            <span>Next star</span><b>${gain || "—"}</b><span>Cost</span><b class="${g.stats.meso >= cost ? "" : "miss"}">${fmt(cost)} mesos</b>
            <span>Material</span><b class="${have >= 1 ? "" : "miss"}">${icon(matIcon(mat), "ic sm")} ${esc(MATS.get(mat) ?? "")} ${have}/1</b></div>
            <button type="button" class="xbtn big" data-act="star">Enhance ★${sel.star + 1}</button>`}`;
        } else {
          const cost = cubeCost(sel), have = g.mats[4000010] ?? 0;
          panel = `<div class="sf-head">${icon(gearIcon(sel.id), "ic lg")}<div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="tip-dim">${RARITY[sel.rarity]} potential</div></div></div>
            <div class="pot-box" style="border-color:${RARITY_COLOR[sel.rarity]}">${sel.pot.length ? sel.pot.map((p) => `<p>${POT_LABEL[p.stat]}: +${p.pct}%</p>`).join("") : "<p class='tip-dim'>No potential yet</p>"}</div>
            <div class="sf-grid"><span>Tier-up chance</span><b>${[30, 10, 4, 1.5, 0][sel.rarity]}%</b><span>Cost</span><b class="${g.stats.meso >= cost ? "" : "miss"}">${fmt(cost)} mesos</b>
            <span>Material</span><b class="${have >= 5 ? "" : "miss"}">${icon(matIcon(4000010), "ic sm")} Slime Bubble ${have}/5</b></div>
            <button type="button" class="xbtn big" data-act="cube">Use Cube</button>`;
        }
      }
      html = `<div class="sf"><div class="pick-list">${list}</div><div class="sf-panel">${panel}<div class="craft-result">${this.lastResult}</div></div></div>`;
    }
    body.innerHTML = `<div class="xtabs">${tabs}</div>${html}<div class="inv-foot"><span class="tip-dim">${tab === "gear" || tab === "refine" ? "" : "Pick a piece on the left"}</span><span class="meso">${fmt(g.stats.meso)}</span></div>`;
  }
  renderCraftText() {
    if (!this.craftWin.classList.contains("text-only")) return;
    const g = this.w.game, tab = this.craftTab.cur;
    const body = this.craftWin.querySelector(".text-only-body") as HTMLElement;
    let html = "";
    if (tab === "gear" || tab === "refine") {
      const list = recipes().filter((r) => (tab === "gear" ? r.kind === "gear" : r.kind !== "gear"))
        .sort((a, b) => Number(g.stats.level < a.level) - Number(g.stats.level < b.level) || a.level - b.level);
      html = `<p class="xnote">${tab === "gear" ? "Crafted gear is always Rare or better." : "Refine 10 ores into a plate or gem."}</p>`;
      for (const r of list) {
        const out = r.out;
        const ic = out.t === "gear" ? gearIcon(recipeGearId(out.slot, out.tier) ?? 1302000) : out.t === "mat" ? matIcon(out.id) : itemIcon(out.id);
        const locked = g.stats.level < r.level;
        const gearName = out.t === "gear" ? GEAR.get(recipeGearId(out.slot, out.tier)!)?.name : MATS.get(out.id);
        html += `<div class="craft-row"><span class="s-ic" style="background-image:url('${ic}')"></span>
          <span class="s-meta"><span class="s-name">${esc(r.name)}</span><span class="s-lv">${esc(gearName ?? "")}</span></span>
          <button data-c="${r.id}" ${g.canCraft(r) ? "" : "disabled"}>Craft</button></div>`;
      }
    } else {
      const all: { g: Gear; where: string }[] = [
        ...SLOTS.map((s) => g.eq[s]).filter((x): x is Gear => !!x).map((x) => ({ g: x, where: "Equipped" })),
        ...g.bag.map((x) => ({ g: x, where: "Inventory" })),
      ];
      if (!this.pick || !all.some((x) => x.g.uid === this.pick)) this.pick = all[0]?.g.uid ?? null;
      const sel = all.find((x) => x.g.uid === this.pick)?.g;
      const list = all.map((x) => `<div class="pickc"><span class="e-ic" style="background-image:url('${gearIcon(x.g.id)}')"></span><span class="e-name">${esc(GEAR.get(x.g.id)?.name ?? "?")}</span><span class="e-stats">${x.where}</span></div>`).join("");
      let panel = "<p class='xnote'>No equipment.</p>";
      if (sel) {
        const b = GEAR.get(sel.id)!;
        if (tab === "star") {
          const cost = starCost(sel), mat = starMat(sel.star), have = g.mats[mat] ?? 0;
          panel = `<div class="sf-head"><span class="e-ic" style="background-image:url('${gearIcon(sel.id)}')"></span><div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="stars big">${"★".repeat(sel.star)}<span class="dim">${"★".repeat(MAX_STAR - sel.star)}</span></div></div></div>
            ${sel.star >= MAX_STAR ? `<p class="xnote">Maximum stars reached.</p>` : `<div class="sf-grid"><span>Success</span><b>${Math.round(starRate(sel.star) * 100)}%</b><span>Failure</span><b>${100 - Math.round(starRate(sel.star) * 100)}%</b><span>Next star</span><b>${gearStats({ ...sel, star: Math.min(MAX_STAR, sel.star + 1) })}</b><span>Cost</span><b>${fmt(cost)}</b><span>Material</span><b>${have}/1</b></div>
            <button data-s="${sel.uid}" ${g.stats.meso >= cost ? "" : "disabled"}>Enhance</button>`}`;
        } else {
          const cost = cubeCost(sel), have = g.mats[4000010] ?? 0;
          panel = `<div class="sf-head"><span class="e-ic" style="background-image:url('${gearIcon(sel.id)}')"></span><div><b style="color:${RARITY_INK[sel.rarity]}">${esc(b.name)}</b><div class="tip-dim">${RARITY[sel.rarity]} potential</div></div></div>
            <div class="pot-box" style="border-color:${RARITY_COLOR[sel.rarity]}">${sel.pot.length ? sel.pot.map((p) => `<p>${POT_LABEL[p.stat]}: +${p.pct}%</p>`).join("") : "<p class='tip-dim'>No potential yet</p>"}</div>
            <div class="sf-grid"><span>Tier-up</span><b>${[30, 10, 4, 1.5, 0][sel.rarity]}%</b><span>Cost</span><b>${fmt(cost)}</b><span>Material</span><b>${have}/5</b></div>
            <button data-cube="${sel.uid}" ${g.stats.meso >= cost ? "" : "disabled"}>Use Cube</button>`;
        }
      }
      html = `<div class="pick-list">${list}</div><div class="sf-panel">${panel}<div class="craft-result">${this.lastResult}</div></div>`;
    }
    body.innerHTML = `<h3>Crafting</h3>${html}`;
    body.querySelectorAll("button[data-c]").forEach((b) => b.addEventListener("click", () => {
      const v = (b as HTMLElement).dataset.c!;
      if (v.startsWith("s")) { if (g.enhance(v)) this.lastResult = "SUCCESS"; }
      else if (v.startsWith("c")) { const r = recipes().find((x) => x.id === v); if (r) this.lastResult = g.craft(r) ?? ""; }
    }));
    body.querySelectorAll("button[data-cube]").forEach((b) => b.addEventListener("click", () => {
      if (g.cube(this.pick ?? "")) this.lastResult = "POTENTIAL RESET";
    }));
  }
  renderAhText() {
    if (!this.ahWin.classList.contains("text-only")) return;
    const g = this.w.game, ah = g.ah, tab = this.ahTab.cur;
    const body = this.ahWin.querySelector(".text-only-body") as HTMLElement;
    let html = "";
    if (tab === "browse") {
      if (!ah.listings.length) ah.refresh(Date.now());
      const f = this.ahFilter;
      const rows = ah.listings.filter((l) => f === "all" || l.goods.t === f).map((l) => {
        const v = goodsValue(l.goods), deal = l.price / v;
        const tag = deal < 0.9 ? "below" : deal > 1.2 ? "above" : "fair";
        return `<div class="ah-row"><span class="a-ic" style="background-image:url('${this.goodsIcon(l.goods)}')"></span>
          <span class="s-meta"><span class="s-name">${esc(goodsName(l.goods))}</span><span class="s-lv">${esc(l.seller)} · ${tag}</span></span>
          <span class="a-price">${fmt(l.price)}</span><button data-b="${l.lid}" ${g.stats.meso >= l.price ? "" : "disabled"}>Buy</button></div>`;
      }).join("");
      html = rows || "<p class='xnote'>No listings.</p>";
    } else if (tab === "sell") {
      const rows: string[] = [];
      const row = (key: string, x: Goods) => {
        const v = goodsValue(x);
        rows.push(`<div class="ah-row"><span class="a-ic" style="background-image:url('${this.goodsIcon(x)}')"></span>
          <span class="s-meta"><span class="s-name">${esc(goodsName(x))}</span><span class="s-lv">Market ≈ ${fmt(v)}</span></span>
          <input type="number" min="1" step="1" value="${v}" aria-label="Price in mesos">
          <button data-l="${key}">List</button></div>`);
      };
      for (const it of [...g.bag].sort((a, b) => gearValue(b) - gearValue(a))) row(`g:${it.uid}`, { t: "gear", gear: it });
      for (const [id, n] of Object.entries(g.mats)) if (n > 0) row(`m:${id}`, { t: "mat", id: +id, n: Math.min(100, n) });
      for (const [id, n] of Object.entries(g.inv)) if (n > 0) row(`u:${id}`, { t: "use", id: +id, n: Math.min(100, n) });
      html = rows.join("") || "<p class='xnote'>Nothing to sell.</p>";
    } else {
      const rows = ah.mine.map((m) => `<div class="ah-row"><span class="a-ic" style="background-image:url('${this.goodsIcon(m.goods)}')"></span>
        <span class="s-meta"><span class="s-name">${esc(goodsName(m.goods))}</span><span class="s-lv">${m.sold ? "SOLD" : "Waiting"}</span></span>
        <span class="a-price">${fmt(m.price)}</span><button data-c="${m.lid}" ${m.sold ? "" : "disabled"}>${m.sold ? "Collect" : "Cancel"}</button></div>`).join("");
      html = rows || "<p class='xnote'>You have no listings.</p>";
    }
    body.innerHTML = `<h3>Auction House</h3>${html}`;
    body.querySelectorAll("button[data-l]").forEach((b) => b.addEventListener("click", () => {
      const row = (b as HTMLElement).closest(".ah-row")!;
      const price = Math.max(1, Math.round(Number((row.querySelector("input") as HTMLInputElement).value) || 0));
      const goods = this.sellGoods((b as HTMLElement).dataset.l!);
      if (goods) g.ahList(goods, price);
    }));
    body.querySelectorAll("button[data-b]").forEach((b) => b.addEventListener("click", () => g.ahBuy((b as HTMLElement).dataset.b!)));
    body.querySelectorAll("button[data-c]").forEach((b) => b.addEventListener("click", () => g.ahCollect((b as HTMLElement).dataset.c!)));
  }

  // ------------------------------------------------------------- auction house
  sellGoods(key: string): Goods | null {
    const g = this.w.game;
    const [t, id] = key.split(":");
    if (t === "g") { const it = g.bag.find((x) => x.uid === id); return it ? { t: "gear", gear: it } : null; }
    if (t === "m") { const n = Math.min(100, g.mats[+id] ?? 0); return n > 0 ? { t: "mat", id: +id, n } : null; }
    const n = Math.min(100, g.inv[+id] ?? 0); return n > 0 ? { t: "use", id: +id, n } : null;
  }
  goodsIcon(x: Goods) { return x.t === "gear" ? gearIcon(x.gear.id) : x.t === "mat" ? matIcon(x.id) : itemIcon(x.id); }
  goodsCell(x: Goods, key: string) {
    if (x.t === "gear") return this.gearCell(x.gear, "", "");
    return `<div class="gcell" ${this.tip(key, () => `<b>${esc(goodsName(x))}</b><p class="tip-dim">Market value ≈ ${fmt(goodsValue(x))} mesos</p>`)}>${icon(this.goodsIcon(x))}<span class="cnt">${x.n}</span></div>`;
  }
  goodsLabel(x: Goods) {
    const c = x.t === "gear" ? RARITY_INK[x.gear.rarity] : "#333";
    return `<b style="color:${c}">${esc(goodsName(x))}${x.t === "gear" && x.gear.star ? ` ★${x.gear.star}` : ""}</b>`;
  }
  renderAh() {
    const g = this.w.game, ah = g.ah, tab = this.ahTab.cur;
    const body = this.ahWin.querySelector(".x-body") as HTMLElement;
    const sold = ah.mine.filter((m) => m.sold).length;
    const tabs = ([["browse", "BROWSE"], ["sell", "SELL"], ["mine", `MY LISTINGS${sold ? ` (${sold})` : ""}`]] as const)
      .map(([t, l]) => `<span data-act="ahtab" data-v="${t}" class="${t === tab ? "on" : ""}">${l}</span>`).join("");
    let html = "";
    if (tab === "browse") {
      if (!ah.listings.length) ah.refresh(Date.now());
      const f = this.ahFilter;
      const chips = ([["all", "All"], ["gear", "Equipment"], ["mat", "Materials"], ["use", "Consumables"]] as const)
        .map(([k, l]) => `<span data-act="ahfilter" data-v="${k}" class="chip ${k === f ? "on" : ""}">${l}</span>`).join("");
      const rows = ah.listings.filter((l) => f === "all" || l.goods.t === f).map((l) => {
        const v = goodsValue(l.goods), deal = l.price / v;
        const tag = deal < 0.9 ? `<span class="deal good">${Math.round((1 - deal) * 100)}% below market</span>` : deal > 1.2 ? `<span class="deal bad">${Math.round((deal - 1) * 100)}% above</span>` : `<span class="deal">fair price</span>`;
        const req = l.goods.t === "gear" ? GEAR.get(l.goods.gear.id)?.req ?? 0 : 0;
        return `<div class="ah-row">${this.goodsCell(l.goods, "ah" + l.lid)}<div class="xinfo">${this.goodsLabel(l.goods)}<small>${esc(l.seller)}${req ? ` · Lv ${req}` : ""} · ${tag}</small></div>
          <div class="ah-price">${fmt(l.price)}<small>mesos</small></div><button type="button" class="xbtn" data-act="buy" data-v="${l.lid}" ${g.stats.meso >= l.price ? "" : "disabled"}>Buy</button></div>`;
      }).join("");
      html = `<div class="ah-bar">${chips}<button type="button" class="xbtn" data-act="ahrefresh" title="Fetch new listings (100 mesos)">Refresh · 100</button></div><div class="xlist ah">${rows || "<p class='xnote'>No listings.</p>"}</div>`;
    } else if (tab === "sell") {
      const rows: string[] = [];
      const row = (key: string, x: Goods) => {
        const v = goodsValue(x);
        rows.push(`<div class="ah-row">${this.goodsCell(x, "s" + key)}<div class="xinfo">${this.goodsLabel(x)}<small>Market ≈ ${fmt(v)} · NPC ${x.t === "gear" ? fmt(npcSellPrice(x.gear)) : "—"}</small></div>
          <input type="number" min="1" step="1" value="${v}" aria-label="Price in mesos"><button type="button" class="xbtn" data-act="list" data-v="${key}">List</button></div>`);
      };
      for (const it of [...g.bag].sort((a, b) => gearValue(b) - gearValue(a))) row(`g:${it.uid}`, { t: "gear", gear: it });
      for (const [id, n] of Object.entries(g.mats)) if (n > 0) row(`m:${id}`, { t: "mat", id: +id, n: Math.min(100, n) });
      for (const [id, n] of Object.entries(g.inv)) if (n > 0) row(`u:${id}`, { t: "use", id: +id, n: Math.min(100, n) });
      html = `<p class="xnote">Price below market to sell fast. Listing fee 1% · sales tax ${AH_TAX * 100}%. Buyers shop while you play.</p><div class="xlist ah tall">${rows.join("") || "<p class='xnote'>Nothing to sell.</p>"}</div>`;
    } else {
      const rows = ah.mine.map((m) => `<div class="ah-row">${this.goodsCell(m.goods, "my" + m.lid)}<div class="xinfo">${this.goodsLabel(m.goods)}<small>${m.sold ? `<span class="deal good">SOLD · you receive ${fmt(m.price * (1 - AH_TAX))}</span>` : `Waiting for a buyer · listed ${dur((Date.now() - m.listedAt) / 1000)} ago`}</small></div>
        <div class="ah-price">${fmt(m.price)}<small>mesos</small></div><button type="button" class="xbtn ${m.sold ? "gold" : ""}" data-act="collect" data-v="${m.lid}">${m.sold ? "Collect" : "Cancel"}</button></div>`).join("");
      html = `<div class="xlist ah tall">${rows || "<p class='xnote'>You have no listings. Sell items from the SELL tab.</p>"}</div>`;
    }
    body.innerHTML = `<div class="xtabs">${tabs}</div>${html}<div class="inv-foot"><span class="tip-dim">${ah.listings.length} listings on the market</span><span class="meso">${fmt(g.stats.meso)}</span></div>`;
  }

  // ------------------------------------------------------------- offline rewards
  showOffline(r: { seconds: number; kills: number; exp: number; meso: number; mats: Record<number, number>; gear: Gear[] }) {
    this.offline?.remove();
    const box = el("div", "offline", document.body);
    this.offline = box;
    const mats = Object.entries(r.mats).filter(([, n]) => n > 0).map(([id, n]) => `<div class="gcell">${icon(matIcon(+id))}<span class="cnt">${n}</span></div>`).join("");
    const gear = r.gear.map((g) => `<div class="gcell r${g.rarity}">${icon(gearIcon(g.id))}</div>`).join("");
    box.innerHTML = `<div class="offline-card win-css"><div class="win-title">WELCOME BACK</div>
      <p class="off-lead">Your character kept hunting for <b>${dur(r.seconds)}</b> while you were away.</p>
      <div class="off-grid"><span>Monsters defeated</span><b>${fmt(r.kills)}</b><span>EXP</span><b>${fmt(r.exp)}</b><span>Mesos</span><b>${fmt(r.meso)}</b></div>
      <div class="off-items">${mats}${gear}</div>
      <div class="off-btns"><button type="button" class="xbtn big gold" data-m="1">Claim</button></div>
      <p class="tip-dim off-note">Offline hunting runs at 60% of your recent Auto Battle pace, up to 12 hours.</p></div>`;
    box.querySelector("button")!.addEventListener("click", () => { this.w.game.claimOffline(r, 1); box.remove(); this.offline = null; this.sig = {}; });
  }

  renderEquipText() {
    if (!this.equipWin.classList.contains("text-only")) return;
    const g = this.w.game, gt = g.gt;
    const body = this.equipWin.querySelector(".text-only-body") as HTMLElement;
    if (!body) return;
    const cells = SLOTS.map((s) => {
      const it = g.eq[s];
      return it ? `<div class="equip-slot" data-slot="${s}"><span class="e-ic" style="background-image:url('${gearIcon(it.id)}')"></span><span class="e-name">${esc(GEAR.get(it.id)?.name ?? "?")}</span><span class="e-stats">${it.star ? `★${it.star}` : ""}</span></div>`
        : `<div class="equip-slot"><span class="e-name">${SLOT_NAME[s]}</span></div>`;
    }).join("");
    const [lo, hi] = g.damageRange();
    const row = (k: string, v: string) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`;
    body.innerHTML = `<h3>Equipment</h3><div class="equip-grid">${cells}</div>
      <div class="stat-row"><span>COMBAT POWER</span><b>${fmt(g.combatPower())}</b></div>
      <div class="stat-row"><span>Damage</span><b>${fmt(lo)} ~ ${fmt(hi)}</b></div>
      <div class="stat-row"><span>ATT</span><b>${fmt(g.watk())}</b></div>
      <div class="stat-row"><span>STR</span><b>${fmt(g.totalStr())}</b></div>
      <div class="stat-row"><span>DEX</span><b>${fmt(g.totalDex())}</b></div>
      <div class="stat-row"><span>Max HP</span><b>${fmt(g.stats.maxHp)}</b></div>
      <div class="stat-row"><span>DEF</span><b>${fmt(gt.def)}</b></div>
      <div class="stat-row"><span>Boss Dmg</span><b>${gt.boss}%</b></div>
      <div class="stat-row"><span>EXP/Meso/Drop</span><b>+${gt.exp}% / +${gt.meso}% / +${gt.drop}%</b></div>`;
    body.querySelectorAll(".equip-slot[data-slot]").forEach((d) => d.addEventListener("click", () => g.unequip((d as HTMLElement).dataset.slot as Slot)));
  }
  renderInvText() {
    if (!this.invWin.classList.contains("text-only")) return;
    const g = this.w.game, tab = this.invTab.cur;
    const body = this.invWin.querySelector(".text-only-body") as HTMLElement;
    let rows = "";
    if (tab === "equip") {
      const bag = [...g.bag].sort((a, b) => b.rarity - a.rarity);
      rows = bag.map((it) => `<div class="inv-item" data-e="${it.uid}"><span class="e-ic" style="background-image:url('${gearIcon(it.id)}')"></span><span class="i-name">${esc(GEAR.get(it.id)?.name ?? "?")}</span><span class="i-count">${it.star ? `★${it.star}` : ""}</span></div>`).join("");
    } else if (tab === "use") {
      for (const id of Object.keys(ITEMS).map(Number)) {
        if (!(g.inv[id] > 0)) continue;
        const it = ITEMS[id];
        rows += `<div class="inv-item" data-u="${id}"><span class="i-ic" style="background-image:url('${itemIcon(id)}')"></span><span class="i-name">${esc(it.name)}</span><span class="i-count">${g.inv[id]}</span></div>`;
      }
    } else {
      for (const [id, n] of Object.entries(g.mats)) {
        if (!(n > 0)) continue;
        rows += `<div class="inv-item" data-m="${id}"><span class="i-ic" style="background-image:url('${matIcon(+id)}')"></span><span class="i-name">${esc(MATS.get(+id) ?? "Material")}</span><span class="i-count">${n}</span></div>`;
      }
    }
    body.innerHTML = `<h3>Inventory</h3>${rows || "<p class='xnote'>Empty.</p>"}`;
    body.querySelectorAll(".inv-item[data-e]").forEach((d) => d.addEventListener("click", () => g.equip((d as HTMLElement).dataset.e!)));
    body.querySelectorAll(".inv-item[data-u]").forEach((d) => d.addEventListener("click", () => g.useAction({ t: "item", id: Number((d as HTMLElement).dataset.u!) })));
  }

  // ------------------------------------------------------------- per frame
  renderHud() {
    const g = this.w.game, s = g.stage, need = g.stageNeed;
    const ready = g.bossReady();
    const sig = `${s.n}|${s.kills}|${ready}|${!!g.boss}|${g.bossLoading}|${g.combatPower()}|${g.auto.boss}`;
    if (sig !== this.sig.hud) {
      this.sig.hud = sig;
      const bossName = (g.mobData.get(g.bossFor())?.name ?? "Stage Boss").trim();
      this.stageHud.innerHTML = `<div class="st-top"><span class="st-n">STAGE ${s.n}</span><span class="st-cp">CP ${fmt(g.combatPower())}</span></div>
        <div class="st-bar"><div class="st-fill" style="width:${Math.min(100, (s.kills / need) * 100)}%"></div><span>${g.boss ? "BOSS BATTLE" : `${Math.min(s.kills, need)} / ${need}`}</span></div>
        ${ready ? `<button type="button" class="boss-go" ${g.bossLoading ? "disabled" : ""}>${g.bossLoading ? "SUMMONING…" : `BOSS · ${esc(bossName)}`}</button>` : ""}`;
    }
    const m = g.boss;
    if (m) {
      const fill = this.bossBar.querySelector<HTMLElement>(".boss-fill");
      if (fill) fill.style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
      const num = this.bossBar.querySelector<HTMLElement>(".boss-num");
      if (num) num.textContent = `${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}`;
      const tm = this.bossBar.querySelector<HTMLElement>(".boss-time");
      if (tm) { const t = Math.max(0, Math.ceil(g.bossTimer)); tm.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; tm.classList.toggle("warn", t <= 20); }
    }
  }

  update() {
    const g = this.w.game;
    this.renderHud();
    const vis = (e: HTMLElement) => !e.classList.contains("hidden");
    const run = (k: string, e: HTMLElement, sig: () => string, f: () => void) => {
      if (!vis(e)) return;
      const s = sig();
      if (s !== this.sig[k]) { this.sig[k] = s; this.tips.clear(); f(); }
    };
    // Don't re-render while the user is typing a price.
    const typing = document.activeElement?.closest("#ah-win") && document.activeElement?.tagName === "INPUT";
    run("eq", this.equipWin, () => JSON.stringify([g.eq, g.stats.level, g.look, g.stats.maxHp, g.buffs["1101006"] ? 1 : 0]), () => this.renderEquip());
    if (this.equipWin.classList.contains("text-only")) this.renderEquipText();
    run("inv", this.invWin, () => JSON.stringify([this.invTab.cur, g.bag.length, g.bag.map((b) => b.uid + b.star + b.rarity).join(), g.inv, g.mats, g.stats.meso, g.stats.level]), () => this.renderInv());
    if (this.invWin.classList.contains("text-only")) this.renderInvText();
    run("craft", this.craftWin, () => JSON.stringify([this.craftTab.cur, this.pick, this.lastResult, g.mats, g.stats.meso, g.stats.level, g.bag.length, g.eq, g.bag.map((b) => b.uid + b.star + b.rarity).join()]), () => this.renderCraft());
    if (this.craftWin.classList.contains("text-only")) this.renderCraftText();
    if (!typing) run("ah", this.ahWin, () => JSON.stringify([this.ahTab.cur, this.ahFilter, g.ah.listings.length, g.ah.listings[0]?.lid, g.ah.mine.map((m) => m.lid + m.sold), g.stats.meso, this.ahTab.cur === "sell" ? [g.bag.length, g.mats, g.inv] : 0, this.ahTab.cur === "mine" ? Math.floor(Date.now() / 30000) : 0]), () => this.renderAh());
    if (this.ahWin.classList.contains("text-only")) this.renderAhText();
  }
}
