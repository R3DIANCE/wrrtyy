// Bun dev/production server. Bun bundles index.html (and its TS imports) on the fly.
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: { "/": index },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/data/")) {
      const file = Bun.file(`./public${path}`);
      if (await file.exists()) return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Maple Wayfarer running at ${server.url}`);
