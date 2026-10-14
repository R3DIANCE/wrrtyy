// Authentic 1:1 MapleStory Tooltip Generator (Image 2 standard)
import { GEAR, MATS, RARITY, RARITY_COLOR, SLOT_NAME, gearIcon, gearStats, gearValue, type Gear, type GearBase, type Slot } from "./items.ts";
import { ITEMS, itemIcon } from "./skills.ts";
import { esc, fmt } from "./util.ts";

/** Renders a 25-star row with 5-star groups matching MapleStory */
function renderStarsRow(stars: number, maxStars = 25): string {
  if (stars <= 0) return "";
  let html = `<div class="tt-stars-row">`;
  for (let i = 0; i < maxStars; i++) {
    if (i > 0 && i % 5 === 0) html += `<span class="tt-star-gap"></span>`;
    const filled = i < stars;
    html += `<span class="tt-star ${filled ? "filled" : "empty"}">★</span>`;
  }
  html += `</div>`;
  return html;
}

/** Formats a gear stat row with base and bonus (yellow) */
function statRow(label: string, total: number, base: number, bonus = 0): string {
  if (!total) return "";
  const bonusStr = bonus > 0 ? ` <span class="tt-bonus">(${base} +${bonus})</span>` : "";
  return `<div class="tt-stat-line"><span>${label}</span> <b>+${total}${bonusStr}</b></div>`;
}

/** Tooltip for an owned / equipped Gear instance */
export function renderGearTooltip(g: Gear, isEquipped = false, note = "", playerLevel = 200): string {
  const b = GEAR.get(g.id);
  if (!b) return "";
  const st = gearStats(g);
  const rarityName = RARITY[g.rarity] ?? "Normal";
  const rarityColor = RARITY_COLOR[g.rarity] ?? "#ffffff";
  const slotName = SLOT_NAME[b.slot as Slot] ?? b.slot;
  const isAcc = ["ring", "ring1", "ring2", "ring3", "ring4", "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge"].includes(b.slot);
  const catLabel = isAcc ? "Accessory" : b.slot === "weapon" ? "Weapon" : "Armor";

  // Stars
  const starsHtml = renderStarsRow(g.star);

  // Stats lines with bonus calculation from starforce
  const starMultiplier = g.star * 2;
  const statsHtml = [
    statRow("STR", st.str, b.str, st.str - b.str),
    statRow("DEX", st.dex, b.dex, st.dex - b.dex),
    statRow("INT", st.int, b.int, st.int - b.int),
    statRow("LUK", st.luk, b.luk, st.luk - b.luk),
    statRow("Max HP", st.hp, b.hp, st.hp - b.hp),
    statRow("Attack Power", st.watk, b.watk, st.watk - b.watk),
    statRow("Defense", st.def, b.def, st.def - b.def),
  ].filter(Boolean).join("");

  // Potential lines
  let potHtml = "";
  if (g.pot && g.pot.length > 0) {
    const potHead = `<div class="tt-pot-head" style="color:${rarityColor}"><span class="tt-pot-box" style="background:${rarityColor}"></span> Potential : ${rarityName}</div>`;
    const potLines = g.pot.map((p) => `<div class="tt-pot-line">▪ ${p.stat.toUpperCase()}: +${p.pct}%</div>`).join("");
    potHtml = `<div class="tt-divider"></div><div class="tt-pot-section">${potHead}${potLines}</div>`;
  }

  const reqMet = playerLevel >= b.req;

  return `
    <div class="ms-tooltip-card">
      ${starsHtml}
      <div class="tt-title" style="color:${g.rarity >= 2 ? rarityColor : '#ffffff'}">${esc(b.name)}${g.star ? ` (+${g.star})` : ""}</div>
      <div class="tt-trade">${b.cosmetic ? "Cosmetic / Cash Item" : "Untradable"}</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${gearIcon(g.id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">${isEquipped ? "Currently Equipped" : "Equipment Inventory"}</div>
          <div class="tt-tags">
            <span class="tt-tag">${catLabel}</span>
            <span class="tt-tag">${slotName}</span>
          </div>
        </div>
      </div>
      <div class="tt-req-row">
        <div class="tt-req-item"><span>Required Job</span> <b>Shared</b></div>
        <div class="tt-req-item"><span>Required Level</span> <b class="${reqMet ? "tt-good" : "tt-bad"}">Lv. ${b.req}</b></div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">${statsHtml}</div>
      ${potHtml}
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-value">Estimated Value ≈ ${fmt(gearValue(g))} mesos</div>
        ${note ? `<div class="tt-note">${note}</div>` : ""}
      </div>
    </div>
  `;
}

/** Tooltip for an uninstantiated GearBase (e.g. All Items browser) */
export function renderBaseGearTooltip(b: GearBase, note = "Click to claim into inventory", playerLevel = 200): string {
  const slotName = SLOT_NAME[b.slot as Slot] ?? b.slot;
  const isAcc = ["ring", "ring1", "ring2", "ring3", "ring4", "earrings", "pendant", "shoulder", "belt", "pocket", "emblem", "badge"].includes(b.slot);
  const catLabel = isAcc ? "Accessory" : b.slot === "weapon" ? "Weapon" : "Armor";
  const reqMet = playerLevel >= b.req;

  const statsHtml = [
    statRow("STR", b.str, b.str),
    statRow("DEX", b.dex, b.dex),
    statRow("INT", b.int, b.int),
    statRow("LUK", b.luk, b.luk),
    statRow("Max HP", b.hp, b.hp),
    statRow("Attack Power", b.watk, b.watk),
    statRow("Defense", b.def, b.def),
  ].filter(Boolean).join("");

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(b.name)}</div>
      <div class="tt-trade">${b.cosmetic ? "Cosmetic Item" : "Base Equipment"}</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${gearIcon(b.id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">Maple Catalog</div>
          <div class="tt-tags">
            <span class="tt-tag">${catLabel}</span>
            <span class="tt-tag">${slotName}</span>
          </div>
        </div>
      </div>
      <div class="tt-req-row">
        <div class="tt-req-item"><span>Required Job</span> <b>Shared</b></div>
        <div class="tt-req-item"><span>Required Level</span> <b class="${reqMet ? "tt-good" : "tt-bad"}">Lv. ${b.req}</b></div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">${statsHtml || '<div class="tt-stat-line"><span>Status</span> <b>Cosmetic decoration</b></div>'}</div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-value">Base Price: ${fmt(b.price)} mesos</div>
        <div class="tt-note highlight">${note}</div>
      </div>
    </div>
  `;
}

/** Tooltip for Use / Consumable items */
export function renderUseTooltip(id: number, owned = 0, note = ""): string {
  const it = ITEMS[id];
  const name = it?.name ?? `Potion #${id}`;
  const recover = [it?.hp ? `Recovers ${it.hp} HP` : "", it?.mp ? `Recovers ${it.mp} MP` : ""].filter(Boolean).join(" · ");

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(name)}</div>
      <div class="tt-trade">Tradeable</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${itemIcon(id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">Consumable Potion</div>
          <div class="tt-tags">
            <span class="tt-tag">Use</span>
            <span class="tt-tag">Recovery</span>
          </div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">
        <div class="tt-stat-line"><span>Effect</span> <b>${recover || "Restores vitality"}</b></div>
        ${owned > 0 ? `<div class="tt-stat-line"><span>Owned Quantity</span> <b class="tt-good">${owned}</b></div>` : ""}
      </div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-note">${note || "Click to use · drag to quick slots"}</div>
      </div>
    </div>
  `;
}

/** Tooltip for Crafting Material items */
export function renderMatTooltip(id: number, owned = 0, note = ""): string {
  const name = MATS.get(id) ?? `Material #${id}`;

  return `
    <div class="ms-tooltip-card">
      <div class="tt-title">${esc(name)}</div>
      <div class="tt-trade">Tradeable</div>
      <div class="tt-divider"></div>
      <div class="tt-meta-row">
        <div class="tt-icon-box">
          <img src="${itemIcon(id)}" alt="" class="tt-icon" />
        </div>
        <div class="tt-meta-info">
          <div class="tt-combat-label">Crafting Component</div>
          <div class="tt-tags">
            <span class="tt-tag">Etc.</span>
            <span class="tt-tag">Crafting</span>
          </div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-stats">
        <div class="tt-stat-line"><span>Usage</span> <b>Star Force & Gear Crafting</b></div>
        ${owned > 0 ? `<div class="tt-stat-line"><span>Owned Quantity</span> <b class="tt-good">${owned}</b></div>` : ""}
      </div>
      <div class="tt-divider"></div>
      <div class="tt-footer-meta">
        <div class="tt-note">${note || "Craft at the Crafting panel (J)"}</div>
      </div>
    </div>
  `;
}
