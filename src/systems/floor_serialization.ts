/* ── Network floor checkpoint serialization ───────────────────────
 *
 * One-shot full-floor snapshot for the online host→peer join handshake.
 *
 * Instead of asking the peer to re-run `generateFloor(seed)` (which desyncs
 * the moment the host mutates cells, doors, containers, loot or route lifts),
 * the host packs its live `World` + entities into a compact payload and the
 * peer restores it verbatim. This kills every geometry/mutation desync class
 * at the cost of a single larger message at connect time — acceptable because
 * the join is one-off and Cloudflare peer↔host is the real bottleneck.
 *
 * Compression is fully reused from `floor_memory.ts`: `worldForSave` RLE-packs
 * the twelve 1024×1024 typed arrays into base64 run-length strings, and
 * `worldFromSave` rebuilds a fresh `World` with dirty flags + path blockers
 * already restored. This module only adds the network envelope, entity packing
 * and transport-level chunking. Zero runtime dependencies. */

import { EntityType, W, type Entity, type } from '../core/types';
import { World } from '../core/world';
import { safeParseJson } from '../core/json';
import { worldForSave, worldFromSave } from './floor_memory';

// Version-gate so a peer on an older build rejects a mismatched envelope
// instead of restoring garbage geometry.
export const FLOOR_SNAPSHOT_VERSION = 1 as const;

type PackedWorld = ReturnType<typeof worldForSave>;

export interface FloorSnapshotMeta {
  z: number;
  runSeed: number;
  floorKey?: string;
  spawnX: number;
  spawnY: number;
  samosborCount: number;
  gameTime: number;
  /** Host's `nextEntityId.v` so the peer never mints a colliding local id. */
  nextEntityId: number;
}

export interface FloorSnapshot extends FloorSnapshotMeta {
  v: typeof FLOOR_SNAPSHOT_VERSION;
  world: PackedWorld;
  entities: Entity[];
}

export interface UnpackedFloor {
  world: World;
  entities: Entity[];
  meta: FloorSnapshotMeta;
}

// Cap runaway payloads: a hostile/corrupt host cannot make the peer allocate
// an unbounded entity array.
const MAX_SNAPSHOT_ENTITIES = 4096;

/** True for entities that belong in a join checkpoint: the host's live world
 *  actors (NPCs, monsters, drops, the host player body) — but never in-flight
 *  projectiles (discarded per online.md handoff rules) and never remote peer
 *  actors, which each peer owns and re-materializes locally. */
export function snapshotEntity(entity: Entity): boolean {
  if (entity.type === EntityType.PROJECTILE) return false;
  if (entity.peerSlot !== undefined) return false;
  return true;
}

// ── Host side: pack ───────────────────────────────────────────────

export function packFloorForNetwork(
  world: World,
  entities: readonly Entity[],
  meta: FloorSnapshotMeta,
): FloorSnapshot {
  const packedEntities: Entity[] = [];
  for (const e of entities) {
    if (!snapshotEntity(e)) continue;
    packedEntities.push(e);
    if (packedEntities.length >= MAX_SNAPSHOT_ENTITIES) break;
  }
  return {
    v: FLOOR_SNAPSHOT_VERSION,
    z: meta.z,
    runSeed: meta.runSeed,
    floorKey: meta.floorKey,
    spawnX: meta.spawnX,
    spawnY: meta.spawnY,
    samosborCount: meta.samosborCount,
    gameTime: meta.gameTime,
    nextEntityId: meta.nextEntityId,
    world: worldForSave(world),
    entities: packedEntities,
  };
}

/** Serialize to a JSON string ready for chunked transport. Entities are plain
 *  data objects (same contract `floor_memory` relies on for its JSON save), so
 *  a straight stringify is safe and keeps the payload human-debuggable. */
export function serializeFloorSnapshot(snapshot: FloorSnapshot): string {
  return JSON.stringify(snapshot);
}

// ── Peer side: unpack ─────────────────────────────────────────────

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function wrapCoord(value: unknown): number {
  const n = finiteNumber(value, W / 2);
  return ((n % W) + W) % W;
}

function knownEntityType(value: unknown): value is EntityType {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= EntityType.NPC
    && value <= EntityType.BILLBOARD;
}

/** Light sanitize of a restored entity: guarantee a finite id/type and
 *  in-bounds wrapped coordinates. This is a relaxed-trust co-op restore, not
 *  an untrusted save, so we keep every gameplay field the host sent rather than
 *  whitelisting — but never let NaN coords poison the renderer or physics. */
function sanitizeSnapshotEntity(raw: unknown): Entity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Entity;
  if (typeof e.id !== 'number' || !Number.isFinite(e.id)) return null;
  if (!knownEntityType(e.type)) return null;
  if (!snapshotEntity(e)) return null;
  e.id = Math.floor(e.id);
  e.x = wrapCoord(e.x);
  e.y = wrapCoord(e.y);
  e.angle = finiteNumber(e.angle, 0);
  e.pitch = finiteNumber(e.pitch, 0);
  e.speed = finiteNumber(e.speed, 0);
  if (typeof e.alive !== 'boolean') e.alive = true;
  return e;
}

function restoreSnapshotEntities(input: unknown): Entity[] {
  if (!Array.isArray(input)) return [];
  const out: Entity[] = [];
  for (const raw of input) {
    const sanitized = sanitizeSnapshotEntity(raw);
    if (sanitized) out.push(sanitized);
    if (out.length >= MAX_SNAPSHOT_ENTITIES) break;
  }
  return out;
}

/** Parse + validate a serialized snapshot. Returns null on any version or
 *  shape mismatch so the peer can fail the join cleanly instead of desyncing. */
export function deserializeFloorSnapshot(text: string): FloorSnapshot | null {
  let parsed: unknown;
  try {
    parsed = safeParseJson(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const snap = parsed as Partial<FloorSnapshot>;
  if (snap.v !== FLOOR_SNAPSHOT_VERSION) return null;
  if (!snap.world || typeof snap.world !== 'object') return null;
  return parsed as FloorSnapshot;
}

/** Peer side: rebuild a live `World` + entities from a snapshot. The returned
 *  `world` already has render dirty flags bumped and path blockers rebuilt by
 *  `worldFromSave`; the caller still re-stamps derived, non-serialized layers
 *  (fast elevators, visual slots, ceiling heights) that generation owns. */
export function unpackFloorFromNetwork(snapshot: FloorSnapshot): UnpackedFloor | null {
  const world = worldFromSave(snapshot.world, snapshot.spawnX, snapshot.spawnY);
  if (!world) return null;
  return {
    world,
    entities: restoreSnapshotEntities(snapshot.entities),
    meta: {
      z: snapshot.z,
      runSeed: finiteNumber(snapshot.runSeed, 0),
      floorKey: typeof snapshot.floorKey === 'string' ? snapshot.floorKey : undefined,
      spawnX: finiteNumber(snapshot.spawnX, W / 2),
      spawnY: finiteNumber(snapshot.spawnY, W / 2),
      samosborCount: Math.max(0, Math.floor(finiteNumber(snapshot.samosborCount, 0))),
      gameTime: finiteNumber(snapshot.gameTime, 0),
      nextEntityId: Math.max(0, Math.floor(finiteNumber(snapshot.nextEntityId, 0))),
    },
  };
}

// ── Transport chunking ────────────────────────────────────────────
//
// Cloudflare's Durable Object WebSocket relays a single JSON frame; very large
// frames risk rejection, so the host splits the serialized snapshot into
// fixed-size string chunks and the peer reassembles them in order. The default
// keeps each relayed frame comfortably under the ~1 MiB WS limit.

export const FLOOR_SNAPSHOT_CHUNK_CHARS = 48 * 1024;

export function chunkFloorSnapshot(serialized: string, chunkChars = FLOOR_SNAPSHOT_CHUNK_CHARS): string[] {
  const size = Math.max(1, Math.floor(chunkChars));
  const out: string[] = [];
  for (let i = 0; i < serialized.length; i += size) {
    out.push(serialized.slice(i, i + size));
  }
  // A zero-length payload still needs one (empty) chunk so the peer's reassembly
  // completion check (received === total) can fire.
  if (out.length === 0) out.push('');
  return out;
}

/** Reassemble ordered chunks; returns null until every chunk is present. */
export function reassembleFloorSnapshot(chunks: (string | undefined)[], total: number): string | null {
  if (chunks.length < total) return null;
  let combined = '';
  for (let i = 0; i < total; i++) {
    const part = chunks[i];
    if (part === undefined) return null;
    combined += part;
  }
  return combined;
}
