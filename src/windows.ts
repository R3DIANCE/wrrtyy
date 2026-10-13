// Quick slots (drag/drop), Stat / Skill / Item / Auto windows, buff bar, tooltips and chat balloon.
import type { Sprite } from "./assets.ts";
import type { Game } from "./game.ts";
import {
  ITEMS, JOB_TABS, KEY_LABEL, QUICK_KEYS, SKILL, SKILL_DEFS, TAB_LEVEL, WEAPON_ICON,
  cleanDesc, itemIcon, type Action,
} from "./skills.ts";

type Btn = Record<"normal" | "mouseOver" | "pressed" | "disabled", Sprite | null>;

export function el(tag: string, cls = "", parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

const okSrc = new Map<string, string>();
/** Sets a background image, retrying with a cache-buster (maplestory.io sometimes returns 5xx). */
export function bg(e: HTMLElement, url: string, attempt = 0) {
  const known = okSrc.get(url);
  if (known) { e.style.backgroundImage = `url("${known}")`; return; }
  const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
  const img = new Image();
  img.onload = () => { okSrc.set(url, src); e.style.backgroundImage = `url("${src}")`; };
  img.onerror = () => { if (attempt < 4) setTimeout(() => bg(e, url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}

function place(e: HTMLElement, s: Sprite | null | undefined, x = 0, y = 0) {
  if (!s) return e;
  Object.assign(e.style, { left: `${x - s.ox}px`, top: `${y - s.oy}px`, width: `${s.w}px`, height: `${s.h}px` });
  bg(e, s.url);
  return e;
}

/** Real sprite button with normal/mouseOver/pressed/disabled states. */
function button(parent: HTMLElement, b: Btn, onClick: () => void, title = "") {
  const e = el("button", "spr-btn", parent) as HTMLButtonElement;
  e.type = "button";
  if (title) { e.title = title; e.setAttribute("aria-label", title); }
  place(e, b.normal);
  for (const s of Object.values(b)) if (s) bg(document.createElement("i"), s.url); // warm cache
  let disabled = false;
  const set = (k: keyof Btn) => { const s = b[k] ?? b.normal; if (s) bg(e, s.url); };
  e.addEventListener("mouseenter", () => !disabled && set("mouseOver"));
  e.addEventListener("mouseleave", () => set(disabled ? "disabled" : "normal"));
  e.addEventListener("mousedown", () => !disabled && set("pressed"));
  e.addEventListener("mouseup", () => !disabled && set("mouseOver"));
  e.addEventListener("click", (ev) => { ev.stopPropagation(); if (!disabled) onClick(); });
  return {
    el: e,
    setDisabled(d: boolean) { if (d === disabled) return; disabled = d; e.disabled = d; set(d ? "disabled" : "normal"); },
  };
}

// ---------------------------------------------------------------------------
export class Windows {
  layer: HTMLElement;
  tip: HTMLElement;
  ghost: HTMLElement | null = null;
  quickRoot!: HTMLElement;
  slots: Record<string, HTMLElement> = {};
  stat!: HTMLElement; skill!: HTMLElement; item!: HTMLElement; autoWin!: HTMLElement;
  buffBar: HTMLElement;
  balloon: HTMLElement; balloonText: HTMLElement;
  autoBtn: HTMLElement;
  skillTab = 1;
  z = 20;
  lastQuick = ""; lastStat = ""; lastSkill = ""; lastItem = ""; lastBuffs = "";
  statFields: Record<string, HTMLElement> = {};
  statBtns: { setDisabled(d: boolean): void }[] = [];

  constructor(public game: Game, public win: any, public hudRoot: HTMLElement) {
    this.layer = el("div", "win-layer", document.body);
    this.tip = el("div", "tooltip hidden", document.body);
    this.buffBar = el("div", "buffbar", hudRoot);
    this.balloon = el("div", "balloon hidden", hudRoot);
    this.buildBalloon();
    this.balloonText = this.balloon.querySelector(".balloon-text") as HTMLElement;
    this.autoBtn = el("button", "auto-btn", hudRoot);
    this.autoBtn.innerHTML = `<span class="auto-dot"></span>AUTO`;
    this.autoBtn.title = "Toggle auto battle (B). Right-click for settings.";
    this.autoBtn.addEventListener("click", () => this.toggleAutoBattle());
    this.autoBtn.addEventListener("contextmenu", (e) => { e.preventDefault(); this.toggle(this.autoWin); });
    this.buildStat();
    this.buildSkill();
    this.buildItem();
    this.buildAuto();
    addEventListener("pointermove", (e) => { const pe = e as PointerEvent; if (this.ghost) this.moveGhost(pe.clientX, pe.clientY); });
  }

  toggleAutoBattle() {
    const a = this.game.auto;
    a.battle = !a.battle;
    this.game.onChat("notice", a.battle ? "Auto Battle is ON. Your character will hunt, loot and heal on its own. Press B or any arrow key to take over." : "Auto Battle is OFF.");
    this.game.onChange();
  }

  // ------------------------------------------------------------- generic window
  makeWindow(id: string, w: number, h: number, title: string | null, x: number, y: number) {
    const e = el("section", "win hidden", this.layer);
    e.id = id;
    e.setAttribute("aria-label", title ?? id);
    Object.assign(e.style, { width: `${w}px`, height: `${h}px`, left: `${x}px`, top: `${y}px` });
    if (title) {
      e.classList.add("win-css");
      const t = el("div", "win-title", e);
      t.textContent = title;
    }
    const drag = el("div", "win-drag", e);
    drag.addEventListener("pointerdown", (ev) => {
      const ox = ev.clientX - e.offsetLeft, oy = ev.clientY - e.offsetTop;
      const mv = (m: PointerEvent) => {
        e.style.left = `${Math.max(-w + 40, Math.min(innerWidth - 40, m.clientX - ox))}px`;
        e.style.top = `${Math.max(0, Math.min(innerHeight - 30, m.clientY - oy))}px`;
      };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
    e.addEventListener("pointerdown", () => { e.style.zIndex = String(++this.z); });
    const close = el("div", "", e);
    button(close, this.win.close, () => e.classList.add("hidden"), "Close");
    Object.assign(close.style, { position: "absolute", left: `${w - 21}px`, top: "6px", width: "13px", height: "13px" });
    return e;
  }

  toggle(w: HTMLElement) {
    w.classList.toggle("hidden");
    if (!w.classList.contains("hidden")) { w.style.zIndex = String(++this.z); this.lastStat = this.lastSkill = this.lastItem = ""; }
  }
  closeTop() {
    const open = [...this.layer.querySelectorAll<HTMLElement>(".win:not(.hidden)")].sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    if (open[0]) { open[0].classList.add("hidden"); return true; }
    return false;
  }

  // ------------------------------------------------------------- tooltips
  showTip(html: string, x: number, y: number) {
    this.tip.innerHTML = html;
    this.tip.classList.remove("hidden");
    const r = this.tip.getBoundingClientRect();
    this.tip.style.left = `${Math.min(innerWidth - r.width - 4, x + 14)}px`;
    this.tip.style.top = `${Math.max(4, Math.min(innerHeight - r.height - 4, y + 14))}px`;
  }
  hideTip() { this.tip.classList.add("hidden"); }
  actionTip(a: Action): string {
    const g = this.game;
    if (a.t === "attack") {
      const [lo, hi] = g.damageRange();
      return `<b>Basic Attack</b><p>Swing your sword at the closest monster.</p><p class="tip-dim">Damage ${lo} ~ ${hi}</p>`;
    }
    if (a.t === "item") {
      const it = ITEMS[a.id];
      return `<b>${it.name}</b><p>${it.hp ? `Recovers ${it.hp} HP.` : ""}${it.mp ? ` Recovers ${it.mp} MP.` : ""}</p><p class="tip-dim">Owned: ${g.inv[a.id] ?? 0}</p>`;
    }
    return this.skillTip(a.id);
  }
  skillTip(id: string) {
    const g = this.game, d = SKILL[id], art = g.skillArt[id];
    const lv = g.lv(id);
    const cur = lv > 0 ? `<p><span class="tip-hl">[Current Level ${lv}]</span> ${d.summary(lv)}${d.kind !== "passive" ? ` MP ${d.mp(lv)}.` : ""}</p>` : "";
    const next = lv < d.maxLevel ? `<p><span class="tip-hl">[Next Level ${lv + 1}]</span> ${d.summary(lv + 1)}${d.kind !== "passive" ? ` MP ${d.mp(lv + 1)}.` : ""}</p>` : "";
    const req = g.stats.level < d.reqLevel ? `<p class="tip-warn">Requires Lv. ${d.reqLevel}</p>` : "";
    const kind = { attack: "Attack", ranged: "Ranged attack", buff: "Buff", passive: "Passive", move: "Movement" }[d.kind];
    return `<b>${art?.name ?? id}</b><p class="tip-dim">${kind} · Master Level ${d.maxLevel}</p><p>${cleanDesc(art?.desc ?? "")}</p>${req}${cur}${next}`;
  }
  bindTip(e: HTMLElement, html: () => string | null) {
    e.addEventListener("pointermove", (ev) => { if (this.ghost) return; const h = html(); if (h) this.showTip(h, ev.clientX, ev.clientY); });
    e.addEventListener("pointerleave", () => this.hideTip());
  }

  // ------------------------------------------------------------- drag & drop
  iconFor(a: Action, disabled = false): string {
    if (a.t === "attack") return WEAPON_ICON;
    if (a.t === "item") return itemIcon(a.id);
    const art = this.game.skillArt[a.id];
    return (disabled ? art?.iconDisabled?.url : null) ?? art?.icon?.url ?? "";
  }
  moveGhost(x: number, y: number) { if (this.ghost) this.ghost.style.transform = `translate(${x - 16}px, ${y - 16}px)`; }

  /** Starts a drag from a skill/item/quick slot after the pointer moves a few pixels. */
  draggable(e: HTMLElement, get: () => Action | null, fromKey?: string, onClick?: () => void) {
    e.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const a = get();
      if (!a) return;
      ev.preventDefault();
      const sx = ev.clientX, sy = ev.clientY;
      let dragging = false;
      const mv = (m: PointerEvent) => {
        if (!dragging && Math.hypot(m.clientX - sx, m.clientY - sy) > 4) {
          dragging = true;
          this.hideTip();
          this.ghost = el("div", "drag-ghost", document.body);
          bg(this.ghost, this.iconFor(a));
          if (fromKey) this.slots[fromKey]?.classList.add("dragging");
        }
        if (dragging) this.moveGhost(m.clientX, m.clientY);
      };
      const up = (u: PointerEvent) => {
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
        if (!dragging) { onClick?.(); return; }
        this.ghost?.remove(); this.ghost = null;
        if (fromKey) this.slots[fromKey]?.classList.remove("dragging");
        const target = (document.elementFromPoint(u.clientX, u.clientY) as HTMLElement | null)?.closest<HTMLElement>(".slot[data-key]");
        const q = this.game.quick;
        if (target) {
          const to = target.dataset.key!;
          if (fromKey) { const tmp = q[to] ?? null; q[to] = q[fromKey] ?? null; q[fromKey] = tmp; }
          else {
            // Placing an action that already exists elsewhere moves it (like the real client).
            for (const k of QUICK_KEYS) if (q[k] && JSON.stringify(q[k]) === JSON.stringify(a)) q[k] = null;
            q[to] = a;
          }
        } else if (fromKey) {
          q[fromKey] = null;
          this.game.onChat("system", "Removed from the quick slot.");
        }
        this.lastQuick = "";
        this.game.onChange();
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }

  // ------------------------------------------------------------- quick slots
  buildQuick(root: HTMLElement, ui: any) {
    this.quickRoot = root;
    root.textContent = "";
    place(el("div", "spr", root), ui.quickBack);
    const grid = el("div", "quick-grid", root);
    // Slots are 32×32 on a 35px pitch inside the 557×67 background (measured from the sprite).
    Object.assign(grid.style, { left: `${-ui.quickBack.ox}px`, top: `${-ui.quickBack.oy}px` });
    for (const key of QUICK_KEYS) {
      const slot = el("div", "slot", grid);
      slot.dataset.key = key;
      el("div", "slot-icon", slot);
      el("span", "slot-count", slot);
      const k = el("span", "slot-key", slot);
      k.textContent = KEY_LABEL[key] ?? key;
      this.slots[key] = slot;
      this.draggable(slot, () => this.game.quick[key] ?? null, key, () => this.game.useAction(this.game.quick[key]));
      slot.addEventListener("contextmenu", (e) => { e.preventDefault(); if (this.game.quick[key]) { this.game.quick[key] = null; this.lastQuick = ""; this.game.onChange(); } });
      this.bindTip(slot, () => { const a = this.game.quick[key]; return a ? this.actionTip(a) + `<p class="tip-dim">Drag to move · drag off or right-click to remove</p>` : null; });
    }
    const cover = place(el("div", "spr nopoint", root), ui.quickCover);
    cover.style.zIndex = "2";
    this.lastQuick = "";
  }

  renderQuick() {
    const g = this.game;
    const sig = QUICK_KEYS.map((k) => {
      const a = g.quick[k];
      if (!a) return "-";
      if (a.t === "item") return `i${a.id}:${g.inv[a.id] ?? 0}`;
      if (a.t === "skill") { const d = SKILL[a.id], lv = g.lv(a.id); return `s${a.id}:${lv > 0 && (d.kind === "passive" || g.stats.mp >= d.mp(lv)) ? 1 : 0}`; }
      return "a";
    }).join("|");
    if (sig === this.lastQuick) return;
    this.lastQuick = sig;
    for (const k of QUICK_KEYS) {
      const slot = this.slots[k], a = g.quick[k];
      const icon = slot.querySelector(".slot-icon") as HTMLElement, count = slot.querySelector(".slot-count") as HTMLElement;
      slot.classList.toggle("filled", !!a);
      if (!a) { icon.style.backgroundImage = ""; count.textContent = ""; slot.classList.remove("off"); continue; }
      let off = false;
      if (a.t === "skill") { const d = SKILL[a.id], lv = g.lv(a.id); off = lv <= 0 || (d && d.kind !== "passive" && g.stats.mp < d.mp(lv)); }
      if (a.t === "item") off = (g.inv[a.id] ?? 0) <= 0;
      slot.classList.toggle("off", off);
      bg(icon, this.iconFor(a, off));
      count.textContent = a.t === "item" ? String(g.inv[a.id] ?? 0) : "";
    }
  }

  // ------------------------------------------------------------- stat window
  buildStat() {
    const W = this.win.stat;
    const w = this.makeWindow("stat-win", W.backgrnd.w, W.backgrnd.h, null, 80, 90);
    this.stat = w;
    for (const k of ["backgrnd", "backgrnd2", "backgrnd3"]) place(el("div", "spr", w), W[k]);
    const row = (key: string, y: number) => { const e = el("div", "stat-val", w); e.style.top = `${y}px`; this.statFields[key] = e; };
    row("name", 32); row("job", 50); row("guild", 68); row("fame", 86); row("damage", 104); row("damage2", 120);
    row("hp", 140); row("mp", 158); row("str", 228); row("dex", 246); row("int", 264); row("luk", 282);
    const ap = el("div", "stat-ap", w); this.statFields.ap = ap;
    const autoB = button(w, W.BtAuto, () => this.game.autoAssign(), "Auto-assign ability points");
    this.statBtns.push(autoB);
    for (const [k, b] of [["str", W.BtStrUp], ["dex", W.BtDexUp], ["int", W.BtIntUp], ["luk", W.BtLukUp]] as const) {
      const bt = button(w, b, () => this.game.addStat(k), `Raise ${k.toUpperCase()}`);
      this.statBtns.push(bt);
    }
    const note = el("div", "stat-note", w);
    note.textContent = "Raise STR for damage, DEX for accuracy.";
  }
  renderStat() {
    if (this.stat.classList.contains("hidden")) return;
    const g = this.game, s = g.stats;
    const [lo, hi] = g.damageRange();
    const sig = JSON.stringify([s, lo, hi, g.lv("1100009")]);
    if (sig === this.lastStat) return;
    this.lastStat = sig;
    const bonus = g.lv("1100009") * 4;
    const f = this.statFields;
    f.name.textContent = s.name; f.job.textContent = s.job; f.guild.textContent = "-"; f.fame.textContent = String(s.fame);
    f.damage.textContent = `${lo.toLocaleString()} ~ ${hi.toLocaleString()}`;
    f.damage2.textContent = `ATT ${g.watk()} · Mastery ${Math.round(g.mastery() * 100)}%`;
    f.hp.textContent = `${s.hp} / ${s.maxHp}`; f.mp.textContent = `${s.mp} / ${s.maxMp}`;
    f.str.textContent = bonus ? `${s.str + bonus} (${s.str}+${bonus})` : String(s.str);
    f.dex.textContent = bonus ? `${s.dex + bonus} (${s.dex}+${bonus})` : String(s.dex);
    f.int.textContent = String(s.int); f.luk.textContent = String(s.luk);
    f.ap.textContent = String(s.ap);
    for (const b of this.statBtns) b.setDisabled(s.ap <= 0);
  }

  // ------------------------------------------------------------- skill window
  buildSkill() {
    const W = this.win.skill;
    const w = this.makeWindow("skill-win", W.backgrnd.w, W.backgrnd.h, null, 320, 70);
    this.skill = w;
    for (const k of ["backgrnd", "backgrnd2", "backgrnd3"]) place(el("div", "spr", w), W[k]);
    const tabs = el("div", "skill-tabs", w);
    JOB_TABS.forEach((name, i) => {
      const t = el("button", "skill-tab", tabs) as HTMLButtonElement;
      t.type = "button";
      t.textContent = i === 0 ? "Beginner" : `${i}${["", "st", "nd", "rd"][i]} · ${name}`;
      t.addEventListener("click", () => { this.skillTab = i; this.lastSkill = ""; });
    });
    el("div", "skill-banner-icon", w);
    el("div", "skill-banner", w);
    el("div", "skill-list", w);
    el("div", "skill-sp", w);
  }
  renderSkill() {
    if (this.skill.classList.contains("hidden")) return;
    const g = this.game, W = this.win.skill;
    const sig = JSON.stringify([this.skillTab, g.skillLv, g.stats.sp, g.stats.level]);
    if (sig === this.lastSkill) return;
    this.lastSkill = sig;
    const w = this.skill;
    w.querySelectorAll<HTMLElement>(".skill-tab").forEach((t, i) => {
      t.classList.toggle("on", i === this.skillTab);
      t.classList.toggle("locked", g.stats.level < TAB_LEVEL[i]);
    });
    const tab = this.skillTab;
    const banner = w.querySelector(".skill-banner") as HTMLElement;
    banner.innerHTML = `<b>${JOB_TABS[tab]}</b><span>${g.stats.level >= TAB_LEVEL[tab] ? "Skills available" : `Unlocks at Lv. ${TAB_LEVEL[tab]}`}</span>`;
    const bi = w.querySelector(".skill-banner-icon") as HTMLElement;
    const first = SKILL_DEFS.find((d) => d.tab === tab);
    if (first) bg(bi, g.skillArt[first.id]?.icon?.url ?? "");
    const list = w.querySelector(".skill-list") as HTMLElement;
    list.textContent = "";
    SKILL_DEFS.filter((d) => d.tab === tab).forEach((d, i) => {
      const lv = g.lv(d.id), art = g.skillArt[d.id];
      const usable = g.stats.level >= d.reqLevel;
      const row = el("div", "skill-row", list);
      Object.assign(row.style, { left: `${(i % 2) * 152}px`, top: `${Math.floor(i / 2) * 40}px` });
      bg(row, (usable ? W.skill0 : W.skill1).url);
      const ic = el("div", "skill-icon", row);
      bg(ic, (lv > 0 ? art?.icon?.url : art?.iconDisabled?.url) ?? art?.icon?.url ?? "");
      if (lv > 0 && d.kind !== "passive") {
        ic.classList.add("grab");
        this.draggable(ic, () => ({ t: "skill", id: d.id }));
      }
      this.bindTip(ic, () => this.skillTip(d.id));
      const nm = el("div", "skill-name", row); nm.textContent = art?.name ?? d.id;
      const lvT = el("div", "skill-lv", row); lvT.textContent = `${lv} / ${d.maxLevel}${d.kind === "passive" ? " · Passive" : ""}`;
      const up = el("div", "skill-up", row);
      const b = button(up, W.BtSpUp, () => { if (g.learn(d.id)) this.lastSkill = ""; }, `Learn ${art?.name ?? ""}`);
      b.setDisabled(!g.canLearn(d.id));
    });
    const sp = w.querySelector(".skill-sp") as HTMLElement;
    sp.innerHTML = `SKILL POINT <b>${g.stats.sp}</b>`;
  }

  // ------------------------------------------------------------- item window (Use tab)
  buildItem() {
    const w = this.makeWindow("item-win", 190, 222, "ITEM INVENTORY", innerWidth - 420, 120);
    this.item = w;
    const tab = el("div", "item-tabs", w);
    tab.innerHTML = `<span>EQUIP</span><span class="on">USE</span><span>ETC</span>`;
    el("div", "item-grid", w);
    el("div", "item-meso", w);
  }
  renderItem() {
    if (this.item.classList.contains("hidden")) return;
    const g = this.game;
    const sig = JSON.stringify([g.inv, g.stats.meso]);
    if (sig === this.lastItem) return;
    this.lastItem = sig;
    const grid = this.item.querySelector(".item-grid") as HTMLElement;
    grid.textContent = "";
    const ids = Object.keys(ITEMS).map(Number);
    for (let i = 0; i < 16; i++) {
      const cell = el("div", "item-cell", grid);
      const id = ids[i];
      if (id == null || !(g.inv[id] > 0)) continue;
      const ic = el("div", "item-icon grab", cell);
      bg(ic, itemIcon(id));
      const c = el("span", "slot-count", cell); c.textContent = String(g.inv[id]);
      this.draggable(ic, () => ({ t: "item", id }), undefined, () => g.useAction({ t: "item", id }));
      this.bindTip(ic, () => this.actionTip({ t: "item", id }) + `<p class="tip-dim">Click to use · drag to a quick slot</p>`);
    }
    (this.item.querySelector(".item-meso") as HTMLElement).textContent = `${g.stats.meso.toLocaleString()} mesos`;
  }

  // ------------------------------------------------------------- auto settings
  buildAuto() {
    const w = this.makeWindow("auto-win", 230, 326, "AUTO SETTINGS", innerWidth / 2 - 115, 110);
    this.autoWin = w;
    const g = this.game, a = g.auto;
    const body = el("div", "auto-body", w);
    const toggle = (label: string, key: "battle" | "hp" | "mp" | "buff" | "loot" | "ap", hint: string) => {
      const row = el("label", "auto-row", body);
      const cb = el("input", "", row) as HTMLInputElement;
      cb.type = "checkbox"; cb.checked = a[key];
      cb.addEventListener("change", () => { a[key] = cb.checked; g.onChange(); });
      const t = el("span", "", row); t.innerHTML = `<b>${label}</b><small>${hint}</small>`;
      return cb;
    };
    const slider = (key: "hpPct" | "mpPct", label: string) => {
      const row = el("label", "auto-slider", body);
      const t = el("span", "", row);
      const r = el("input", "", row) as HTMLInputElement;
      r.type = "range"; r.min = "10"; r.max = "90"; r.step = "5"; r.value = String(a[key]);
      const upd = () => { t.textContent = `${label} below ${a[key]}%`; };
      r.addEventListener("input", () => { a[key] = Number(r.value); upd(); g.onChange(); });
      upd();
    };
    const battle = toggle("Auto Battle", "battle", "Hunt nearby monsters with your best skills (B)");
    toggle("Auto HP", "hp", "Drink HP potions automatically");
    slider("hpPct", "Use when HP is");
    toggle("Auto MP", "mp", "Drink MP potions automatically");
    slider("mpPct", "Use when MP is");
    toggle("Auto Buff", "buff", "Recast buffs before they expire");
    toggle("Auto Loot", "loot", "Pick up mesos and items");
    toggle("Auto Stats", "ap", "Spend Ability Points on level up (STR/DEX)");
    const reset = el("button", "auto-reset", body) as HTMLButtonElement;
    reset.type = "button";
    reset.textContent = "Reset character";
    reset.addEventListener("click", () => {
      if (confirm("Delete this character's saved progress and start over?")) { localStorage.removeItem("maple-wayfarer-save"); location.reload(); }
    });
    (w as any)._sync = () => { battle.checked = a.battle; };
  }

  // ------------------------------------------------------------- buff bar
  renderBuffs() {
    const g = this.game;
    const ids = Object.keys(g.buffs);
    const sig = ids.map((id) => `${id}:${Math.ceil(g.buffs[id].left)}`).join("|");
    if (sig === this.lastBuffs) return;
    this.lastBuffs = sig;
    const existing = new Map([...this.buffBar.children].map((c) => [(c as HTMLElement).dataset.id!, c as HTMLElement]));
    for (const [id, c] of existing) if (!g.buffs[id]) c.remove();
    for (const id of ids) {
      let c = existing.get(id);
      if (!c) {
        c = el("div", "buff", this.buffBar);
        c.dataset.id = id;
        bg(c, g.skillArt[id]?.icon?.url ?? "");
        el("span", "buff-time", c);
        el("div", "buff-shade", c);
        c.addEventListener("contextmenu", (e) => { e.preventDefault(); delete g.buffs[id]; g.recalc(); g.onChange(); });
        this.bindTip(c, () => `${this.skillTip(id)}<p class="tip-dim">Right-click to cancel</p>`);
      }
      const b = g.buffs[id];
      (c.querySelector(".buff-time") as HTMLElement).textContent = b.left >= 60 ? `${Math.ceil(b.left / 60)}m` : `${Math.ceil(b.left)}`;
      (c.querySelector(".buff-shade") as HTMLElement).style.height = `${(1 - b.left / b.dur) * 100}%`;
    }
  }

  // ------------------------------------------------------------- chat balloon
  buildBalloon() {
    const B = this.win.balloon;
    const b = this.balloon;
    const piece = (k: string, css: Partial<CSSStyleDeclaration>) => {
      const e = el("div", "bp", b);
      Object.assign(e.style, css);
      if (B[k]) bg(e, B[k].url);
    };
    piece("c", { left: "0", top: "0", right: "0", bottom: "0" });
    piece("n", { left: "0", right: "0", top: "-6px", height: "6px" });
    piece("s", { left: "0", right: "0", bottom: "-6px", height: "6px" });
    piece("w", { left: "-6px", width: "6px", top: "0", bottom: "0" });
    piece("e", { right: "-6px", width: "6px", top: "0", bottom: "0" });
    piece("nw", { left: "-6px", top: "-6px", width: "6px", height: "6px" });
    piece("ne", { right: "-6px", top: "-6px", width: "6px", height: "6px" });
    piece("sw", { left: "-6px", bottom: "-6px", width: "6px", height: "6px" });
    piece("se", { right: "-6px", bottom: "-6px", width: "6px", height: "6px" });
    piece("arrow", { left: "calc(50% - 6px)", bottom: "-13px", width: "13px", height: "13px" });
    el("div", "balloon-text", b);
  }
  renderBalloon(px: number, py: number) {
    const g = this.game;
    if (g.balloon.t <= 0) { this.balloon.classList.add("hidden"); return; }
    if (this.balloonText.textContent !== g.balloon.text) this.balloonText.textContent = g.balloon.text;
    this.balloon.classList.remove("hidden");
    this.balloon.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
  }

  update() {
    this.renderQuick();
    this.renderStat();
    this.renderSkill();
    this.renderItem();
    this.renderBuffs();
    const on = this.game.auto.battle;
    this.autoBtn.classList.toggle("on", on);
    (this.autoWin as any)._sync?.();
  }
}
