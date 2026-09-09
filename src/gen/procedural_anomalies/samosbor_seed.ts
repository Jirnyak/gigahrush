/* ── Аномалия: свежий осадок самосбора ────────────────────────────
 *
 * Пробой, мясной след от него и защищённая скорлупа укрытия рядом. Вырублена
 * из общего файла процедурного этажа по правилу `anomalies.md`: своя
 * генерационная половина — свой файл. Фаза общая, `dressing`.
 */

import {
  Cell,
  Feature,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import type { ProceduralFloorSpec } from '../../data/procedural_floors';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import { registerRouteCue } from '../../systems/route_cues';
import { chance, placeRoomFeature, randomFloorCellBlind, roomCell, roomCenter } from './common';
import type { ProceduralAnomalyGenContext } from './common';

function canPaintSamosborSeedCell(world: World, ci: number): boolean {
  return world.aptMask[ci] === 0 &&
    world.hermoWall[ci] === 0 &&
    world.cells[ci] !== Cell.LIFT &&
    world.features[ci] !== Feature.LIFT_BUTTON;
}

function chooseSamosborSeedBreachRoom(world: World, rooms: Room[], spec: ProceduralFloorSpec, sx: number, sy: number): Room | null {
  const candidates = rooms
    .filter(room => room.id !== 0 && !room.sealed && room.w >= 5 && room.h >= 5 && room.type !== RoomType.BATHROOM)
    .map(room => {
      const c = roomCenter(room);
      const d2 = world.dist2(sx, sy, c.x + 0.5, c.y + 0.5);
      const size = room.w * room.h;
      const typeScore = room.type === RoomType.PRODUCTION || room.type === RoomType.STORAGE ? 80 : room.type === RoomType.COMMON ? 48 : 0;
      return { room, score: Math.min(180, Math.sqrt(d2)) + size * 0.18 + typeScore + ((spec.seed + room.id * 17) % 23) };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.room ?? rooms.find(room => room.id !== 0) ?? null;
}

function chooseSamosborSeedShelterRoom(world: World, rooms: Room[], breach: Room | null, sx: number, sy: number): Room | null {
  const breachCenter = breach ? roomCenter(breach) : { x: sx, y: sy };
  const candidates = rooms
    .filter(room => room.id !== 0 && room.id !== breach?.id && room.w >= 5 && room.h >= 5)
    .map(room => {
      const c = roomCenter(room);
      const nameShelter = room.name.startsWith('Гражданское укрытие') ||
        room.name.startsWith('Тихая ниша укрытия') ||
        room.name.startsWith('Убежищный отросток');
      const cleanType = room.type === RoomType.COMMON || room.type === RoomType.STORAGE || room.type === RoomType.LIVING || room.type === RoomType.OFFICE;
      const spawnDist = Math.sqrt(world.dist2(sx, sy, c.x + 0.5, c.y + 0.5));
      const breachDist = Math.sqrt(world.dist2(breachCenter.x + 0.5, breachCenter.y + 0.5, c.x + 0.5, c.y + 0.5));
      return {
        room,
        score: (nameShelter ? 220 : 0) + (cleanType ? 70 : 0) + Math.min(100, breachDist) - Math.min(80, spawnDist * 0.35),
      };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.room ?? null;
}

function paintSamosborSeedBreach(world: World, room: Room, spec: ProceduralFloorSpec): { x: number; y: number } | null {
  const center = roomCenter(room);
  const rx = Math.max(3, room.w * 0.48);
  const ry = Math.max(3, room.h * 0.48);
  let painted = 0;
  room.name = `Семя самосбора ${room.id}: мясной разлом`;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      const ci = world.idx(x, y);
      if (!canPaintSamosborSeedCell(world, ci)) continue;
      const nx = (x - center.x) / rx;
      const ny = (y - center.y) / ry;
      const d2 = nx * nx + ny * ny;
      if (world.cells[ci] === Cell.WALL && d2 <= 1.12) {
        world.wallTex[ci] = d2 < 0.72 ? Tex.MEAT : Tex.GUT;
        continue;
      }
      if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) continue;
      if (world.roomMap[ci] !== room.id && d2 > 0.78) continue;
      world.floorTex[ci] = d2 < 0.5 ? Tex.F_MEAT : Tex.F_GUT;
      world.fog[ci] = Math.max(world.fog[ci], Math.round(82 + Math.max(0, 1 - d2) * 72));
      if (world.features[ci] === Feature.NONE && !world.containerMap.has(ci) && ((dx * 13 + dy * 7 + spec.seed) & 31) === 0) {
        world.features[ci] = Feature.APPARATUS;
      }
      if ((painted % 17) === 0) {
        stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.42, 0.72, spec.seed ^ (painted * 97 + room.id), 116, 30, 42, false);
      }
      painted++;
    }
  }
  const zone = world.zones[world.zoneMap[world.idx(center.x, center.y)]];
  if (zone) {
    zone.faction = ZoneFaction.SAMOSBOR;
    zone.level = Math.max(zone.level, Math.min(5, spec.danger + 1));
    zone.fogged = true;
  }
  const centerIdx = world.idx(center.x, center.y);
  if (world.cells[centerIdx] === Cell.FLOOR && world.features[centerIdx] === Feature.NONE && !world.containerMap.has(centerIdx)) {
    world.features[centerIdx] = Feature.APPARATUS;
  }
  stampSurfaceSplat(world, center.x, center.y, 0.5, 0.5, 0.75, 0.88, spec.seed ^ 0x5a0b0, 135, 20, 34, false);
  stampSurfaceSplat(world, center.x, center.y, 0.5, 0.5, 0.52, 0.58, spec.seed ^ 0x51e, 42, 105, 76, false);
  return roomCell(world, room, Math.floor(room.w / 2), Math.floor(room.h / 2)) ?? center;
}

function paintSamosborSeedTrail(world: World, spec: ProceduralFloorSpec, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const dx = world.delta(from.x, to.x);
  const dy = world.delta(from.y, to.y);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = world.wrap(Math.round(from.x + dx * t));
    const y = world.wrap(Math.round(from.y + dy * t));
    for (let side = -1; side <= 1; side++) {
      const sx = world.wrap(x + (Math.abs(dx) >= Math.abs(dy) ? 0 : side));
      const sy = world.wrap(y + (Math.abs(dx) >= Math.abs(dy) ? side : 0));
      const ci = world.idx(sx, sy);
      if (!canPaintSamosborSeedCell(world, ci) || (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER)) continue;
      if ((i + side + spec.seed) % 3 !== 0) continue;
      world.floorTex[ci] = i % 4 === 0 ? Tex.F_GUT : world.floorTex[ci];
      world.fog[ci] = Math.max(world.fog[ci], 42 + Math.round((1 - t) * 34));
      if (i % 13 === 0) stampSurfaceSplat(world, sx, sy, 0.5, 0.5, 0.28, 0.5, spec.seed ^ (i * 131 + side), 92, 24, 36, false);
    }
  }
}

function paintSamosborSeedProtectedShell(world: World, room: Room, spec: ProceduralFloorSpec): { x: number; y: number } | null {
  const center = roomCenter(room);
  if (!room.name.startsWith('Гражданское укрытие') && !room.name.startsWith('Тихая ниша укрытия') && !room.name.startsWith('Убежищный отросток')) {
    room.name = `Чистый отступ ${room.id}`;
  }
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      const ci = world.idx(x, y);
      if (!canPaintSamosborSeedCell(world, ci)) continue;
      if (world.cells[ci] === Cell.WALL && world.roomMap[world.idx(center.x, center.y)] === room.id) {
        world.wallTex[ci] = Tex.HERMO_WALL;
      } else if ((world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) && world.roomMap[ci] === room.id) {
        world.floorTex[ci] = ((dx + dy + spec.seed) & 3) === 0 ? Tex.F_TILE : Tex.F_CONCRETE;
        world.fog[ci] = Math.min(world.fog[ci], 18);
      }
    }
  }
  const zone = world.zones[world.zoneMap[world.idx(center.x, center.y)]];
  if (zone) {
    zone.faction = ZoneFaction.CITIZEN;
    zone.fogged = false;
  }
  placeRoomFeature(world, room, Feature.LAMP, 1, 1);
  placeRoomFeature(world, room, Feature.SCREEN, room.w - 2, 1);
  stampSurfaceSplat(world, center.x, center.y, 0.5, 0.5, 0.32, 0.36, spec.seed ^ 0xafe, 105, 146, 118, false);
  return roomCell(world, room, Math.floor(room.w / 2), Math.floor(room.h / 2)) ?? center;
}

function registerSamosborSeedRetreatCue(
  world: World,
  spec: ProceduralFloorSpec,
  breach: Room,
  shelter: Room,
  breachPos: { x: number; y: number },
  shelterPos: { x: number; y: number },
): void {
  registerRouteCue(world, {
    id: `procedural_${spec.key}_samosbor_retreat`,
    x: breachPos.x + 0.5,
    y: breachPos.y + 0.5,
    targetX: shelterPos.x + 0.5,
    targetY: shelterPos.y + 0.5,
    z: spec.z,
    roomId: breach.id,
    targetRoomId: shelter.id,
    zoneId: world.zoneMap[world.idx(breachPos.x, breachPos.y)],
    label: 'чистый отступ',
    hint: 'отступить от мясного семени к сухому карману',
    targetName: shelter.name,
    color: '#b8d7a2',
    tags: ['procedural_floor', 'samosbor_seed', 'samosbor', 'retreat', 'shelter', 'protected_shell'],
    toneSeed: (spec.seed ^ breach.id * 313 ^ shelter.id * 977) >>> 0,
    radius: 13,
    targetRadius: 4,
    cooldownSec: 28,
    heardText: 'Сирена в мясе щелкает не в ритм. Чистый отступ еще читается по сухому полу.',
    followedText: 'Чистый отступ найден. Давка осталась за спиной, но герму все равно надо готовить руками.',
    ignoredText: 'Чистый отступ ушел за шумом. Мясной очаг остался между маршрутами.',
    routeGroup: {
      id: `procedural_${spec.key}_samosbor_seed_retreat`,
      lead: 'сирена показывает очаг',
      risk: 'туман и мясной пол предупреждают о раннем самосборном давлении',
      decision: 'зайти за лутом, отойти к чистому карману или держать основной маршрут',
      reward: 'чистая комната дает ориентир для подготовки гермы',
      mapLabel: 'чистый отступ',
      mapHint: 'сухой карман у самосборного семени',
    },
  });
}

export function applySamosborSeed(ctx: ProceduralAnomalyGenContext): void {
  const { world, rooms, spec, spawnX, spawnY } = ctx;
  if (spec.anomalyId !== 'samosbor_seed') return;
  for (const zone of world.zones) {
    if (chance(0.22 + spec.danger * 0.04)) zone.faction = ZoneFaction.SAMOSBOR;
  }
  const breach = chooseSamosborSeedBreachRoom(world, rooms, spec, Math.floor(spawnX), Math.floor(spawnY));
  const shelter = chooseSamosborSeedShelterRoom(world, rooms, breach, Math.floor(spawnX), Math.floor(spawnY));
  const breachPos = breach ? paintSamosborSeedBreach(world, breach, spec) : null;
  const shelterPos = shelter ? paintSamosborSeedProtectedShell(world, shelter, spec) : null;
  if (breach && shelter && breachPos && shelterPos) {
    paintSamosborSeedTrail(world, spec, shelterPos, breachPos);
    registerSamosborSeedRetreatCue(world, spec, breach, shelter, breachPos, shelterPos);
  }
  for (let i = 0; i < 1400; i++) {
    const pos = randomFloorCellBlind(world, W / 2, W / 2, 0);
    if (!pos) continue;
    const ci = world.idx(pos.x, pos.y);
    if (!canPaintSamosborSeedCell(world, ci)) continue;
    world.floorTex[ci] = chance(0.5) ? Tex.F_GUT : Tex.F_MEAT;
    if (chance(0.2)) stampSurfaceSplat(world, pos.x, pos.y, 0.5, 0.5, 0.45, 0.8, spec.seed + i, 120, 15, 28, false);
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFogDirty();
  world.markFeaturesDirty(true);
}

