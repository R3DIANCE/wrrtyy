// Production server — serves dist/ plus the asset cache and game data.
import homepage from "./index.html";

const port = Number(process.env.PORT ?? 3000);
// import.meta.dir is a native path on every OS (URL.pathname gives "/C:/..." on Windows).
const ROOT = import.meta.dir;

/** Saves one maplestory.io URL to /assets/<name> so the game works offline. */
async function cacheOne(url: string): Promise<string | null> {
  if (!url.startsWith("http")) return null;
  const safe = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9._-]+/gi, "_");
  const file = Bun.file(`${ROOT}/assets/${safe}`);
  if (await file.exists()) return safe;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    await Bun.write(file, res);
    return safe;
  } catch { return null; }
}

const server = Bun.serve({
  port,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": homepage,
    "/index.html": homepage,
  },
  async fetch(req) {
    const path = new URL(req.url).pathname;

    // API: cache a single asset to /assets/
    if (path === "/api/cache-asset" && req.method === "POST") {
      const { url } = (await req.json()) as { url: string };
      const saved = await cacheOne(url);
      return Response.json({ saved });
    }

    // API: warm the cache for a batch of URLs with Bun concurrency
    if (path === "/api/warm-assets" && req.method === "POST") {
      const { urls } = (await req.json()) as { urls: string[] };
      const targets = urls.slice(0, 5000);
      const batchSize = 25;
      let count = 0;
      for (let i = 0; i < targets.length; i += batchSize) {
        const chunk = targets.slice(i, i + batchSize);
        const res = await Promise.all(chunk.map(cacheOne));
        count += res.filter(Boolean).length;
      }
      return Response.json({ count });
    }

    // Static files: dist/ first, then public/, then assets/
    const candidates = [`${ROOT}/dist${path}`, `${ROOT}/public${path}`, `${ROOT}${path}`];
    for (const c of candidates) {
      if (path === "/") continue;
      const file = Bun.file(c);
      if (await file.exists()) {
        const isDir = (await file.stat()).isDirectory?.();
        if (!isDir) {
          if (path.startsWith("/assets/")) {
            return new Response(file, { headers: { "content-type": file.type || "image/png" } });
          }
          if (path.endsWith(".cur")) {
            return new Response(file, { headers: { "content-type": "image/x-icon" } });
          }
          if (path.endsWith(".gif")) {
            return new Response(file, { headers: { "content-type": "image/gif" } });
          }
          return new Response(file);
        }
      }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Maple Wayfarer running at ${server.url}`);
