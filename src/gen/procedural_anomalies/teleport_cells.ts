/* ── Аномалия: пространственные разрывы ───────────────────────────
 *
 * Пары клеток, связанных переносом. Вырублена из общего файла процедурного
 * этажа по правилу `anomalies.md`: своя генерационная половина — свой файл.
 *
 * Фаза — `after_lifts`, и это не оформление, а условие: проверка просвета
 * (`nearLiftBackbone`) не видит шахту, которой ещё нет, поэтому до
 * `stampRouteLiftShafts` выход телепорта мог встать прямо на стволе лифта.
 * Прежде порядок держался лишь местом вызова в конвейере; теперь он объявлен.
 */

import {
  Cell,
  Feature,
  Tex,
  W,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import type { WalkablePlacementMap } from '../shared';
import type { ProceduralAnomalyGenContext } from './common';

const TELEPORT_ENDPOINT_LIFT_CLEARANCE = 10;
const TELEPORT_ENDPOINT_SPACING2 = 24 * 24;
const TELEPORT_PAIR_MIN_DIST2 = 180 * 180;

function nearLiftBackbone(world: World, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.LIFT || world.features[ci] === Feature.LIFT_BUTTON) return true;
    }
  }
  return false;
}

function farFromTeleportEndpoints(world: World, ci: number, used: ReadonlySet<number>, minDist2: number): boolean {
  const x = ci % W;
  const y = (ci / W) | 0;
  for (const other of used) {
    const ox = other % W;
    const oy = (other / W) | 0;
    if (world.dist2(x + 0.5, y + 0.5, ox + 0.5, oy + 0.5) < minDist2) return false;
  }
  return true;
}

function teleportEndpointCandidate(
  world: World,
  placement: WalkablePlacementMap,
  ci: number,
  used: ReadonlySet<number>,
): boolean {
  if (used.has(ci) || world.anomalyTeleports.has(ci) || !placement.reachable[ci]) return false;
  if (world.cells[ci] !== Cell.FLOOR) return false;
  if (world.features[ci] !== Feature.NONE) return false;
  if (world.aptMask[ci] || world.hermoWall[ci] || world.doors.has(ci) || world.containerMap.has(ci)) return false;
  const x = ci % W;
  const y = (ci / W) | 0;
  if (nearLiftBackbone(world, x, y, TELEPORT_ENDPOINT_LIFT_CLEARANCE)) return false;
  return farFromTeleportEndpoints(world, ci, used, TELEPORT_ENDPOINT_SPACING2);
}

function pickTeleportEndpoint(
  world: World,
  placement: WalkablePlacementMap,
  used: ReadonlySet<number>,
  centerX: number,
  centerY: number,
  minDist2: number,
): number {
  const candidates = placement.candidates;
  for (let attempt = 0; attempt < 384 && candidates.length > 0; attempt++) {
    const ci = candidates[Math.floor(rng() * candidates.length)];
    if (!teleportEndpointCandidate(world, placement, ci, used)) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    if (minDist2 > 0 && world.dist2(centerX, centerY, x + 0.5, y + 0.5) < minDist2) continue;
    return ci;
  }
  for (const ci of candidates) {
    if (!teleportEndpointCandidate(world, placement, ci, used)) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    if (minDist2 > 0 && world.dist2(centerX, centerY, x + 0.5, y + 0.5) < minDist2) continue;
    return ci;
  }
  return -1;
}

function markTeleportLight(world: World, x: number, y: number, used: ReadonlySet<number>, seed: number): void {
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ] as const;
  const start = Math.abs(seed) % offsets.length;
  for (let i = 0; i < offsets.length; i++) {
    const [dx, dy] = offsets[(start + i) % offsets.length];
    const ci = world.idx(x + dx, y + dy);
    if (used.has(ci)) continue;
    if (world.cells[ci] !== Cell.FLOOR || world.features[ci] !== Feature.NONE) continue;
    if (world.aptMask[ci] || world.hermoWall[ci] || world.doors.has(ci) || world.containerMap.has(ci)) continue;
    world.setFeatureAt(ci, Feature.LAMP, false);
    return;
  }
}

function markTeleportEndpoint(world: World, ci: number, seed: number, used: ReadonlySet<number>): void {
  const x = ci % W;
  const y = (ci / W) | 0;
  world.setFeatureAt(ci, Feature.SCREEN, false);
  world.floorTex[ci] = Tex.F_VOID;
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.78, 0.72, seed, 96, 190, 235, false);
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.44, 0.62, seed ^ 0x52a11, 190, 90, 235, false);
  markTeleportLight(world, x, y, used, seed);
}

export function applyTeleportCells(ctx: ProceduralAnomalyGenContext): void {
  const { world, spec, placement } = ctx;
  if (spec.anomalyId !== 'teleport_cells') return;
  const pairs = 4 + spec.danger;
  const used = new Set<number>();
  for (let i = 0; i < pairs; i++) {
    const ai = pickTeleportEndpoint(world, placement, used, W / 2 + 0.5, W / 2 + 0.5, 0);
    if (ai < 0) continue;
    used.add(ai);
    const ax = ai % W;
    const ay = (ai / W) | 0;
    const bi = pickTeleportEndpoint(world, placement, used, ax + 0.5, ay + 0.5, TELEPORT_PAIR_MIN_DIST2);
    if (bi < 0) {
      used.delete(ai);
      continue;
    }
    used.add(bi);
    world.anomalyTeleports.set(ai, bi);
    world.anomalyTeleports.set(bi, ai);
    markTeleportEndpoint(world, ai, spec.seed + i * 977, used);
    markTeleportEndpoint(world, bi, spec.seed ^ (i * 1777 + 0x052052), used);
  }
}

