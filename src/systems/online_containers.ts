/* ── Online container sync (host-authoritative) ───────────────────
 *
 * Peers never mutate host-world containers directly. They send cell-keyed
 * open/take/put requests; the host runs the real `takeFromContainer` /
 * `putIntoContainer` against the peer actor (so every theft/karma/purchase/
 * event side effect stays host-owned) and echoes the authoritative container
 * contents back with `applyContainerSyncPayload`. Peer inventory reconciles
 * through the existing `entity_sync` + generation-counter path, exactly like
 * item pickup already does.
 *
 * Container identity on the wire is the cell (cx, cy), NOT the local id: a
 * feature-loot container searched independently on host and peer gets different
 * numeric ids but always occupies the same cell, and static snapshot containers
 * share their cell too. Cell-keyed sync makes both cases converge. */

import { W, type Item, type WorldContainer } from '../core/types';
import { World } from '../core/world';
import { resolveOrCreateFeatureLootContainer } from './interactive';
import type { ContainerAccess, ContainerKind, FloorLevel } from '../core/types';

export interface ContainerSyncPayload {
  cx: number;
  cy: number;
  id: number;
  kind: number;
  name: string;
  access: string;
  discovered: boolean;
  inventory: { defId: string; count: number; data?: unknown }[];
}

const MAX_SYNC_SLOTS = 64;

function cellItems(inventory: readonly Item[] | undefined): ContainerSyncPayload['inventory'] {
  const out: ContainerSyncPayload['inventory'] = [];
  if (!inventory) return out;
  for (const it of inventory) {
    if (!it || typeof it.defId !== 'string') continue;
    const count = Math.max(0, Math.floor(it.count ?? 0));
    if (count <= 0) continue;
    out.push(it.data !== undefined ? { defId: it.defId, count, data: it.data } : { defId: it.defId, count });
    if (out.length >= MAX_SYNC_SLOTS) break;
  }
  return out;
}

/** Serialize one container's networked state for a `container_sync` message. */
export function containerSyncPayload(container: WorldContainer): ContainerSyncPayload {
  return {
    cx: container.x,
    cy: container.y,
    id: container.id,
    kind: container.kind,
    name: container.name,
    access: container.access,
    discovered: container.discovered === true,
    inventory: cellItems(container.inventory),
  };
}

/** Host side: resolve the container a peer is acting on at a given cell,
 *  lazily generating a feature-loot container (search) if the cell holds a
 *  searchable decor feature and none exists yet. Returns null when the cell has
 *  no visible/generatable container. */
export function resolvePeerContainerAtCell(
  world: World,
  floor: FloorLevel,
  cx: number,
  cy: number,
): WorldContainer | null {
  const x = ((Math.floor(cx) % W) + W) % W;
  const y = ((Math.floor(cy) % W) + W) % W;
  const existing = world.containersAt(x, y).find(c => c.discovered || c.access !== 'secret');
  if (existing) {
    if (existing.access === 'secret') existing.discovered = true;
    return existing;
  }
  const secret = world.containersAt(x, y).find(c => c.access === 'secret');
  if (secret) { secret.discovered = true; return secret; }
  // No container yet — try lazy feature-loot generation (the "обыскать" path).
  return resolveOrCreateFeatureLootContainer(world, floor, world.idx(x, y));
}

/** Peer side: upsert the authoritative container contents by cell. Matches an
 *  existing local container at that cell (snapshot or peer-generated) and
 *  overwrites its mutable state; if the peer has none there yet, registers a
 *  minimal one so the open menu can render host truth immediately. */
export function applyContainerSyncPayload(world: World, payload: ContainerSyncPayload): WorldContainer | null {
  if (!payload || typeof payload.cx !== 'number' || typeof payload.cy !== 'number') return null;
  const x = ((Math.floor(payload.cx) % W) + W) % W;
  const y = ((Math.floor(payload.cy) % W) + W) % W;
  const inventory: Item[] = [];
  for (const raw of Array.isArray(payload.inventory) ? payload.inventory : []) {
    if (!raw || typeof raw.defId !== 'string') continue;
    const count = Math.max(0, Math.floor(raw.count ?? 0));
    if (count <= 0) continue;
    inventory.push(raw.data !== undefined ? { defId: raw.defId, count, data: raw.data } : { defId: raw.defId, count });
    if (inventory.length >= MAX_SYNC_SLOTS) break;
  }

  const local = world.containersAt(x, y)[0];
  if (local) {
    local.inventory = inventory;
    local.discovered = payload.discovered === true || local.discovered;
    return local;
  }

  // Peer hasn't materialized this container locally — register a minimal record
  // so the menu (keyed by id) can show host truth. Geometry/type come from the
  // host payload; the peer only ever reads it.
  const container: WorldContainer = {
    id: payload.id,
    x, y,
    floor: world.containers[0]?.floor ?? (0 as FloorLevel),
    roomId: world.roomMap[world.idx(x, y)] ?? -1,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind: payload.kind as ContainerKind,
    name: typeof payload.name === 'string' ? payload.name : 'контейнер',
    inventory,
    access: (payload.access as ContainerAccess) ?? 'public',
    discovered: payload.discovered === true,
    tags: [],
  };
  world.addContainer(container);
  return container;
}
