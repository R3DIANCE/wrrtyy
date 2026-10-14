// Modular Chat Component — smart idle/expanded behavior, auto-fading in idle, channel tabs & input
import type { ChatKind, Game } from "../game.ts";
import { el } from "../util.ts";

export type ChatFilter = "all" | "other" | "party" | "friends" | "guild" | "alliance";

export class ChatComponent {
  root: HTMLElement;
  header: HTMLElement;
  tabs: HTMLElement;
  log: HTMLElement;
  input: HTMLInputElement;
  minBtn: HTMLButtonElement;
  filter: ChatFilter = "all";
  minimized = false;
  idleTimer = 0;
  isFocused = false;

  constructor(parent: HTMLElement, private game: Game) {
    this.root = el("div", "chat idle", parent);
    this.root.addEventListener("pointerenter", () => this.expand());
    this.root.addEventListener("pointerleave", () => this.collapse(2000));
    this.root.addEventListener("click", () => this.expand());

    // Chat Header with Channel Tabs & Minimize button
    this.header = el("div", "chat-header", this.root);
    this.tabs = el("div", "chat-tabs", this.header);

    const tabList: { key: string; label: string }[] = [
      { key: "all", label: "All" },
      { key: "other", label: "Other" },
      { key: "party", label: "Party" },
      { key: "friends", label: "Friends" },
      { key: "guild", label: "Guild" },
      { key: "alliance", label: "Alliance" },
      { key: "add", label: "+" },
    ];
    for (const t of tabList) {
      const tb = el("button", `chat-tab ${t.key === "all" ? "active" : ""}`, this.tabs) as HTMLButtonElement;
      tb.type = "button";
      tb.textContent = t.label;
      tb.addEventListener("click", () => {
        if (t.key !== "add") {
          for (const c of Array.from(this.tabs.children)) c.classList.remove("active");
          tb.classList.add("active");
          this.setFilter(t.key as ChatFilter);
        }
      });
    }

    const ctrls = el("div", "chat-ctrls", this.header);
    this.minBtn = el("button", "chat-ctrl-btn chat-min-btn", ctrls) as HTMLButtonElement;
    this.minBtn.type = "button";
    this.minBtn.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none"/></svg>`;
    this.minBtn.title = "Minimize / Restore Chat";
    this.minBtn.addEventListener("click", () => this.toggleMinimize());

    this.log = el("div", "chat-log", this.root);

    // Bottom Input Row
    const inpRow = el("div", "chat-input-row", this.root);
    this.input = el("input", "chat-field", inpRow) as HTMLInputElement;
    this.input.placeholder = "Press Enter to chat";
    this.input.maxLength = 70;
    this.input.addEventListener("focus", () => {
      this.isFocused = true;
      this.expand();
    });
    this.input.addEventListener("blur", () => {
      this.isFocused = false;
      this.collapse(2000);
    });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = this.input.value.trim();
        if (t) this.game.say(t);
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.blur();
      }
    });
  }

  expand() {
    clearTimeout(this.idleTimer);
    this.root.classList.remove("idle");
    this.root.classList.add("expanded");
  }

  collapse(delay = 2000) {
    clearTimeout(this.idleTimer);
    if (this.isFocused) return;
    this.idleTimer = setTimeout(() => {
      if (!this.isFocused) {
        this.root.classList.remove("expanded");
        this.root.classList.add("idle");
      }
    }, delay) as unknown as number;
  }

  setFilter(filter: ChatFilter) {
    this.filter = filter;
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    this.root.classList.toggle("minimized", this.minimized);
  }

  addMessage(kind: ChatKind, text: string) {
    const line = el("div", `chat-line ${kind}`, this.log);
    const d = new Date();
    const time = `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}]`;
    const tSpan = el("span", "chat-time", line);
    tSpan.textContent = time;

    if (kind === "say") {
      const m = text.match(/^([A-Za-z0-9][A-Za-z0-9 ]{0,11})\s*:\s*(.*)$/);
      if (m) {
        const name = m[1], rest = m[2];
        const n = el("b", "chat-name", line); n.textContent = ` ${name} : `;
        const t = el("span", "chat-text", line); t.textContent = rest;
        line.dataset.text = rest;
      } else {
        const t = el("span", "chat-text", line); t.textContent = ` ${text}`;
      }
    } else {
      const t = el("span", "chat-text", line); t.textContent = ` ${text}`;
    }

    if (this.root.classList.contains("idle")) {
      setTimeout(() => {
        if (this.root.classList.contains("idle")) {
          line.classList.add("fade-out");
          setTimeout(() => line.remove(), 600);
        }
      }, 5500);
    } else if (kind !== "say" && kind !== "notice") {
      setTimeout(() => line.remove(), 12000);
    }

    while (this.log.children.length > 80) this.log.firstChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
