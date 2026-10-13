// HUD in the KMS 2026 style: pure CSS chrome, dark navy surfaces, lime titles,
// cyan active tabs, rose HP / cyan MP / lime EXP gauges, quick menu, minimap.
import type { ChatKind, Game, MapData } from "./game.ts";
import { expToLevel } from "./game.ts";
import { Windows } from "./windows.ts";
import { cacheAsset } from "./item-browser.ts";

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
  img.onload = () => { e.style.backgroundImage = `url("${src}")`; cacheAsset(url); };
  img.onerror = () => { if (attempt < 4) setTimeout(() => bg(e, url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}

export class Hud {
  root: HTMLElement;
  status!: HTMLElement;
  hpFill!: HTMLElement; mpFill!: HTMLElement;
  hpText!: HTMLElement; mpText!: HTMLElement; lvText!: HTMLElement; nameText!: HTMLElement;
  exp!: HTMLElement; expFill!: HTMLElement; expText!: HTMLElement;
  quick!: HTMLElement;
  wins!: Windows;
  menu!: HTMLElement;
  chat!: HTMLElement; chatLog!: HTMLElement; chatInput!: HTMLInputElement;
  mini!: HTMLElement; miniImg!: HTMLElement; miniDot!: HTMLElement; miniName!: HTMLElement; miniStreet!: HTMLElement; miniBody!: HTMLElement; miniPortals: HTMLElement[] = [];
  nameTag: HTMLElement;
  gain!: HTMLElement;
  lastLevel = 0; lastMeso = 0; lastExp = 0;
  last = "";
  miniScale = 1;
  miniInfo: MapData["miniMap"] | null = null;

  constructor(public ui: UiData, public game: Game, public win: any) {
    this.root = el("div", "hud", document.body);
    this.nameTag = el("div", "nametag", this.root);
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
    this.status = el("div", "status", this.root);
    const ident = el("div", "status-ident", this.status);
    this.lvText = el("span", "status-level", ident);
    this.nameText = el("span", "status-name", ident);

    const hp = el("div", "gauge", this.status);
    const mp = el("div", "gauge", this.status);
    hp.style.width = "220px";
    mp.style.width = "220px";
    this.hpFill = el("div", "fill hp", hp);
    this.mpFill = el("div", "fill mp", mp);
    this.hpText = el("div", "gauge-text", hp);
    this.mpText = el("div", "gauge-text", mp);
  }

  buildExp() {
    this.exp = el("div", "expbar", this.root);
    this.expFill = el("div", "exp-fill", this.exp);
    this.expText = el("div", "exp-text", this.exp);
  }

  buildMenu() {
    // KMS 2026: 8 utility buttons in a horizontal strip (dark slate, rounded).
    this.menu = el("div", "quickmenu", this.root);
    const icons: Record<string, { icon: string; title: string; fn: (w: Windows) => void }> = {
      Stat: { icon: "☰", title: "Character Stats (S)", fn: (w) => w.toggle(w.stat) },
      Skill: { icon: "⚔", title: "Skills (K)", fn: (w) => w.toggle(w.skill) },
      Equip: { icon: "👕", title: "Equipment (E)", fn: (w) => w.ext.open("equip") },
      Inv: { icon: "🎒", title: "Inventory (I)", fn: (w) => w.ext.open("inv") },
      Craft: { icon: "⚒", title: "Crafting (J)", fn: (w) => w.ext.open("craft") },
      AH: { icon: "💰", title: "Auction House (H)", fn: (w) => w.ext.open("ah") },
      Auto: { icon: "⚙", title: "Auto Settings (B·RMB)", fn: (w) => w.toggle(w.autoWin) },
      Menu: { icon: "≡", title: "Menu", fn: (w) => w.ext.toggleMenu(this.menu.lastElementChild as HTMLElement) },
    };
    for (const [k, v] of Object.entries(icons)) {
      const b = el("button", "qm-btn", this.menu) as HTMLButtonElement;
      b.type = "button";
      b.textContent = v.icon;
      b.title = v.title;
      b.setAttribute("aria-label", v.title);
      b.addEventListener("click", () => v.fn(this.wins));
    }
  }

  buildChat() {
    this.chat = el("div", "chat", this.root);
    this.chatLog = el("div", "chat-log", this.chat);
    const inp = el("div", "chat-input", this.chat);
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
    const head = el("div", "mini-header", this.mini);
    el("span", "mini-street", head);
    el("span", "mini-name", head);
    this.miniBody = el("div", "mini-body", this.mini);
  }

  setMap(m: MapData) {
    const mm = m.miniMap;
    this.miniInfo = mm;
    this.miniPortals = [];
    this.miniBody.textContent = "";
    this.miniImg = el("div", "mini-img", this.miniBody);
    this.miniStreet = this.mini.querySelector(".mini-street") as HTMLElement;
    this.miniStreet.textContent = m.street;
    this.miniName = this.mini.querySelector(".mini-name") as HTMLElement;
    this.miniName.textContent = m.name;

    const imgW = mm.width / mm.mag, imgH = mm.height / mm.mag;
    this.miniScale = Math.min(1, 220 / imgW);
    const cw = Math.round(imgW * this.miniScale), chh = Math.round(imgH * this.miniScale);
    Object.assign(this.miniImg.style, { width: `${cw}px`, height: `${chh}px` });
    this.miniBody.style.width = `${cw}px`;
    this.miniBody.style.height = `${chh}px`;
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
    const qW = 16 * 34 + 15 * 3 + 16; // 16 slots × 34px + 15 gaps + padding
    const compactQ = W < 900;
    this.quick.style.width = `${compactQ ? 8 * 34 + 7 * 3 + 16 : qW}px`;
    this.quick.style.left = `${W - Number(this.quick.style.width.replace('px', '')) - 8}px`;
    this.quick.style.right = "auto";
    this.quick.style.top = "auto";
    this.quick.style.bottom = "22px";
    this.quick.classList.toggle("compact", compactQ);

    // Position chat on the left, above the quick menu.
    this.chat.style.left = "8px";
    this.chat.style.bottom = "24px";
    const chatW = 420;
    const showChat = W >= chatW + qW + 40;
    this.chat.style.display = showChat ? "" : "none";

    // Quick menu (8 buttons) sits above the chat.
    this.menu.style.left = "8px";
    this.menu.style.bottom = `${Math.min(H - 160, 160)}px`;

    // Position auto-battle button above the quick slots.
    const qLeft = W - Number(this.quick.style.width.replace('px', '')) - 8;
    Object.assign(this.wins.autoBtn.style, { left: `${qLeft + 10}px`, top: `${H - 22 - 34 * 2 - 3 - 8 - 30}px` });

    this.wins.layoutLogs(W, H, Number(this.quick.style.width.replace('px', '')), 12, 34 * 2 + 16);
    this.last = "";
  }

  update(dt: number) {
    const g = this.game, s = g.stats;
    const need = Math.round(expToLevel(s.level));
    const key = `${s.level}|${s.hp}|${s.maxHp}|${s.mp}|${s.maxMp}|${s.exp}|${s.name}`;
    if (key !== this.last || (performance.now() % 2000 < 20)) {
      this.last = key;
      this.hpFill.style.width = `${Math.round((s.hp / s.maxHp) * 100)}%`;
      this.mpFill.style.width = `${Math.round((s.mp / s.maxMp) * 100)}%`;
      this.hpText.textContent = `${s.hp} / ${s.maxHp}`;
      this.mpText.textContent = `${s.mp} / ${s.maxMp}`;
      this.lvText.textContent = `Lv. ${s.level}`;
      this.nameText.textContent = s.name;
      const pct = Math.min(100, (s.exp / need) * 100);
      this.expFill.style.width = `${pct.toFixed(2)}%`;
      this.expText.textContent = `${s.exp.toLocaleString()} [${pct.toFixed(2)}%]`;
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
