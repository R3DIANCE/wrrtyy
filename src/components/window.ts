// Modular Window Component — handles clamping, dragging, z-index elevation, and titlebars
import { el } from "../util.ts";

export function clampWindow(e: HTMLElement) {
  const availW = Math.max(200, innerWidth - 8);
  const availH = Math.max(200, innerHeight - 72);
  const curW = e.offsetWidth || parseInt(e.style.width) || 300;
  const curH = e.offsetHeight || parseInt(e.style.height) || 400;
  if (curW > availW) e.style.maxWidth = `${availW}px`;
  if (curH > availH) e.style.maxHeight = `${availH}px`;
  const w = e.offsetWidth || parseInt(e.style.width) || 300;
  const h = e.offsetHeight || parseInt(e.style.height) || 400;
  const maxL = Math.max(4, innerWidth - w - 4);
  const maxT = Math.max(4, innerHeight - h - 68);
  const curL = parseInt(e.style.left) || 0;
  const curT = parseInt(e.style.top) || 0;
  e.style.left = `${Math.max(4, Math.min(maxL, curL))}px`;
  e.style.top = `${Math.max(4, Math.min(maxT, curT))}px`;
}

export interface WindowOptions {
  id: string;
  w: number;
  h: number;
  title: string | null;
  x: number;
  y: number;
  layer: HTMLElement;
  nextZ: () => number;
}

export function makeWindow(opts: WindowOptions): HTMLElement {
  const { id, w, h, title, x, y, layer, nextZ } = opts;
  const win = el("section", "win hidden win-css", layer);
  win.id = id;
  win.setAttribute("aria-label", title ?? id);

  const clX = Math.max(4, Math.min(Math.max(4, innerWidth - w - 4), x));
  const clY = Math.max(4, Math.min(Math.max(4, innerHeight - h - 68), y));
  Object.assign(win.style, { width: `${w}px`, height: `${h}px`, left: `${clX}px`, top: `${clY}px` });

  if (title) {
    const bar = el("div", "win-titlebar", win);
    const t = el("span", "win-title", bar);
    t.textContent = title;
    const close = el("button", "win-close", bar) as HTMLButtonElement;
    close.type = "button";
    close.textContent = "×";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", (ev) => { ev.stopPropagation(); win.classList.add("hidden"); });
  } else {
    el("div", "win-drag", win);
    const close = el("button", "win-close", win) as HTMLButtonElement;
    close.type = "button";
    close.textContent = "×";
    close.style.cssText = "position:absolute;right:6px;top:6px;width:20px;height:20px;display:grid;place-items:center;border:0;border-radius:4px;background:transparent;color:#7b8794;font:700 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer;transition:background .12s,color .12s;z-index:5;";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", (ev) => { ev.stopPropagation(); win.classList.add("hidden"); });
  }

  const drag = (win.querySelector(".win-titlebar") || win.querySelector(".win-drag")) as HTMLElement | null;
  if (drag) {
    drag.addEventListener("pointerdown", (ev: PointerEvent) => {
      const ox = ev.clientX - win.offsetLeft, oy = ev.clientY - win.offsetTop;
      const mv = (m: PointerEvent) => {
        const curW = win.offsetWidth || w;
        const curH = win.offsetHeight || h;
        const maxL = Math.max(4, innerWidth - curW - 4);
        const maxT = Math.max(4, innerHeight - curH - 68);
        win.style.left = `${Math.max(4, Math.min(maxL, m.clientX - ox))}px`;
        win.style.top = `${Math.max(4, Math.min(maxT, m.clientY - oy))}px`;
      };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }

  win.addEventListener("pointerdown", () => { win.style.zIndex = String(nextZ()); });
  return win;
}
