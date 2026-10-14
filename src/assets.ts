import type { Renderer, Tex } from "./gpu.ts";

export interface Sprite { url: string; w: number; h: number; ox: number; oy: number; delay?: number }

let active = 0;

/** Loads and caches remote images as GPU textures (hotlinked from maplestory.io). */
export class Assets {
  private cache = new Map<string, Tex | null>();
  private pending = new Map<string, Promise<Tex | null>>();
  loaded = 0;
  failed = 0;

  constructor(private r: Renderer) {}

  load(url: string): Promise<Tex | null> {
    const hit = this.pending.get(url);
    if (hit) return hit;
    const p = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          while (active >= 16) await new Promise((r) => setTimeout(r, 20));
          active++;
          const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
          const res = await fetch(src, { mode: "cors" }).finally(() => active--);
          if (!res.ok) throw new Error(String(res.status));
          const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
          const t = this.r.texture(bmp);
          this.cache.set(url, t);
          this.loaded++;
          return t;
        } catch {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
      this.cache.set(url, null);
      this.failed++;
      return null;
    })();
    this.pending.set(url, p);
    return p;
  }

  /** Returns the texture if ready; otherwise starts loading and returns null. */
  get(url: string): Tex | null {
    const t = this.cache.get(url);
    if (t !== undefined) return t;
    this.load(url);
    return null;
  }

  set(url: string, tex: Tex | null) {
    this.cache.set(url, tex);
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }
}

export async function json<T = any>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}
