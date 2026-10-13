// HUD built from the real v270 MapleStory UI sprites (StatusBar3 / UIWindow2), hotlinked at runtime.
import type { Sprite } from "./assets.ts";
import type { ChatKind, Game, MapData } from "./game.ts";
import { expToLevel } from "./game.ts";
import { Windows } from "./windows.ts";

type UiData = Record<string, any>;

function el(tag: string, cls = "", parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Sets a background image with retries (maplestory.io occasionally returns 5xx under load). */
export function bg(e: HTMLElement, url: string, attempt = 0) {
  const img = new Image();
  const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
  img.onload = () => { e.style.backgroundImage = `url("${src}")`; };
  img.onerror = () => { if (attempt < 4) setTimeout(() => bg(e, url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}

const goodSrc = new Map<string, string>();
/** Preloads an image with retries and remembers which URL variant succeeded. */
function warm(url: string, attempt = 0) {
  if (goodSrc.has(url) && attempt === 0) return;
  const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
  const img = new Image();
  img.onload = () => goodSrc.set(url, src);
  img.onerror = () => { if (attempt < 4) setTimeout(() => warm(url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}

function spr(s: Sprite | null | undefined, x: number, y: number, parent: HTMLElement, cls = ""): HTMLElement {
  const e = el("div", "spr " + cls, parent);
  if (!s) return e;
  Object.assign(e.style, { left: `${x - s.ox}px`, top: `${y - s.oy}px`, width: `${s.w}px`, height: `${s.h}px` });
  bg(e, s.url);
  return e;
}

/** Renders a number using MapleStory's bitmap digit glyphs. */
function digits(container: HTMLElement, set: Record<string, Sprite | null>, text: string, gap = 1) {
  container.textContent = "";
  for (const ch of text) {
    const s = set[ch];
    if (!s) {
      const t = el("span", "glyph-fallback", container);
      t.textContent = ch;
      continue;
    }
    const g = el("i", "glyph", container);
    Object.assign(g.style, { width: `${s.w}px`, height: `${s.h}px`, backgroundImage: `url("${goodSrc.get(s.url) ?? s.url}")`, marginRight: `${gap}px`, marginTop: `${-s.oy}px` });
  }
}

export class Hud {
  root: HTMLElement;
  status: HTMLElement;
  hpFill!: HTMLElement; mpFill!: HTMLElement;
  hpText!: HTMLElement; mpText!: HTMLElement; lvText!: HTMLElement; nameText!: HTMLElement;
  exp!: HTMLElement; expFill!: HTMLElement; expText!: HTMLElement; expCover!: HTMLElement;
  quick!: HTMLElement;
  wins!: Windows;
  menu!: HTMLElement;
  chat!: HTMLElement; chatLog!: HTMLElement; chatInput!: HTMLInputElement;
  mini!: HTMLElement; miniImg!: HTMLElement; miniDot!: HTMLElement; miniName!: HTMLElement; miniStreet!: HTMLElement; miniMark!: HTMLElement; miniPortals: HTMLElement[] = [];
  nameTag: HTMLElement;
  meso!: HTMLElement;
  gain!: HTMLElement;
  lastLevel = 0; lastMeso = 0; lastExp = 0;
  last = "";
  miniScale = 1;
  miniInfo: MapData["miniMap"] | null = null;

  constructor(public ui: UiData, public game: Game, public win: any) {
    this.root = el("div", "hud", document.body);
    this.status = el("div", "status", this.root);
    this.nameTag = el("div", "nametag", this.root);
    for (const set of [ui.lvNumber, ui.gaugeNumber, ui.expNumber]) for (const sp of Object.values(set as Record<string, Sprite | null>)) if (sp) warm(sp.url);
    this.buildStatus();
    this.buildExp();
    this.wins = new Windows(game, win, this.root);
    this.quick = el("div", "quick", this.root);
    this.wins.buildQuick(this.quick, ui);
    this.buildMenu();
    this.buildChat();
    this.buildMinimap();
    this.buildGains();
    this.layout();
    addEventListener("resize", () => this.layout());
  }

  buildStatus() {
    const u = this.ui, s = this.status;
    // Anchor (0,0) is the status block's top-left; sprite origins position everything.
    spr(u.statusBack, 0, 0, s);
    const hp = el("div", "gauge", s), mp = el("div", "gauge", s);
    for (const [box, g] of [[hp, u.hpGauge], [mp, u.mpGauge]] as const) {
      Object.assign(box.style, { left: `${-g.ox}px`, top: `${-g.oy}px`, width: `${g.w}px`, height: `${g.h}px` });
      const fill = el("div", "spr fill", box);
      Object.assign(fill.style, { width: `${g.w}px`, height: `${g.h}px` });
      bg(fill, g.url);
    }
    this.hpFill = hp.firstChild as HTMLElement;
    this.mpFill = mp.firstChild as HTMLElement;
    spr(u.statusCover, 0, 0, s);
    spr(u.lvLabel, 0, 0, s);
    this.lvText = el("div", "num lv", s);
    this.nameText = el("div", "status-name", s);
    this.hpText = el("div", "num gauge-num", s);
    this.mpText = el("div", "num gauge-num", s);
    Object.assign(this.lvText.style, { left: `${-u.lvLabel.ox + u.lvLabel.w + 3}px`, top: `${-u.lvLabel.oy}px` });
    Object.assign(this.nameText.style, { left: `${-u.lvLabel.ox + u.lvLabel.w + 30}px`, top: `${-u.lvLabel.oy - 2}px` });
    Object.assign(this.hpText.style, { left: `${-u.hpGauge.ox}px`, top: `${-u.hpGauge.oy + 2}px`, width: `${u.hpGauge.w}px` });
    Object.assign(this.mpText.style, { left: `${-u.mpGauge.ox}px`, top: `${-u.mpGauge.oy + 2}px`, width: `${u.mpGauge.w}px` });
  }

  buildExp() {
    const u = this.ui;
    this.exp = el("div", "expbar", this.root);
    const back = u.expBack;
    const label = el("div", "spr", this.exp);
    Object.assign(label.style, { left: "0px", top: "0px", width: "16px", height: `${back.h}px` });
    bg(label, back.url);
    const rest = el("div", "spr exp-rest", this.exp);
    Object.assign(rest.style, { left: "16px", top: "0px", height: `${back.h}px`, backgroundPosition: "-16px 0" });
    bg(rest, back.url);
    const fillBox = el("div", "exp-fill", this.exp);
    Object.assign(fillBox.style, { left: `${-u.expGauge.ox}px`, top: `${-u.expGauge.oy + back.oy}px`, height: `${u.expGauge.h}px` });
    this.expFill = el("div", "spr", fillBox);
    Object.assign(this.expFill.style, { left: "0", top: "0", height: `${u.expGauge.h}px` });
    bg(this.expFill, u.expGauge.url);
    this.expCover = el("div", "spr", this.exp);
    Object.assign(this.expCover.style, { top: `${-u.expCover.oy + back.oy}px`, height: `${u.expCover.h}px` });
    bg(this.expCover, u.expCover.url);
    this.expText = el("div", "num exp-num", this.exp);
  }

  buildMenu() {
    this.menu = el("div", "menu", this.root);
    const names: Record<string, string> = { CashShop: "Auction House (H)", Event: "Inventory (I)", Character: "Equipment (E)", Community: "Crafting (J)", Setting: "Auto Settings", Menu: "Menu" };
    for (const [k, states] of Object.entries(this.ui.menu as Record<string, Record<string, Sprite>>)) {
      const n = states.normal;
      const b = el("button", "menu-btn", this.menu);
      b.title = names[k] ?? k;
      b.setAttribute("aria-label", names[k] ?? k);
      Object.assign(b.style, { left: `${-n.ox}px`, top: `${-n.oy}px`, width: `${n.w}px`, height: `${n.h}px` });
      bg(b, n.url);
      for (const st of Object.values(states)) new Image().src = st.url;
      b.addEventListener("mouseenter", () => (b.style.backgroundImage = `url("${states.mouseOver.url}")`));
      b.addEventListener("mouseleave", () => (b.style.backgroundImage = `url("${n.url}")`));
      b.addEventListener("mousedown", () => (b.style.backgroundImage = `url("${states.pressed.url}")`));
      b.addEventListener("mouseup", () => (b.style.backgroundImage = `url("${states.mouseOver.url}")`));
      b.addEventListener("click", () => {
        const w = this.wins;
        if (k === "Character") w.ext.open("equip");
        else if (k === "Menu") w.ext.toggleMenu(b);
        else if (k === "Setting") w.toggle(w.autoWin);
        else if (k === "CashShop") w.ext.open("ah");
        else if (k === "Community") w.ext.open("craft");
        else w.ext.open("inv");
      });
    }
  }

  nine(parent: HTMLElement, set: Record<string, Sprite>, w: number, h: number) {
    const box = el("div", "nine", parent);
    Object.assign(box.style, { width: `${w}px`, height: `${h}px` });
    const put = (k: string, x: number, y: number, ww?: number, hh?: number) => {
      const s = set[k];
      if (!s) return;
      const d = el("div", "spr", box);
      Object.assign(d.style, {
        left: `${x}px`, top: `${y}px`, width: `${ww ?? s.w}px`, height: `${hh ?? s.h}px`,
        backgroundSize: `${ww ?? s.w}px ${hh ?? s.h}px`,
      });
      bg(d, s.url);
    };
    return { box, put };
  }

  buildChat() {
    const u = this.ui;
    this.chat = el("div", "chat", this.root);
    const W = 420, H = 118;
    const { box, put } = this.nine(this.chat, u.chatView, W, H);
    const v = u.chatView;
    const cw = v.nw.w, ch = v.nw.h;
    put("c", cw, ch, W - cw * 2, H - ch * 2);
    put("n", cw, 0, W - cw * 2); put("s", cw, H - v.s.h, W - cw * 2);
    put("w", 0, ch, undefined, H - ch * 2); put("e", W - v.e.w, ch, undefined, H - ch * 2);
    put("nw", 0, 0); put("ne", W - v.ne.w, 0); put("sw", 0, H - v.sw.h); put("se", W - v.se.w, H - v.se.h);
    this.chatLog = el("div", "chat-log", box);
    const inp = el("div", "chat-input", this.chat);
    const ci = u.chatInput;
    const iw = W, ih = ci.c.h;
    Object.assign(inp.style, { width: `${iw}px`, height: `${ih}px` });
    for (const [k, x, w] of [["w", 0, ci.w.w], ["c", ci.w.w, iw - ci.w.w - ci.e.w], ["e", iw - ci.e.w, ci.e.w]] as const) {
      const d = el("div", "spr", inp);
      Object.assign(d.style, { left: `${x}px`, top: "0", width: `${w}px`, height: `${ih}px`, backgroundSize: `${w}px ${ih}px` });
      bg(d, ci[k].url);
    }
    this.chatInput = el("input", "chat-field", inp) as HTMLInputElement;
    this.chatInput.placeholder = "Press Enter to chat";
    this.chatInput.maxLength = 70;
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = this.chatInput.value.trim();
        if (t) this.game.say(t);
        this.chatInput.value = "";
        this.chatInput.blur();
      } else if (e.key === "Escape") this.chatInput.blur();
    });
  }

  buildMinimap() {
    this.mini = el("div", "minimap", this.root);
  }

  setMap(m: MapData) {
    const u = this.ui.minimap as Record<string, Sprite>;
    this.mini.textContent = "";
    this.miniPortals = [];
    const mm = m.miniMap;
    this.miniInfo = mm;
    const imgW = mm.width / mm.mag, imgH = mm.height / mm.mag;
    this.miniScale = Math.min(1, 230 / imgW);
    const cw = Math.round(imgW * this.miniScale), chh = Math.round(imgH * this.miniScale);
    const W = Math.max(170, cw + u.w.w + u.e.w), H = 61 + chh + 9 + 6;
    const { box, put } = this.nine(this.mini, u, W, H);
    put("c", u.w.w, 61, W - u.w.w - u.e.w, H - 61 - u.s.h);
    put("n", u.nw.w, 0, W - u.nw.w - u.ne.w); put("s", u.sw.w, H - u.s.h, W - u.sw.w - u.se.w);
    put("w", 0, u.nw.h, undefined, H - u.nw.h - u.sw.h); put("e", W - u.e.w, u.ne.h, undefined, H - u.ne.h - u.se.h);
    put("nw", 0, 0); put("ne", W - u.ne.w, 0); put("sw", 0, H - u.sw.h); put("se", W - u.se.w, H - u.se.h);
    this.miniMark = el("div", "mini-mark", box);
    bg(this.miniMark, m.mark);
    this.miniStreet = el("div", "mini-street", box);
    this.miniStreet.textContent = m.street;
    this.miniName = el("div", "mini-name", box);
    this.miniName.textContent = m.name;
    this.miniImg = el("div", "mini-img", box);
    Object.assign(this.miniImg.style, { left: `${(W - cw) / 2}px`, top: "63px", width: `${cw}px`, height: `${chh}px` });
    bg(this.miniImg, mm.url);
    for (const pt of this.game.portals) {
      const d = el("div", "mini-portal", this.miniImg);
      const [x, y] = this.miniPos(pt.x, pt.y);
      Object.assign(d.style, { left: `${x}px`, top: `${y}px` });
      this.miniPortals.push(d);
    }
    this.miniDot = el("div", "mini-dot", this.miniImg);
    this.addChat("notice", `Welcome to ${m.name}.`);
  }

  miniPos(x: number, y: number): [number, number] {
    const mm = this.miniInfo!;
    return [((x + mm.centerX) / mm.mag) * this.miniScale, ((y + mm.centerY) / mm.mag) * this.miniScale];
  }

  // ------------------------------------------------------------- floating gain counters (bottom right)
  buildGains() {
    this.gain = el("div", "gains", this.root);
    this.gain.style.display = "none";
  }
  /** Shows a floating counter for level / meso / exp gains at the bottom right, no background. */
  showGain(kind: "level" | "meso" | "exp", text: string) {
    const g = this.gain;
    g.style.display = "";
    const line = el("div", `gain gain-${kind}`, g);
    line.textContent = text;
    g.textContent = "";
    g.appendChild(line);
    const r = g.getBoundingClientRect();
    g.style.left = `${Math.min(innerWidth - r.width - 4, r.right + 12)}px`;
    g.style.top = `${Math.max(4, Math.min(innerHeight - r.height - 4, r.bottom + 12))}px`;
    g.style.transform = "translateY(0)";
    requestAnimationFrame(() => { g.style.transition = "transform .5s cubic-bezier(.2,.9,.3,1.2)"; g.style.transform = "translateY(-14px)"; });
    setTimeout(() => { g.style.transition = "opacity .5s, transform .5s"; g.style.transform = "translateY(0)"; g.style.opacity = "0"; }, 400);
    setTimeout(() => { g.style.display = "none"; }, 1000);
  }

  addChat(kind: ChatKind | "say", text: string) {
    const line = el("div", `chat-line ${kind}`, this.chatLog);
    if (kind === "say") {
      const m = text.match(/^([A-Za-z][A-Za-z ]{0,11})\s*:/);
      if (m) {
        const name = m[1], rest = text.slice(m[0].length);
        const wrap = el("span", "", line);
        const n = el("b", "chat-name", wrap); n.textContent = name;
        const t = el("span", "", wrap); t.textContent = rest;
        line.dataset.text = rest;
      }
    }
    const dismiss = kind !== "say" && kind !== "notice";
    if (dismiss) {
      line.dataset.dismiss = String(performance.now() + 4500);
      const check = () => {
        const d = Number(line.dataset.dismiss);
        if (performance.now() >= d) line.remove();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }
    while (this.chatLog.children.length > 60) this.chatLog.firstChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  layout() {
    const W = innerWidth, H = innerHeight;
    const u = this.ui;
    const expH = u.expBack.h;
    const statusW = u.statusCover.w, statusH = u.statusCover.h;
    const menuW = 34 * 6 + 6;
    const total = statusW + 8 + menuW;
    const sx = Math.round(W / 2 - total / 2), sy = H - expH - statusH;
    Object.assign(this.status.style, { left: `${sx + 1}px`, top: `${sy}px` });
    Object.assign(this.menu.style, { left: `${sx + statusW + 10}px`, top: `${sy + statusH - 39}px` });
    Object.assign(this.exp.style, { left: "0px", top: `${H - expH}px`, width: `${W}px`, height: `${expH}px` });
    (this.exp.querySelector(".exp-rest") as HTMLElement).style.width = `${W - 16}px`;
    (this.exp.querySelector(".exp-rest") as HTMLElement).style.backgroundSize = `${W - 16 + 16}px ${expH}px`;
    const gw = W - 30;
    (this.exp.querySelector(".exp-fill") as HTMLElement).dataset.w = String(gw);
    this.expFill.style.width = `${gw}px`;
    this.expFill.style.backgroundSize = `${gw}px ${u.expGauge.h}px`;
    const k = W / 1920;
    Object.assign(this.expCover.style, { left: `${-u.expCover.ox * k}px`, width: `${u.expCover.w * k}px`, backgroundSize: `${u.expCover.w * k}px ${u.expCover.h}px` });
    const qH = u.quickCover.h;
    const chatW = 424;
    // Fold the quick slots to 8 columns when the screen is too narrow for all 16.
    const fullQ = -u.quickCover.ox + u.quickCover.w + 2;
    const halfQ = 12 + 8 * 35;
    const compact = W < chatW + total + fullQ + 8;
    const qW = compact ? halfQ : fullQ;
    this.quick.style.width = `${qW}px`;
    this.quick.style.overflow = compact ? "hidden" : "visible";
    Object.assign(this.quick.style, { left: `${W - qW}px`, top: `${H - expH - qH}px` });
    const showChat = W >= chatW + total + qW + 16;
    this.chat.style.display = showChat ? "" : "none";
    Object.assign(this.chat.style, { left: "4px", top: `${H - expH - 118 - 27 - 4}px` });
    // Keep the status block centered unless it would collide with the chat or quick slots.
    let x = sx;
    if (showChat) x = Math.max(x, chatW + 8);
    x = Math.min(x, W - qW - total - 8);
    Object.assign(this.status.style, { left: `${x + 1}px` });
    Object.assign(this.menu.style, { left: `${x + statusW + 10}px` });
    this.quick.style.display = W - qW < total + 8 ? "none" : "";
    Object.assign(this.mini.style, { left: "4px", top: "4px" });
    const qLeft = W - qW;
    Object.assign(this.wins.autoBtn.style, { left: `${qLeft + 12}px`, top: `${H - expH - qH - 24}px` });
    // Position the transient log at the bottom right, above the quick slots + AUTO button.
    this.wins.layoutLogs(W, H, qW, expH, qH);
    this.last = "";
  }

  update(dt: number) {
    const g = this.game, s = g.stats, u = this.ui;
    const need = Math.round(expToLevel(s.level));
    const key = `${s.level}|${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.exp}|${s.name}`;
    if (key !== this.last || (performance.now() % 2000 < 20)) {
      this.last = key;
      this.hpFill.style.width = `${Math.round((s.hp / s.maxHp) * u.hpGauge.w)}px`;
      this.mpFill.style.width = `${Math.round((s.mp / s.maxMp) * u.mpGauge.w)}px`;
      digits(this.hpText, { ...u.gaugeNumber }, `${s.hp}/${s.maxHp}`);
      digits(this.mpText, { ...u.gaugeNumber }, `${s.mp}/${s.maxMp}`);
      digits(this.lvText, u.lvNumber, String(s.level));
      this.nameText.textContent = s.name;
      const pct = Math.min(100, (s.exp / need) * 100);
      const gw = Number((this.exp.querySelector(".exp-fill") as HTMLElement).dataset.w);
      (this.exp.querySelector(".exp-fill") as HTMLElement).style.width = `${Math.round((gw * pct) / 100)}px`;
      digits(this.expText, u.expNumber, `${s.exp}[${pct.toFixed(2)}%]`);
    }
    // Name tag & minimap marker follow the player every frame.
    const p = g.p;
    const nx = Math.round(p.x - g.cam.x), ny = Math.round(p.y - g.cam.y + 4);
    this.nameTag.textContent = s.name;
    this.nameTag.style.transform = `translate(${nx}px, ${ny}px) translateX(-50%)`;
    this.wins.renderBalloon(nx, Math.round(p.y - g.cam.y - 78));
    this.wins.update(dt);
    if (this.miniInfo && this.miniDot) {
      const [x, y] = this.miniPos(p.x, p.y);
      this.miniDot.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}
