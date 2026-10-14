// Modern MapleStory NEXT Bottom HUD Controller (exact 1:1 match to reference using Tailwind CSS)
import { el } from "../util.ts";

export interface StatusUpdateData {
  level: number;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  exp: number;
  expNeed: number;
}

export class StatusCapsule {
  root: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  mpFill: HTMLElement;
  mpText: HTMLElement;
  expText: HTMLElement;
  expBottomFill: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el("div", "ms-hud-center flex flex-col justify-center items-center gap-[2px] pointer-events-auto", parent);

    // HP Bar Row (Thick, wide bar matching modern MapleStory UI)
    const hpRow = el("div", "ms-bar-row flex items-center w-[280px] h-[20px]", this.root);
    const hpTrack = el(
      "div",
      "ms-bar-track relative w-full h-[20px] bg-[#1e2733] border-[1.5px] border-[#10151c] rounded-[3px] overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]",
      hpRow
    );
    this.hpFill = el(
      "div",
      "ms-bar-fill hp absolute left-0 top-0 bottom-0 w-full transition-[width] duration-200 ease-out bg-gradient-to-b from-[#ff4d6d] via-[#e63956] to-[#c9184a] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
      hpTrack
    );
    this.hpText = el(
      "div",
      "ms-bar-text absolute inset-0 flex items-center justify-center font-bold text-[11.5px] leading-[20px] text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000] z-[2] pointer-events-none select-none",
      hpTrack
    );

    // MP Bar Row
    const mpRow = el("div", "ms-bar-row flex items-center w-[280px] h-[20px]", this.root);
    const mpTrack = el(
      "div",
      "ms-bar-track relative w-full h-[20px] bg-[#1e2733] border-[1.5px] border-[#10151c] rounded-[3px] overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]",
      mpRow
    );
    this.mpFill = el(
      "div",
      "ms-bar-fill mp absolute left-0 top-0 bottom-0 w-full transition-[width] duration-200 ease-out bg-gradient-to-b from-[#38bdf8] via-[#0ea5e9] to-[#0284c7] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
      mpTrack
    );
    this.mpText = el(
      "div",
      "ms-bar-text absolute inset-0 flex items-center justify-center font-bold text-[11.5px] leading-[20px] text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000] z-[2] pointer-events-none select-none",
      mpTrack
    );

    // Full screen width bottom EXP progress bar with text inside (12px height fitting text)
    let fullExp = document.querySelector(".ms-screen-exp-bar") as HTMLElement;
    if (!fullExp) {
      fullExp = el(
        "div",
        "ms-screen-exp-bar fixed left-0 right-0 bottom-0 w-screen h-[12px] bg-[#1a222d] border-t border-[#3a4454] shadow-[0_-1px_3px_rgba(0,0,0,0.6)] z-[100] pointer-events-none overflow-hidden box-border",
        document.body
      );
    }
    this.expBottomFill = el(
      "div",
      "ms-screen-exp-fill absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#bef264] via-[#eab308] to-[#84cc16] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-[width] duration-250 pointer-events-none",
      fullExp
    );
    this.expText = el(
      "div",
      "ms-screen-exp-text absolute inset-0 flex items-center justify-center font-bold text-[8px] leading-[12px] text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000] z-[2] pointer-events-none select-none",
      fullExp
    );
  }

  update(d: StatusUpdateData) {
    const hpPct = Math.min(100, Math.max(0, (d.hp / d.maxHp) * 100));
    const mpPct = Math.min(100, Math.max(0, (d.mp / d.maxMp) * 100));
    const expPct = Math.min(100, Math.max(0, (d.exp / d.expNeed) * 100));

    this.hpFill.style.width = `${hpPct}%`;
    this.mpFill.style.width = `${mpPct}%`;
    this.expBottomFill.style.width = `${expPct}%`;

    this.hpText.textContent = `${d.hp.toLocaleString()} / ${d.maxHp.toLocaleString()}`;
    this.mpText.textContent = `${d.mp.toLocaleString()} / ${d.maxMp.toLocaleString()}`;
    this.expText.textContent = `EXP ${d.exp.toLocaleString()} [${expPct.toFixed(2)}%]`;
  }
}

export class PlayerStatusTag {
  root: HTMLElement;
  levelVal: HTMLElement;
  nameVal: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el(
      "div",
      "ms-player-bar flex items-center h-[26px] bg-[#3a4454]/85 border border-[#9ca8b8]/40 rounded-[4px] px-2.5 gap-2 backdrop-blur-[4px] shadow-[0_2px_4px_rgba(0,0,0,0.5)] pointer-events-auto select-none",
      parent
    );
    const lvBadge = el("div", "ms-player-lv flex items-baseline gap-0.5", this.root);
    el("span", "text-slate-400 font-bold text-[11px] leading-none", lvBadge).textContent = "Lv.";
    this.levelVal = el("span", "text-white font-black text-[12.5px] leading-none", lvBadge);
    this.nameVal = el("span", "ms-player-ign font-bold text-[12.5px] leading-none text-white tracking-[0.2px] drop-shadow-[0_1px_2px_#000]", this.root);
  }

  update(level: number, name: string) {
    this.levelVal.textContent = `${level}`;
    this.nameVal.textContent = name;
  }
}

export class MapleWorldProgress {
  root: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el(
      "div",
      "ms-maple-world-widget flex items-center gap-[3px] font-bold text-[10px] text-slate-400 mb-[2px] drop-shadow-[0_1px_2px_#000]",
      parent
    );
    this.root.innerHTML = `<span class="mw-label text-[#e2ef17] tracking-[0.3px]">MAPLE WORLD</span><span class="mw-bracket text-slate-400">[</span><span class="mw-count text-white">0/5000</span><span class="mw-bracket text-slate-400">]</span>`;
  }
}

export interface MenuItem {
  iconSvg: string;
  title: string;
  onClick: (btn: HTMLElement) => void;
  badge?: boolean;
}

export class MenuButtons {
  root: HTMLElement;
  badges: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement, items: Record<string, MenuItem>) {
    this.root = el(
      "div",
      "dock-menu flex items-center gap-[3px] p-0 bg-transparent border-0 shadow-none",
      parent
    );
    for (const [key, item] of Object.entries(items)) {
      const b = el(
        "button",
        "ms-menu-btn relative w-[27px] h-[27px] bg-[#3a4454]/80 hover:bg-[#4f5e77] active:translate-y-[1px] border border-[#9ca8b8]/40 hover:border-[#9ca8b8] rounded-[4px] flex items-center justify-center text-slate-200 hover:text-white cursor-pointer p-0 backdrop-blur-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-100",
        this.root
      ) as HTMLButtonElement;
      b.type = "button";
      b.title = item.title;
      b.setAttribute("aria-label", item.title);
      b.innerHTML = item.iconSvg;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        item.onClick(b);
      });
      if (item.badge) {
        this.badges[key] = el(
          "span",
          "ms-badge-dot absolute right-[2px] top-[2px] w-[5px] h-[5px] rounded-full bg-[#ff9f1c] border border-black shadow-[0_0_4px_#ff9f1c] hidden",
          b
        );
      }
    }
  }

  setBadge(key: string, visible: boolean) {
    if (this.badges[key]) {
      this.badges[key].classList.toggle("hidden", !visible);
    }
  }
}
