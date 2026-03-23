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
    const data = (ws && !ws.isRanged && ws.durability > 0) ? { dur: ws.durability } : undefined;
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
    msgs.push({ text: `${name} сломался!`, time, color: '#f84' });
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
