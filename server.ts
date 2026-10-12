// Bun dev/production server. Bun bundles index.html (and its TS/WGSL imports) on the fly.
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: { "/": index },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Wayfarer running at ${server.url}`);
