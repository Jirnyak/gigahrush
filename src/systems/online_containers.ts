/* ── Online container sync (host-authoritative, inventory-copy model) ──
 *
 * A container is just an inventory. Peers never generate, register or mutate a
 * host-world container — that relied on a floor seed which is NOT deterministic
 * in practice, and registering a peer-side container spawned a phantom mesh over
 * the underlying feature. Instead the flow mirrors how the peer's own inventory
 * already works:
 *
 *   1. Peer presses E → host runs the interaction virtually against the peer
 *      actor, resolving (or lazily generating) the container authoritatively.
 *   2. Host sends the container's inventory to the peer as a transient COPY.
 *   3. Peer renders a menu backed by that copy (held only in `containerById`
 *      under a fixed synthetic id, so it never enters `containerMap`/`containers`
 *      and therefore never draws a world mesh).
 *   4. Take/put/close are requests to the host; the host runs the real
 *      `takeFromContainer`/`putIntoContainer` and echoes fresh contents. Peer
 *      inventory reconciles through the existing `entity_sync` path.
 *   5. On close both sides destroy the copy. */

import { W, type Item, type WorldContainer } from '../core/types';
import { World } from '../core/world';
import { resolveOrCreateFeatureLootContainer } from './interactive';
import type { ContainerAccess, ContainerKind } from '../core/types';

export interface ContainerSyncPayload {
  cx: number;
  cy: number;
  id: number;
  kind: number;
  name: string;
  access: string;
  discovered: boolean;
  tags: string[];
  inventory: { defId: string; count: number; data?: unknown }[];
}

const MAX_SYNC_SLOTS = 64;

function packItems(inventory: readonly Item[] | undefined): ContainerSyncPayload['inventory'] {
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

function unpackItems(input: unknown): Item[] {
  const out: Item[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof (raw as Item).defId !== 'string') continue;
    const count = Math.max(0, Math.floor((raw as Item).count ?? 0));
    if (count <= 0) continue;
    const data = (raw as Item).data;
    out.push(data !== undefined ? { defId: (raw as Item).defId, count, data } : { defId: (raw as Item).defId, count });
    if (out.length >= MAX_SYNC_SLOTS) break;
  }
  return out;
}

/** Host: serialize one container's contents for a `container_open`/`container_sync`. */
export function containerSyncPayload(container: WorldContainer): ContainerSyncPayload {
  return {
    cx: container.x,
    cy: container.y,
    id: container.id,
    kind: container.kind,
    name: container.name,
    access: container.access,
    discovered: container.discovered === true,
    tags: Array.isArray(container.tags) ? container.tags.slice(0, 16) : [],
    inventory: packItems(container.inventory),
  };
}

/** Host: resolve the container a peer is trying to open/search at a cell — an
 *  existing visible container, or a lazily-generated feature-loot container when
 *  the cell holds a searchable decor feature. Authoritative: the host is the
 *  only side that ever generates, so floor-seed determinism is irrelevant. */
export function resolvePeerContainerAtCell(
  world: World,
  z: number,
  cx: number,
  cy: number,
): WorldContainer | null {
  const x = ((Math.floor(cx) % W) + W) % W;
  const y = ((Math.floor(cy) % W) + W) % W;
  const at = world.containersAt(x, y);
  const visible = at.find(c => c.discovered || c.access !== 'secret');
  if (visible) return visible;
  const secret = at.find(c => c.access === 'secret');
  if (secret) { secret.discovered = true; return secret; }
  return resolveOrCreateFeatureLootContainer(world, z, world.idx(x, y));
}

/** Peer: build the transient menu-backing container copy from a host payload.
 *  Assigned a caller-provided synthetic id and stored ONLY in `containerById`
 *  (never `containerMap`/`containers`), so it renders in the menu but spawns no
 *  world mesh and collides with nothing. */
export function buildRemoteContainer(world: World, payload: ContainerSyncPayload, syntheticId: number): WorldContainer {
  const x = ((Math.floor(payload.cx) % W) + W) % W;
  const y = ((Math.floor(payload.cy) % W) + W) % W;
  return {
    id: syntheticId,
    x, y,
    z: world.containers[0]?.z ?? (0),
    roomId: -1,
    zoneId: 0,
    kind: payload.kind as ContainerKind,
    name: typeof payload.name === 'string' ? payload.name : 'контейнер',
    inventory: unpackItems(payload.inventory),
    access: (payload.access as ContainerAccess) ?? 'public',
    discovered: true,
    tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 16) : [],
  };
}
