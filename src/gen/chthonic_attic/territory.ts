/* ── Future design z: Хтонический чердак ─────────────────── */

import { W, ZoneFaction, type Room, type TerritoryOwner } from '../../core/types';
import { World } from '../../core/world';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import { ATTIC_BASE_X, ATTIC_BASE_Y, AtticPoint, atticHash01 } from './geometry';
import { ATTIC_SERVICE_ISLANDS, ATTIC_MICRO_BLOCKS } from './islands';
export interface AtticTerritoryTarget {
  owner: TerritoryOwner;
  share: number;
  anchors: readonly AtticPoint[];
}

export const ATTIC_TERRITORY_TARGETS: readonly AtticTerritoryTarget[] = [
  { owner: ZoneFaction.CITIZEN, share: 0.18, anchors: [{ x: 178, y: 760 }, { x: 182, y: 486 }, { x: 382, y: 514 }] },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.24, anchors: [{ x: 832, y: 276 }, { x: ATTIC_BASE_X + 185, y: ATTIC_BASE_Y + 36 }, { x: 356, y: 822 }, { x: 640, y: 188 }] },
  { owner: ZoneFaction.CULTIST, share: 0.14, anchors: [{ x: 336, y: 330 }, { x: ATTIC_BASE_X + 158, y: ATTIC_BASE_Y + 81 }, { x: 520, y: 552 }] },
  { owner: ZoneFaction.SCIENTIST, share: 0.10, anchors: [{ x: 596, y: 792 }, { x: 502, y: 696 }, { x: 458, y: 208 }] },
  { owner: ZoneFaction.WILD, share: 0.34, anchors: [{ x: 890, y: 836 }, { x: 260, y: 890 }, { x: 744, y: 626 }, { x: 944, y: 230 }] },
];

export function atticOwnerWorkName(owner: TerritoryOwner): string {
  switch (owner) {
    case ZoneFaction.CITIZEN: return 'ремонтная';
    case ZoneFaction.LIQUIDATOR: return 'караулка';
    case ZoneFaction.CULTIST: return 'жертвенный стол';
    case ZoneFaction.SCIENTIST: return 'медизмерение';
    case ZoneFaction.WILD: return 'разборочная';
    default: return 'служебная';
  }
}

export function applyChthonicAtticTerritory(world: World): void {
  const tileSize = 32;
  const side = W / tileSize;
  const tileCount = side * side;
  const quotas = atticTerritoryTileQuotas(tileCount);
  const tileOwner = new Int16Array(tileCount).fill(-1);
  const ownerCounts = new Int16Array(ATTIC_TERRITORY_TARGETS.length);
  const candidates: { tile: number; ownerIndex: number; score: number }[] = [];

  for (let ty = 0; ty < side; ty++) {
    for (let tx = 0; tx < side; tx++) {
      const tile = ty * side + tx;
      const x = tx * tileSize + (tileSize >> 1);
      const y = ty * tileSize + (tileSize >> 1);
      for (let ownerIndex = 0; ownerIndex < ATTIC_TERRITORY_TARGETS.length; ownerIndex++) {
        candidates.push({ tile, ownerIndex, score: atticTerritoryScore(world, x, y, tx, ty, ownerIndex) });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.ownerIndex - b.ownerIndex || a.tile - b.tile);
  for (const candidate of candidates) {
    if (tileOwner[candidate.tile] >= 0 || ownerCounts[candidate.ownerIndex] >= quotas[candidate.ownerIndex]) continue;
    tileOwner[candidate.tile] = candidate.ownerIndex;
    ownerCounts[candidate.ownerIndex]++;
  }
  for (let tile = 0; tile < tileCount; tile++) {
    if (tileOwner[tile] >= 0) continue;
    let ownerIndex = 0;
    for (let i = 1; i < ATTIC_TERRITORY_TARGETS.length; i++) {
      if (ownerCounts[i] < quotas[i] && ownerCounts[i] / Math.max(1, quotas[i]) < ownerCounts[ownerIndex] / Math.max(1, quotas[ownerIndex])) ownerIndex = i;
    }
    tileOwner[tile] = ownerIndex;
    ownerCounts[ownerIndex]++;
  }

  for (let ty = 0; ty < side; ty++) {
    for (let tx = 0; tx < side; tx++) {
      const owner = ATTIC_TERRITORY_TARGETS[tileOwner[ty * side + tx]].owner;
      const y0 = ty * tileSize;
      const x0 = tx * tileSize;
      for (let y = y0; y < y0 + tileSize; y++) {
        for (let x = x0; x < x0 + tileSize; x++) {
          setTerritoryOwnerAtIndex(world, world.idx(x, y), owner);
        }
      }
    }
  }

  for (const room of world.rooms) {
    const owner = atticAuthoredRoomOwner(room);
    if (owner === undefined) continue;
    paintAtticRoomTerritory(world, room, owner);
  }
}

export function atticTerritoryTileQuotas(tileCount: number): Int16Array {
  const quotas = new Int16Array(ATTIC_TERRITORY_TARGETS.length);
  const fractions = ATTIC_TERRITORY_TARGETS.map((target, index) => {
    const exact = target.share * tileCount;
    const base = Math.floor(exact);
    quotas[index] = base;
    return { index, fraction: exact - base };
  }).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let used = 0;
  for (const quota of quotas) used += quota;
  for (let i = 0; used < tileCount; i++, used++) quotas[fractions[i % fractions.length].index]++;
  return quotas;
}

export function atticTerritoryScore(world: World, x: number, y: number, tx: number, ty: number, ownerIndex: number): number {
  const target = ATTIC_TERRITORY_TARGETS[ownerIndex];
  let best = Infinity;
  for (const anchor of target.anchors) best = Math.min(best, world.dist(x, y, anchor.x, anchor.y));
  const noise = (atticHash01(tx, ty, target.owner * 71 + ownerIndex * 19) - 0.5) * 44;
  return best + noise - target.share * 96;
}

export function atticAuthoredRoomOwner(room: Room): TerritoryOwner | undefined {
  for (const island of ATTIC_SERVICE_ISLANDS) {
    if (room.name.startsWith(island.prefix)) return island.owner;
  }
  if (room.name.startsWith('Дикий запасной стан')) return ZoneFaction.WILD;
  if (room.name.startsWith('Чердак:')) {
    const plan = ATTIC_MICRO_BLOCKS.find(candidate => room.name.includes(candidate.name));
    return plan?.owner;
  }
  if (room.name.includes('хранительницы') || room.name.includes('Предчердачный')) return ZoneFaction.CITIZEN;
  if (room.name.includes('прожиг') || room.name.includes('крыши')) return ZoneFaction.LIQUIDATOR;
  if (room.name.includes('молельная') || room.name.includes('свидетель') || room.name.includes('черной ладони')) return ZoneFaction.CULTIST;
  if (room.name.includes('кабельного давления') || room.name.includes('датчик')) return ZoneFaction.SCIENTIST;
  if (room.name.includes('ложная') || room.name.includes('рван') || room.name.includes('разлом')) return ZoneFaction.WILD;
  return undefined;
}

export function paintAtticRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
}

