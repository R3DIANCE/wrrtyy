// Production server — serves dist/ plus the asset cache and game data.
const port = Number(process.env.PORT ?? 3000);
const ROOT = new URL(import.meta.url).pathname.replace(/\/server\.ts$/, "");

/** Saves one maplestory.io URL to /assets/<name> so the game works offline. */
async function cacheOne(url: string): Promise<string | null> {
  if (!url.startsWith("http")) return null;
  const safe = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9._-]+/gi, "_");
  const file = Bun.file(`${ROOT}/assets/${safe}`);
  if (await file.exists()) return safe;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    await Bun.write(file, await res.arrayBuffer());
    return safe;
  } catch { return null; }
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;

    // API: cache a single asset to /assets/
    if (path === "/api/cache-asset" && req.method === "POST") {
      const { url } = (await req.json()) as { url: string };
      const saved = await cacheOne(url);
      return new Response(JSON.stringify({ saved }), { headers: { "content-type": "application/json" } });
    }
    // API: warm the cache for a batch of URLs (re-warm on page load).
    if (path === "/api/warm-assets" && req.method === "POST") {
      const { urls } = (await req.json()) as { urls: string[] };
      const saved: (string | null)[] = [];
      for (const u of urls.slice(0, 5000)) saved.push(await cacheOne(u));
      return new Response(JSON.stringify({ count: saved.filter(Boolean).length }), { headers: { "content-type": "application/json" } });
    }

    // Static files: dist/ first, then public/, then assets/
    const candidates = [`${ROOT}/dist${path}`, `${ROOT}/public${path}`, `${ROOT}${path}`];
    for (const c of candidates) {
      if (path === "/") continue;
      const file = Bun.file(c);
      if (await file.exists()) {
        const isDir = (await file.stat()).isDirectory?.();
        if (!isDir) {
          // Serve cached maplestory.io assets with the right MIME type.
          if (path.startsWith("/assets/")) {
            const ext = path.split(".").pop()?.toLowerCase();
            const mime = ext === "json" ? "application/json" : ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
            return new Response(file, { headers: { "content-type": mime } });
          }
          return new Response(file);
        }
      }
    }
    // Root
    if (path === "/" || path === "/index.html") {
      const file = Bun.file(`${ROOT}/dist/index.html`);
      if (await file.exists()) return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Maple Wayfarer running at ${server.url}`);
