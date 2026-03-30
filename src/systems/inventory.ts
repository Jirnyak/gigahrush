/* ── Inventory system: items, pickup, use ─────────────────────── */

import {
  type Entity, type Msg, ItemType,
  EntityType,
} from '../core/types';
import { ITEMS, WEAPON_STATS, type WeaponStats } from '../data/catalog';
import { World } from '../core/world';
import { playPickup } from './audio';

const MAX_SLOTS = 25;

/* ── Add item to entity inventory ─────────────────────────────── */
export function addItem(e: Entity, defId: string, count = 1): boolean {
  if (!e.inventory) e.inventory = [];
  const def = ITEMS[defId];
  if (!def) return false;

  // Try stacking
  for (const slot of e.inventory) {
    if (slot.defId === defId && slot.count < def.stack) {
      const add = Math.min(count, def.stack - slot.count);
      slot.count += add;
      count -= add;
      if (count <= 0) return true;
    }
  }

  // New slot — init durability for melee weapons
  while (count > 0 && e.inventory.length < MAX_SLOTS) {
    const add = Math.min(count, def.stack);
    const ws = WEAPON_STATS[defId];
    let data: { dur: number } | undefined;
    if (ws && !ws.isRanged && ws.durability > 0) data = { dur: ws.durability };
    else if (def.durability && def.durability > 0) data = { dur: def.durability };
    e.inventory.push({ defId, count: add, data });
    count -= add;
  }

  return count <= 0;
}

/* ── Remove item from inventory ───────────────────────────────── */
export function removeItem(e: Entity, defId: string, count = 1): boolean {
  if (!e.inventory) return false;
  for (let i = e.inventory.length - 1; i >= 0; i--) {
    const slot = e.inventory[i];
    if (slot.defId === defId) {
      const rem = Math.min(count, slot.count);
      slot.count -= rem;
      count -= rem;
      if (slot.count <= 0) e.inventory.splice(i, 1);
      if (count <= 0) return true;
    }
  }
  return count <= 0;
}

/* ── Check if entity has item ─────────────────────────────────── */
export function hasItem(e: Entity, defId: string): boolean {
  return (e.inventory ?? []).some(i => i.defId === defId);
}

/* ── Use selected item ────────────────────────────────────────── */
export function useItem(e: Entity, slotIdx: number, msgs: Msg[], time: number): void {
  if (!e.inventory || slotIdx >= e.inventory.length) return;
  const slot = e.inventory[slotIdx];
  const def = ITEMS[slot.defId];
  if (!def) return;

  // Weapons: equip
  if (def.type === ItemType.WEAPON) {
    e.weapon = def.id;
    msgs.push({ text: `Экипировано: ${def.name}`, time, color: '#ccc' });
    return;
  }

  // Tools: equip to utility slot
  if (def.type === ItemType.TOOL) {
    e.tool = def.id;
    msgs.push({ text: `Инструмент: ${def.name}`, time, color: '#8cf' });
    return;
  }

  // Usable items
  if (def.use) {
    const msg = def.use(e);
    msgs.push({ text: msg, time, color: '#6a6' });
    slot.count--;
    if (slot.count <= 0) e.inventory.splice(slotIdx, 1);
    return;
  }

  // Notes
  if (def.type === ItemType.NOTE && slot.data) {
    msgs.push({ text: String(slot.data), time, color: '#aa8' });
    return;
  }
}

/* ── Drop item from inventory onto the ground ─────────────────── */
export function dropItem(
  player: Entity, slotIdx: number, entities: Entity[],
  msgs: Msg[], time: number, nextId: { v: number },
): void {
  if (!player.inventory || slotIdx >= player.inventory.length) return;
  const slot = player.inventory[slotIdx];
  const def = ITEMS[slot.defId];
  if (!def) return;

  // Place drop 3 cells in front of player (far enough to avoid auto-pickup)
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  const dropX = player.x + dx * 3.0;
  const dropY = player.y + dy * 3.0;

  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: dropX, y: dropY, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
    inventory: [{ defId: slot.defId, count: 1, data: slot.data }],
  });

  // If dropping equipped weapon, unequip
  if (def.type === ItemType.WEAPON && player.weapon === def.id) {
    // Check if there's another copy left after removing one
    const remaining = slot.count - 1;
    if (remaining <= 0) player.weapon = '';
  }
  if (def.type === ItemType.TOOL && player.tool === def.id) {
    const remaining = slot.count - 1;
    if (remaining <= 0) player.tool = '';
  }

  slot.count--;
  if (slot.count <= 0) player.inventory.splice(slotIdx, 1);

  msgs.push({ text: `Выброшено: ${def.name}`, time, color: '#aa6' });
}

/* ── Pickup nearby item drops ─────────────────────────────────── */
export function pickupNearby(world: World, entities: Entity[], player: Entity, msgs: Msg[], time: number): void {
  for (let i = entities.length - 1; i >= 0; i--) {
    const drop = entities[i];
    if (drop.type !== EntityType.ITEM_DROP || !drop.alive) continue;
    if (world.dist(player.x, player.y, drop.x, drop.y) > 1.5) continue;

    const inv = drop.inventory;
    if (!inv || inv.length === 0) continue;

    let pickedAny = false;
    for (const item of inv) {
      if (addItem(player, item.defId, item.count)) {
        const def = ITEMS[item.defId];
        msgs.push({ text: `Подобрано: ${def?.name ?? item.defId}`, time, color: '#dd4' });
        pickedAny = true;
      }
    }

    if (pickedAny) {
      drop.alive = false;
      playPickup();
    }
  }
}

/* ── Get full weapon stats ────────────────────────────────────── */
export function getWeaponStats(e: Entity): WeaponStats {
  return WEAPON_STATS[e.weapon ?? ''] ?? WEAPON_STATS[''];
}

/* ── Get current durability of equipped melee weapon ──────────── */
export function getEquippedDurability(e: Entity): { cur: number; max: number } | null {
  const ws = WEAPON_STATS[e.weapon ?? ''];
  if (!ws || ws.isRanged || ws.durability <= 0) return null;
  const slot = (e.inventory ?? []).find(s => s.defId === e.weapon);
  if (!slot) return null;
  const d = slot.data as { dur?: number } | undefined;
  return { cur: d?.dur ?? ws.durability, max: ws.durability };
}

/* ── Contextual weapon break exclamations ─────────────────────── */
const BREAK_EXCLAIM = [
  'Бля!', 'Блин!', 'Пацаны!', 'Плохо дело!', 'Вот чёрт!',
  'Да ну нах!', 'Твою мать!', 'Ну всё!', 'Капец!', 'Ёпта!',
  'Мда уж...', 'Ай!', 'Ну отлично!', 'Вот блин!', 'Ну ёлки!',
];
const BREAK_EXCLAIM_F = [
  'Блин!', 'Ой!', 'Ну нет!', 'Ужас!', 'Вот чёрт!',
  'Плохо дело!', 'Капец!', 'Ну отлично!', 'Батюшки!', 'Кошмар!',
];

/* ── Consume durability on melee hit. Returns true if weapon broke */
export function consumeDurability(e: Entity, msgs: Msg[], time: number): boolean {
  const ws = WEAPON_STATS[e.weapon ?? ''];
  if (!ws || ws.isRanged || ws.durability <= 0) return false;
  const inv = e.inventory ?? [];
  const idx = inv.findIndex(s => s.defId === e.weapon);
  if (idx < 0) return false;
  const slot = inv[idx];
  const d = (slot.data ?? { dur: ws.durability }) as { dur: number };
  d.dur--;
  slot.data = d;
  if (d.dur <= 0) {
    const name = ITEMS[slot.defId]?.name ?? slot.defId;
    inv.splice(idx, 1);
    e.weapon = '';
    if (e.type === EntityType.NPC && e.name) {
      const pool = e.isFemale ? BREAK_EXCLAIM_F : BREAK_EXCLAIM;
      const excl = pool[Math.floor(Math.random() * pool.length)];
      msgs.push({ text: `${e.name}: ${excl} ${name} ${e.isFemale ? 'сломалась' : 'сломался'}!`, time, color: '#f84' });
    } else {
      msgs.push({ text: `${name} сломался!`, time, color: '#f84' });
    }
    return true;
  }
  return false;
}

/* ── Get current durability of equipped tool ──────────────────── */
export function getEquippedToolDurability(e: Entity): { cur: number; max: number } | null {
  const toolId = e.tool ?? '';
  if (!toolId) return null;
  const def = ITEMS[toolId];
  if (!def || def.type !== ItemType.TOOL || !def.durability || def.durability <= 0) return null;
  const slot = (e.inventory ?? []).find(s => s.defId === toolId);
  if (!slot) return null;
  const d = slot.data as { dur?: number } | undefined;
  return { cur: d?.dur ?? def.durability, max: def.durability };
}

/* ── Consume durability on equipped tool use ──────────────────── */
export function consumeToolDurability(e: Entity, amount: number, msgs: Msg[], time: number): boolean {
  if (amount <= 0) return false;
  const toolId = e.tool ?? '';
  if (!toolId) return false;
  const def = ITEMS[toolId];
  if (!def || def.type !== ItemType.TOOL || !def.durability || def.durability <= 0) return false;
  const inv = e.inventory ?? [];
  const idx = inv.findIndex(s => s.defId === toolId);
  if (idx < 0) { e.tool = ''; return false; }
  const slot = inv[idx];
  const d = (slot.data ?? { dur: def.durability }) as { dur: number };
  d.dur -= amount;
  slot.data = d;
  if (d.dur <= 0) {
    const name = ITEMS[slot.defId]?.name ?? slot.defId;
    inv.splice(idx, 1);
    e.tool = '';
    msgs.push({ text: `${name} изношен и сломан!`, time, color: '#f84' });
    return true;
  }
  return false;
}

/* ── Consume ammo for ranged weapon. Returns true if ammo available */
export function consumeAmmo(e: Entity): boolean {
  const ws = WEAPON_STATS[e.weapon ?? ''];
  if (!ws || !ws.isRanged || !ws.ammoType) return false;
  return removeItem(e, ws.ammoType, 1);
}

/* ── Count ammo for current ranged weapon ─────────────────────── */
export function countAmmo(e: Entity): number {
  const ws = WEAPON_STATS[e.weapon ?? ''];
  if (!ws || !ws.isRanged || !ws.ammoType) return 0;
  let total = 0;
  for (const slot of e.inventory ?? []) {
    if (slot.defId === ws.ammoType) total += slot.count;
  }
  return total;
}
