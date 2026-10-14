#!/usr/bin/env bun
import { cp, exists, readdir, unlink } from "node:fs/promises";

console.log("⚡ Building Maple Wayfarer with Bun...");
const start = performance.now();

// Clean stale build artifacts from dist/
if (await exists("./dist")) {
  const entries = await readdir("./dist");
  for (const f of entries) {
    if (f !== "data") {
      await unlink(`./dist/${f}`).catch(() => {});
    }
  }
}

import tailwind from "bun-plugin-tailwind";

const buildResult = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  sourcemap: "external",
  plugins: [tailwind],
});

if (!buildResult.success) {
  console.error("❌ Build failed:", buildResult.logs);
  process.exit(1);
}

// Copy public/data and public/cursors into dist/ if needed
if (await exists("./public/data") && !(await exists("./dist/data"))) {
  await cp("./public/data", "./dist/data", { recursive: true });
}
if (await exists("./public/cursors") && !(await exists("./dist/cursors"))) {
  await cp("./public/cursors", "./dist/cursors", { recursive: true });
}

const elapsed = (performance.now() - start).toFixed(1);
console.log(`✅ Build completed in ${elapsed}ms -> dist/`);
