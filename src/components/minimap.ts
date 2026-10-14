// Modular Minimap Component — parchment header, minimap scale, player dot & portal indicators
import type { MapData } from "../game.ts";
import { el, bg } from "../util.ts";

export type MinimapMode = "full" | "compact" | "hidden";

export class MinimapComponent {
  root: HTMLElement;
  streetText: HTMLElement;
  nameText: HTMLElement;
  body: HTMLElement;
  img: HTMLElement | null = null;
  dot: HTMLElement | null = null;
  portals: HTMLElement[] = [];
  mode: MinimapMode = "full";
  scale = 1;
  info: MapData["miniMap"] | null = null;

  constructor(parent: HTMLElement, private onModeChange?: (mode: MinimapMode) => void) {
    this.root = el("div", "minimap", parent);

    // Top control bar: [-][+]
    const topBar = el("div", "mini-top-bar", this.root);
    const zoomGroup = el("div", "mini-zoom-group", topBar);
    const minusBtn = el("button", "mini-btn mini-minus", zoomGroup) as HTMLButtonElement;
    minusBtn.type = "button";
    minusBtn.textContent = "-";
    minusBtn.title = "Zoom Out / Minimize (M)";
    minusBtn.addEventListener("click", () => this.toggle());

    const plusBtn = el("button", "mini-btn mini-plus", zoomGroup) as HTMLButtonElement;
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.title = "Zoom In / Expand Minimap";
    plusBtn.addEventListener("click", () => this.setMode("full"));

    // Header inside minimap: Map Badge + 2 Lines: Street Name / Map Name
    const head = el("div", "mini-header", this.root);
    const badge = el("div", "mini-badge", head);
    badge.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="3" fill="#334155" stroke="#64748b" stroke-width="1.5"/><path d="M5 8h14M7 8V6m5 2V6m5 2V6M8 18v-5a4 4 0 0 1 8 0v5" stroke="#94a3b8" stroke-width="1.5" fill="none"/></svg>`;

    const titles = el("div", "mini-titles", head);
    this.streetText = el("div", "mini-street", titles);
    this.nameText = el("div", "mini-name", titles);

    // Viewport frame
    const viewFrame = el("div", "mini-viewframe", this.root);
    this.body = el("div", "mini-body", viewFrame);

    // Bottom fold tab
    const foldTab = el("div", "mini-fold-tab", this.root);
    foldTab.title = "Toggle Minimap Fold";
    foldTab.innerHTML = `<svg viewBox="0 0 12 12" width="8" height="8"><path d="M2 4l4 4 4-4" fill="currentColor"/></svg>`;
    foldTab.addEventListener("click", () => this.toggle());

    // Quick Move button under minimap
    const qm = el("button", "mini-quick-move", parent) as HTMLButtonElement;
    qm.type = "button";
    qm.innerHTML = `<span>Quick Move</span><svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 4l4 4 4-4" fill="currentColor"/></svg>`;
    qm.title = "Quick Move to Portals & Towns";
  }

  setMode(mode: MinimapMode) {
    this.mode = mode;
    this.root.classList.toggle("compact", mode === "compact");
    this.root.classList.toggle("minimized", mode === "hidden");
    this.onModeChange?.(mode);
  }

  toggle() {
    if (this.mode === "full") this.setMode("compact");
    else if (this.mode === "compact") this.setMode("hidden");
    else this.setMode("full");
  }

  setMap(m: MapData, portals: { x: number; y: number }[]) {
    this.streetText.textContent = m.street || "Maple Road";
    this.nameText.textContent = m.name || "Mushroom Town";

    this.body.textContent = "";
    this.portals = [];
    const info = m.miniMap;
    this.info = info;

    if (!info?.url) {
      this.img = null;
      return;
    }

    const imgW = info.width / info.mag;
    const imgH = info.height / info.mag;
    this.scale = Math.min(1, 220 / imgW);
    const cw = Math.round(imgW * this.scale);
    const chh = Math.round(imgH * this.scale);

    this.img = el("div", "mini-img", this.body);
    Object.assign(this.img.style, { width: `${cw}px`, height: `${chh}px` });
    this.body.style.width = `${cw}px`;
    this.body.style.height = `${chh}px`;
    bg(this.img, info.url);

    // Portals
    for (const p of portals) {
      const pt = el("div", "mini-portal", this.img);
      const [x, y] = this.toMiniCoords(p.x, p.y);
      Object.assign(pt.style, { left: `${x}px`, top: `${y}px` });
      this.portals.push(pt);
    }

    this.dot = el("div", "mini-dot", this.img);
  }

  toMiniCoords(wx: number, wy: number): [number, number] {
    if (!this.info) return [0, 0];
    const mm = this.info;
    return [
      ((wx + mm.centerX) / mm.mag) * this.scale,
      ((wy + mm.centerY) / mm.mag) * this.scale,
    ];
  }

  updatePlayer(px: number, py: number) {
    if (this.info && this.dot) {
      const [x, y] = this.toMiniCoords(px, py);
      this.dot.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}
