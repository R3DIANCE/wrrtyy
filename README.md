# Maple Wayfarer

A fan-made MapleStory-style side-scrolling platformer built with **Bun** and **WebGPU**.

**Play it live: [msio.pplx.app](https://msio.pplx.app)**

- WebGPU instanced sprite renderer (`src/gpu.ts`)
- Real MapleStory maps, parallax backgrounds, footholds, ladders and ropes, read from map data
- Orange Mushrooms, Green Mushrooms and Slimes with AI, hit/die animations and respawns
- 13 real skills across Beginner / Warrior / Fighter / Crusader tabs (Slash Blast, Brandish, Intrepid Slash, Three Snails, War Leap, Spirit Blade, Recovery, Nimble Feet, plus passives), learned with SP
- Base stats (STR/DEX/INT/LUK) with Ability Points, damage range, mastery and accuracy
- Real v270 Character Stats and Skill windows, item inventory, buff bar with timers, tooltips
- Quick slots: drag skills/items in, drag between slots to swap, drag off or right-click to remove
- Auto Battle, Auto HP/MP potions (adjustable thresholds), Auto Buff, Auto Loot, Auto Stats
- Chat balloons using the real ChatBalloon sprites
- Progress saved in the browser (localStorage)
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
| Alt / C / Space | Jump (press again in the air for War Leap) |
| ↓ + Jump | Drop through a platform |
| ↑ / ↓ | Climb ladders and ropes, enter portals, go prone |
| Ctrl / X | Basic attack |
| Shift, Ins, Home, PgUp, 1–0, -, =, Del, End, PgDn, F1–F12 | Quick slots (defaults: Shift Slash Blast, Del/End/PgDn potions, 1–3 buffs) |
| Z | Loot |
| S / K / I | Character stats / Skills / Items |
| B | Toggle Auto Battle (right-click the AUTO button for settings) |
| Enter | Chat (shows a chat balloon) |
| Esc | Close the top window |

## Assets and legal notice

This project is not affiliated with or endorsed by NEXON. All MapleStory art, audio and data belong to NEXON. They are served by [maplestory.io](https://maplestory.io) and are **loaded at runtime (hotlinked), never stored in this repository**. `public/data` holds only coordinates and URLs. Keep this project private and non-commercial.
