# Maple Wayfarer

A fan-made MapleStory-style side-scrolling platformer built with **Bun** and **WebGPU**.

**Play it live: [msio.pplx.app](https://msio.pplx.app)**

- WebGPU instanced sprite renderer (`src/gpu.ts`)
- Real MapleStory maps, parallax backgrounds, footholds, ladders and ropes, read from map data
- Orange Mushrooms, Green Mushrooms and Slimes with AI, hit/die animations and respawns
- **4 playable classes**: Warrior (STR), Magician (INT), Bowman (DEX) and Thief (LUK) — pick your class on the title screen; each class has its own skill tabs, starting stats, first skill and default hotbar
- 33 real skills across all 4 classes with Beginner / 1st / 2nd / 3rd job tabs (Slash Blast, Brandish, Intrepid Slash, Magic Guard, Magic Claw, Energy Bolt, Flame Orb, Arrow Blow, Double Shot, Wind Arrow, Dark Sight, Haste, Shuriken Burst and more), learned with SP
- Base stats (STR/DEX/INT/LUK) with Ability Points, class-aware damage formula, damage range, mastery and accuracy
- Real v270 Character Stats and Skill windows, item inventory, buff bar with timers, tooltips
- Quick slots: drag skills/items in, drag between slots to swap, drag off or right-click to remove
- Auto Battle (**hotbar skills only** — the AI uses exactly the skills you assign to the quick slots, no more, no less), Auto HP/MP potions (adjustable thresholds), Auto Buff (hotbar-only), Auto Loot, Auto Stats (class-aware stat rotation)
- Chat balloons using the real ChatBalloon sprites
- **Idle progression:** endless stages (25 kills → stage boss), monsters scale every stage, and offline rewards (Auto Battle keeps hunting at 60% pace for up to 12 hours)
- **Bosses:** Mano, Stumpy, Mushmom, King Slime, Blue Mushmom, King Clang and Zombie Mushmom with real attack animations, a boss HP bar and a 2-minute timer; Auto Boss option
- **Gear:** real MapleStory equips across 19 modern equipment slots (weapon, hat, top, bottom, shoes, gloves, shield, cape, earrings, pendant, 4x ring, shoulder, belt, pocket, emblem, badge) on the real MapleStory UIWindow2 equip panel, Normal → Rare → Epic → Unique → Legendary potential, Combat Power, and equipped gear changes your character's look
- **Crafting:** gear recipes, ore refining, potion brewing, Star Force enhancement (up to ★15) and Cubes to reroll potential
- **Auction House:** simulated market with buy listings, deal indicators, selling with your own price, sales tax and listing fees, collected proceeds
- Monster material drops (caps, bubbles, shells, ores, boss spores) feed crafting and the market
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
| S / K / E / I | Character stats / Skills / Equipment / Inventory |
| J / H | Crafting / Auction House |
| B | Toggle Auto Battle (right-click the AUTO button for settings) |
| Enter | Chat (shows a chat balloon) |
| Esc | Close the top window |

## Assets and legal notice

This project is not affiliated with or endorsed by NEXON. All MapleStory art, audio and data belong to NEXON. They are served by [maplestory.io](https://maplestory.io) and are **loaded at runtime (hotlinked), never stored in this repository**. `public/data` holds only coordinates and URLs. Keep this project private and non-commercial.
