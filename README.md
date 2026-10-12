# Maple Wayfarer

A fan-made MapleStory-style side-scrolling platformer built with **Bun** and **WebGPU**.

- WebGPU instanced sprite renderer (`src/gpu.ts`)
- Real MapleStory maps, parallax backgrounds, footholds, ladders and ropes, read from map data
- Orange Mushrooms, Green Mushrooms and Slimes with AI, hit/die animations and respawns
- Basic attack, Slash Blast, damage numbers, EXP and leveling, meso drops, potions
- HUD built from the v270 (latest GMS) `StatusBar3` UI sprites: HP/MP status, full-width EXP bar, menu buttons, quick slots, chat, and minimap
- Three linked maps: The Hill North of Henesys ↔ Spore Hill ↔ Shining Forest Path

## Run

```bash
bun install
bun run dev        # http://localhost:3000 (needs a WebGPU browser: Chrome/Edge 113+, Safari 26+)
bun run build      # static build in dist/
bun run fetch-data # regenerate public/data metadata from maplestory.io
```

## Controls

| Key | Action |
| --- | --- |
| ← → | Move |
| Alt / C / Space | Jump |
| ↓ + Jump | Drop through a platform |
| ↑ / ↓ | Climb ladders and ropes, enter portals, go prone |
| Ctrl / X | Attack |
| Shift / A | Slash Blast (8 MP) |
| Z | Loot mesos |
| 1 / Delete | Red potion |
| 2 / End | Blue potion |
| Enter | Chat |

## Assets and legal notice

This project is not affiliated with or endorsed by NEXON. All MapleStory art, audio and data belong to NEXON. They are served by [maplestory.io](https://maplestory.io) and are **loaded at runtime (hotlinked), never stored in this repository**. `public/data` holds only coordinates and URLs. Keep this project private and non-commercial.
