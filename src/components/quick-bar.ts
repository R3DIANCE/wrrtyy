// Modular QuickBar Component — keyboard layout, slot binding, drag/drop & key badges
import type { Game } from "../game.ts";
import { KEY_BADGES, KEY_LABEL, QUICK_KEYS, SKILL, type Action } from "../skills.ts";
import { el, bg } from "../util.ts";

export class QuickBarComponent {
  root: HTMLElement;
  slots: Record<string, HTMLElement> = {};
  lastSig = "";

  constructor(
    parent: HTMLElement,
    private game: Game,
    private makeDraggable: (el: HTMLElement, getAction: () => Action | null, fromKey?: string, onClick?: () => void) => void,
    private bindTip: (el: HTMLElement, getHtml: () => string | null) => void,
    private getActionTip: (a: Action) => string,
    private getActionIcon: (a: Action, disabled?: boolean) => string
  ) {
    this.root = el("div", "quick-keyboard flex items-center gap-[4px] p-0 bg-transparent border-0 shadow-none", parent);

    const navCluster = el("div", "quick-cluster cluster-nav grid grid-cols-4 grid-rows-2 gap-[2px]", this.root);
    const navKeys = ["Shift", "Insert", "Home", "PageUp", "Control", "Delete", "End", "PageDown"];

    const mainCluster = el("div", "quick-cluster cluster-main grid grid-cols-12 grid-rows-2 gap-[2px]", this.root);
    const mainKeys = [
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ];

    const createSlot = (key: string, cluster: HTMLElement) => {
      const slot = el("div", "slot relative w-[27px] h-[27px] bg-[#3a4454]/75 hover:bg-[#4f5e77]/90 border border-[#9ca8b8]/35 hover:border-[#9ca8b8]/70 rounded-[3px] cursor-default select-none backdrop-blur-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-colors", cluster);
      slot.dataset.key = key;
      el("div", "slot-icon absolute inset-[2px] bg-center bg-no-repeat bg-contain [image-rendering:pixelated] z-[2]", slot);
      el("span", "slot-count absolute right-[2px] bottom-[1px] font-bold text-[8.5px] leading-[10px] text-white drop-shadow-[0_1px_2px_#000] pointer-events-none z-[4]", slot);
      const k = el("span", "slot-key absolute left-[2px] top-[1px] font-bold text-[8px] leading-[9px] text-[#d2d8e1] drop-shadow-[0_1px_2px_#000] pointer-events-none z-[3]", slot);
      k.textContent = KEY_LABEL[key] ?? key;

      const badgeInfo = KEY_BADGES[key];
      if (badgeInfo) {
        const b = el("span", `slot-badge badge-${badgeInfo.color} absolute left-[1px] right-[1px] bottom-[1px] font-black text-[6px] leading-[8px] rounded-[2px] text-center uppercase tracking-[-0.2px] pointer-events-none z-[2]`, slot);
        b.textContent = badgeInfo.text;
      }

      this.slots[key] = slot;
      this.makeDraggable(slot, () => this.game.quick[key] ?? null, key, () => this.game.useAction(this.game.quick[key]));
      slot.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (this.game.quick[key]) {
          this.game.quick[key] = null;
          this.lastSig = "";
          this.game.onChange();
        }
      });
      this.bindTip(slot, () => {
        const a = this.game.quick[key];
        return a ? this.getActionTip(a) + `<p class="tip-dim">Drag to move · drag off or right-click to remove</p>` : null;
      });
    };

    for (const key of navKeys) createSlot(key, navCluster);
    for (const key of mainKeys) createSlot(key, mainCluster);
  }

  render() {
    const g = this.game;
    const sig = QUICK_KEYS.map((k) => {
      const a = g.quick[k];
      if (!a) return "-";
      if (a.t === "item") return `i${a.id}:${g.inv[a.id] ?? 0}`;
      if (a.t === "skill") {
        const d = SKILL[a.id], lv = g.lv(a.id);
        return `s${a.id}:${lv > 0 && (d.kind === "passive" || g.stats.mp >= d.mp(lv)) ? 1 : 0}`;
      }
      return "a";
    }).join("|");

    if (sig === this.lastSig) return;
    this.lastSig = sig;

    for (const k of QUICK_KEYS) {
      const slot = this.slots[k];
      if (!slot) continue;
      const a = g.quick[k];
      const icon = slot.querySelector(".slot-icon") as HTMLElement;
      const count = slot.querySelector(".slot-count") as HTMLElement;

      slot.classList.toggle("filled", !!a);
      if (!a) {
        icon.style.backgroundImage = "";
        count.textContent = "";
        slot.classList.remove("off");
        continue;
      }

      let off = false;
      if (a.t === "skill") {
        const d = SKILL[a.id], lv = g.lv(a.id);
        off = lv <= 0 || (d && d.kind !== "passive" && g.stats.mp < d.mp(lv));
      }
      if (a.t === "item") {
        off = (g.inv[a.id] ?? 0) <= 0;
      }

      slot.classList.toggle("off", off);
      bg(icon, this.getActionIcon(a, off));
      count.textContent = a.t === "item" ? String(g.inv[a.id] ?? 0) : "";
    }
  }
}
