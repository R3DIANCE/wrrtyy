/** Creates an HTML element with class and optional parent. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Formats integer with locale commas. */
export const fmt = (n: number) => Math.round(n).toLocaleString();

/** Escapes HTML special characters for safe string interpolation. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Formats duration in seconds into 'Xh Ym' or 'Ym'. */
export const dur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

/** Star string for Star Force rendering. */
export const stars = (n: number) => (n ? `<span class="stars">${"★".repeat(Math.min(n, 15))}</span>` : "");

/** Quick HTML icon tag with background-image. */
export const icon = (url: string, cls = "ic") => `<span class="${cls}" style="background-image:url('${url}')"></span>`;

// ============================================================
// Asset caching and background image management
// ============================================================
const CACHE_KEY = "maple-wayfarer-asset-cache";
const memory = new Set<string>();
const API = ("__PORT_3000__" as string).startsWith("__") ? "" : "__PORT_3000__";

/** Saves one URL to the server-side /assets/ folder (fire-and-forget). */
export function cacheAsset(url: string) {
  if (!url || memory.has(url)) return;
  memory.add(url);
  const clean = url.split("?")[0];
  fetch(`${API}/api/cache-asset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: clean }) })
    .catch(() => {});
  try {
    const seen = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as string[];
    if (!seen.includes(clean)) { seen.push(clean); localStorage.setItem(CACHE_KEY, JSON.stringify(seen.slice(-5000))); }
  } catch {}
}

/** Rewarms the server cache for URLs the client has seen before. */
export function warmCache() {
  try {
    const seen = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as string[];
    if (seen.length) fetch(`${API}/api/warm-assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: seen }) }).catch(() => {});
  } catch {}
}

const okSrc = new Map<string, string>();

/** Sets a background image with caching and automatic retry with cache-buster. */
export function bg(e: HTMLElement, url: string, attempt = 0) {
  const known = okSrc.get(url);
  if (known) { e.style.backgroundImage = `url("${known}")`; cacheAsset(url); return; }
  const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
  const img = new Image();
  img.onload = () => { okSrc.set(url, src); e.style.backgroundImage = `url("${src}")`; cacheAsset(url); };
  img.onerror = () => { if (attempt < 4) setTimeout(() => bg(e, url, attempt + 1), 700 * (attempt + 1)); };
  img.src = src;
}
