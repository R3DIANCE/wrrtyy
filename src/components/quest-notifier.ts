// Modular Quest Notifier Component — left edge vertical capsule with 4 alert buttons
import type { Game } from "../game.ts";
import { el } from "../util.ts";

export class QuestNotifierComponent {
  root: HTMLElement;
  pulses: Record<string, HTMLElement> = {};

  constructor(
    parent: HTMLElement,
    private game: Game,
    private onDailyGift: () => void,
    private onNotice: (msg: string) => void
  ) {
    this.root = el("div", "quest-notifier", parent);

    // 1) Sun: Maple Life / Daily bonus
    const sun = el("button", "quest-btn quest-sun", this.root) as HTMLButtonElement;
    sun.type = "button";
    sun.title = "Maple Life & Daily Rewards";
    sun.innerHTML = `<svg viewBox="0 0 32 32" width="24" height="24"><circle cx="16" cy="16" r="9" fill="#facc15" stroke="#eab308" stroke-width="1.5"/><path d="M16 2v3M16 27v3M2 16h3M27 16h3M6 6l2.5 2.5M23.5 23.5 26 26M6 26l2.5-2.5M23.5 8.5 26 6" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="15" r="1.3" fill="#1e293b"/><circle cx="19" cy="15" r="1.3" fill="#1e293b"/><path d="M13 18.5c1 1.2 5 1.2 6 0" stroke="#1e293b" stroke-width="1.4" stroke-linecap="round"/><path d="M8 16a8 8 0 0 1 16 0" fill="none" stroke="#0284c7" stroke-width="2.5"/><rect x="6" y="14" width="3.5" height="5.5" rx="1.5" fill="#0284c7"/><rect x="22.5" y="14" width="3.5" height="5.5" rx="1.5" fill="#0284c7"/></svg>`;
    sun.addEventListener("click", () => this.onDailyGift());

    // 2) Book: Quest Records & Guide
    const book = el("button", "quest-btn quest-book", this.root) as HTMLButtonElement;
    book.type = "button";
    book.title = "Quest Records & Guide";
    book.innerHTML = `<svg viewBox="0 0 32 32" width="24" height="24"><rect x="6" y="5" width="20" height="22" rx="3" fill="#0284c7" stroke="#0369a1" stroke-width="1.5"/><path d="M6 8h20M6 24h20" stroke="#38bdf8" stroke-width="1"/><rect x="18" y="4" width="4" height="7" fill="#facc15"/><path d="M14 14l1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z" fill="#ffffff"/></svg>`;
    book.addEventListener("click", () => {
      this.onNotice("--- Maple Guide & Hotkeys ---");
      this.onNotice("Move: ← → | Jump: Alt/Space | Attack: Ctrl/X | Loot: Z");
      this.onNotice("Stats: S | Skills: K | Equip: E | Inventory: I | Auto Battle: B");
    });

    // 3) Lightbulb: Permanent Story & Job Advancements
    const bulb = el("button", "quest-btn quest-bulb", this.root) as HTMLButtonElement;
    bulb.type = "button";
    bulb.title = "Quests & Job Advancements";
    bulb.innerHTML = `<svg viewBox="0 0 32 32" width="24" height="24"><path d="M16 6a7 7 0 0 0-5 11.9c.7.7 1 1.7 1 2.6v1.5h8v-1.5c0-.9.3-1.9 1-2.6A7 7 0 0 0 16 6z" fill="#f0f9ff" stroke="#38bdf8" stroke-width="1.5"/><path d="M13 25h6M14 27h4" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="13" r="2.5" fill="#38bdf8"/></svg>`;
    this.pulses.bulb = el("span", "quest-pulse hidden", bulb);
    bulb.addEventListener("click", () => {
      const lv = this.game.stats.level;
      let msg = "";
      if (lv >= 100) msg = "Level 100+: 4th Job trials await in the Maple World!";
      else if (lv >= 60) msg = "Level 60+: 3rd Job Advancement unlocked! Check your Skill window (K).";
      else if (lv >= 30) msg = "Level 30+: 2nd Job Advancement available! Open Skills (K) to learn new arts.";
      else if (lv >= 10) msg = "Level 10+: 1st Job complete! Allocate your AP (S) and SP (K).";
      else msg = "Beginner Guide: Hunt mushrooms and reach Lv. 10 to advance your job!";
      this.onNotice(`[Quest] ${msg}`);
      this.game.say(msg);
    });

    // 4) Star: Event Quests & Stage Bosses
    const star = el("button", "quest-btn quest-star", this.root) as HTMLButtonElement;
    star.type = "button";
    star.title = "Event Quests & Boss Battles";
    star.innerHTML = `<svg viewBox="0 0 32 32" width="24" height="24"><path d="M16 4l3.5 7.5 8 .8-6 5.5 1.8 8.2-7.3-4.2-7.3 4.2 1.8-8.2-6-5.5 8-.8z" fill="#facc15" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    this.pulses.star = el("span", "quest-pulse hidden", star);
    star.addEventListener("click", () => {
      if (this.game.bossReady()) {
        this.game.challengeBoss();
      } else {
        const need = Math.max(0, this.game.stageNeed - this.game.stage.kills);
        this.onNotice(`Stage boss not ready yet. Defeat ${need} more monsters!`);
      }
    });
  }

  update() {
    if (this.pulses.star) {
      this.pulses.star.classList.toggle("hidden", !this.game.bossReady());
    }
    if (this.pulses.bulb) {
      const lv = this.game.stats.level;
      const advEligible =
        (lv >= 10 && lv < 15) ||
        (lv >= 30 && lv < 35) ||
        (lv >= 60 && lv < 65) ||
        (lv >= 100 && lv < 105);
      this.pulses.bulb.classList.toggle("hidden", !advEligible);
    }
  }
}
