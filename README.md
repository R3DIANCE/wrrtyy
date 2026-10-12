# Wayfarer

A top-down exploration game on an **infinite, procedurally generated map**, rendered entirely with **WebGPU** and served/bundled with **Bun**.

Walk coasts, dunes, meadows, old forests, fens, highlands and snowcaps. Gather relic shards, discover named landmarks, and find your way by lantern light when night falls. The world never ends and never repeats — it is generated from a seed, on the fly, on the GPU.

## Run it

```bash
bun install
bun run dev        # http://localhost:3000 with hot reload
```

Other scripts:

```bash
bun run build      # static bundle in ./dist
bun run start      # production server
bun run typecheck
```

Pick a world with `?seed=12345` in the URL (random otherwise).

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| `Shift` | Run |
| Mouse wheel | Zoom |
| `M` or click the minimap | Toggle the large map |
| `F` | Fullscreen |
| Touch drag | Walk (mobile) |

## How it works

- **`src/terrain.wgsl`** — a single full-screen fragment shader draws everything: multi-octave value-noise height and moisture fields, 9 biomes, hillshading, contour lines, animated water and shore foam, trees/pines/stones/reeds on a hashed grid, relics, standing-stone landmarks, the player, and day/night lighting with a flickering lantern.
- **Infinite precision** — the camera position is split into an integer cell (`vec2<i32>`) and a fractional offset, and noise lattices are indexed with integer math, so the terrain stays crisp no matter how far you walk.
- **`src/world.ts`** — a bit-exact CPU mirror of the shader's integer hash and noise. It drives collisions (deep water is impassable, shallows/marsh/snow slow you down), biome detection, relic and landmark placement, and the fog-of-war minimap.
- **`src/main.ts`** — WebGPU setup, game loop, input, HUD and minimap. Exposes `window.advanceTime(ms)` and `window.render_game_to_text()` for automated testing.
- **`server.ts`** — `Bun.serve` with an HTML import, so Bun bundles the TypeScript and WGSL on the fly.

## Requirements

A browser with WebGPU: recent Chrome / Edge, or Safari 26+. Firefox works where WebGPU is enabled.
