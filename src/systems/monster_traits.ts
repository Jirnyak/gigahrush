/* ── Standalone monster trait helpers ────────────────────────── */

import { ArmorType, Cell, DamageType, EntityType, Feature, MonsterKind, RoomType, type Entity } from '../core/types';
import { World } from '../core/world';
import { armorMultiplier } from '../data/armor_matrix';
import { MONSTERS } from '../entities/monster';
import { hasLineToCell } from '../world/line_of_sight';
import { wetTerrainAtEntity } from './monster_terrain';

const DEFENSIVE_NEUTRAL_HOSTILE_STAGE = 1;
/** Числа у бетона живут в матрице брони; здесь — имя, которым его зовут снаружи. */
export const PANELNIK_WALL_BRACE_DAMAGE_MULT = armorMultiplier(ArmorType.CONCRETE);
export const PANELNIK_OPEN_SLOW_SEC = 1.35;
export const PANELNIK_OPEN_SLOW_MULT = 0.58;
/** Радиус якоря Червия читается у его же строки: числа вида живут в дефе вида. */
export const CHERVIE_NET_SOURCE_RADIUS = MONSTERS[MonsterKind.CHERVIE_AVATAR].anchor!.radius;

/** Найденный якорь: клетка, её признак и квадрат расстояния до твари. */
export interface MonsterAnchorPoint {
  idx: number;
  x: number;
  y: number;
  feature: Feature;
  dist2: number;
}

export interface MonsterWallContext {
  adjacentWall: boolean;
  narrowDoorOrCorner: boolean;
  openFloorScore: number;
  debrisNearby: boolean;
  weakWallNearby?: { idx: number; x: number; y: number };
}

function debrisFeature(feature: Feature): boolean {
  return feature === Feature.SHELF || feature === Feature.MACHINE || feature === Feature.APPARATUS;
}

function passableNeighbor(world: World, x: number, y: number): boolean {
  return !world.solid(x, y);
}

function weakWallCandidate(world: World, x: number, y: number, idx: number): boolean {
  if (world.cells[idx] !== Cell.WALL) return false;
  if (world.hermoWall[idx] !== 0 || world.aptMask[idx] !== 0) return false;
  const horizontal = passableNeighbor(world, x - 1, y) && passableNeighbor(world, x + 1, y);
  const vertical = passableNeighbor(world, x, y - 1) && passableNeighbor(world, x, y + 1);
  return horizontal || vertical;
}

export function monsterWallContext(world: World, e: Entity): MonsterWallContext {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  let adjacentWall = false;
  let adjacentDoor = false;
  let cardinalSolids = 0;

  for (const [dx, dy] of dirs) {
    const cell = world.cells[world.idx(x + dx, y + dy)];
    if (cell === Cell.WALL) adjacentWall = true;
    if (cell === Cell.DOOR) adjacentDoor = true;
    if (world.solid(x + dx, y + dy)) cardinalSolids++;
  }

  let localWalls = 0;
  let closeWalls = 0;
  let debrisNearby = false;
  let weakWallNearby: MonsterWallContext['weakWallNearby'];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const r2 = dx * dx + dy * dy;
      if (r2 > 4) continue;
      const wx = world.wrap(x + dx);
      const wy = world.wrap(y + dy);
      const idx = world.idx(wx, wy);
      if (world.cells[idx] === Cell.WALL) {
        localWalls++;
        if (r2 <= 1) closeWalls++;
        if (!weakWallNearby && weakWallCandidate(world, wx, wy, idx)) weakWallNearby = { idx, x: wx, y: wy };
      }
      if (debrisFeature(world.features[idx] as Feature)) debrisNearby = true;
    }
  }

  const roomType = world.roomAt(e.x, e.y)?.type;
  if (roomType === RoomType.STORAGE || roomType === RoomType.PRODUCTION) debrisNearby = true;
  const narrowDoorOrCorner = adjacentDoor || cardinalSolids >= 2;
  const wallPressure = Math.min(1, localWalls / 7 + closeWalls * 0.18 + (narrowDoorOrCorner ? 0.14 : 0));
  return {
    adjacentWall,
    narrowDoorOrCorner,
    openFloorScore: Math.max(0, Math.min(1, 1 - wallPressure)),
    debrisNearby,
    weakWallNearby,
  };
}

export function panelnikWallBraceActive(world: World, e: Entity): boolean {
  if (e.type !== EntityType.MONSTER || e.monsterKind !== MonsterKind.PANELNIK) return false;
  return monsterWallContext(world, e).adjacentWall;
}

export function panelnikOpenFloor(world: World, e: Entity): boolean {
  if (e.type !== EntityType.MONSTER || e.monsterKind !== MonsterKind.PANELNIK) return false;
  return monsterWallContext(world, e).openFloorScore >= 0.98;
}

export function lotochnikDrainArmorActive(world: World, e: Entity): boolean {
  if (e.type !== EntityType.MONSTER || e.monsterKind !== MonsterKind.LOTOCHNIK) return false;
  return wetTerrainAtEntity(world, e);
}

/**
 * Ближайший целый якорь вида: клетка, от которой тварь работает.
 *
 * Один поиск на всю семью «привязки к точке мира». Какие клетки годятся, на
 * каком радиусе и нужна ли до них прямая — объявляет `MonsterDef.anchor`, а не
 * тело этой функции: раньше это была персональная `findChervieNetSource` с
 * зашитой парой признаков, а Ламповый рядом искал свой якорь ВТОРОЙ копией
 * того же кольцевого обхода (`nearFeature`), только без прямой.
 *
 * Прямая — свойство вида: в экран смотрят, поэтому стена питание рвёт, и
 * клетка самого экрана имеет право быть плотной (общий `hasLineToCell` этот
 * пропуск и делает); лампа же светит из-за угла.
 *
 * Ответ НЕ кэшируется. Ближайший якорь берётся просто по расстоянию: кто из
 * двух годных ближе, тот и якорь. Прежний перевес аппарата над экраном на 1.5
 * снят — выбранную клетку с тех пор никто не читает, а «есть ли якорь вообще»
 * от предпочтения не зависит ни в одной расстановке.
 */
export function findMonsterAnchor(world: World, e: Entity, radiusOverride?: number): MonsterAnchorPoint | undefined {
  if (e.type !== EntityType.MONSTER || e.monsterKind === undefined) return undefined;
  const def = MONSTERS[e.monsterKind]?.anchor;
  if (!def) return undefined;
  const radius = radiusOverride ?? def.radius;
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  const r2 = radius * radius;
  let best: MonsterAnchorPoint | undefined;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = world.wrap(ex + dx);
      const y = world.wrap(ey + dy);
      const idx = world.idx(x, y);
      const feature = world.features[idx] as Feature;
      if (!def.features.includes(feature)) continue;
      const dist2 = world.dist2(e.x, e.y, x + 0.5, y + 0.5);
      if (dist2 > r2 || (best !== undefined && dist2 >= best.dist2)) continue;
      if (def.sight === true && !hasLineToCell(world, e.x, e.y, x + 0.5, y + 0.5, radius)) continue;
      best = { idx, x, y, feature, dist2 };
    }
  }
  return best;
}

/** Цел ли якорь вида прямо сейчас. Вид без строки якоря отвечает `false`. */
export function monsterAnchored(world: World, e: Entity): boolean {
  return findMonsterAnchor(world, e) !== undefined;
}

/**
 * То же самое под прежним именем: дверь брони монстров живёт за границей этого
 * фронта, и её импорт менять нельзя. Обёртка, а не вторая реализация.
 */
export function chervieNetPowered(world: World, e: Entity): boolean {
  return monsterAnchored(world, e);
}

export function isPassiveDefensiveNeutralMonster(e: Entity): boolean {
  if (e.type !== EntityType.MONSTER || e.monsterKind === undefined) return false;
  const def = MONSTERS[e.monsterKind];
  return def?.aiFlags?.includes('defensiveNeutral') === true
    && e.monsterStage !== DEFENSIVE_NEUTRAL_HOSTILE_STAGE;
}

/**
 * Условие → активный вид брони. Порядок значим: упор в стену старше мокрого
 * лотка, потому что таким он был до сведения множителей в матрицу.
 *
 * Сколько снимет удар, здесь не считают — это работа `ARMOR_MATRIX`.
 */
export function monsterTraitArmorType(world: World, target: Entity): ArmorType | undefined {
  if (panelnikWallBraceActive(world, target)) return ArmorType.CONCRETE;
  if (lotochnikDrainArmorActive(world, target)) return ArmorType.WET_HIDE;
  return undefined;
}

export function applyMonsterIncomingDamage(
  world: World,
  target: Entity,
  damage: number,
  damageType?: DamageType,
): number {
  const armor = monsterTraitArmorType(world, target);
  // Без брони урон проходит НЕТРОНУТЫМ: ни округления, ни пола в единицу. Ноль
  // обязан остаться нулём — иначе царапина превратится в удар.
  if (armor === undefined) return damage;
  return Math.max(1, Math.round(damage * armorMultiplier(armor, damageType)));
}
