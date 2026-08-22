/* ── Споровый ковёр: растёт на крови ──────────────────────────────
 *
 * Одно правило: он никуда не идёт. Он занимает соседнюю клетку там, где кто-то
 * истёк кровью, и гасит этот след — переводит его в себя. Бой в коридоре
 * кормит ковёр; коридор, где дрались трижды, зарастает.
 *
 * Динамика: угроза перестаёт быть монстром и становится последствием. Дерись
 * здесь — и через минуту здесь будет ковёр. Не хочешь — уводи бой в сторону
 * или выжигай след сразу.
 *
 * Раньше у вида было четыре механики: просыпался от прохожего, пыхал спорами
 * по площади, отдельно сторожил двери, отдельно сканировал ящики на «аппетит»,
 * плюс откат от огня. Пять полей в ядре и ротационный перебор контейнеров.
 */

import {
  Cell, EntityType, MonsterKind,
  type Entity, type GameState, type Msg,
  msg,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../entities/sprite_index';
import { DANGER_FIELD_DEATH_IMPULSE, clearBloodTrailCell } from '../danger_field';
import { canSpawnEntityType } from '../entity_limits';
import { publishEvent } from '../events';
import { randomRPG, scaleMonsterHp } from '../rpg';
import { speciesState } from './species_state';

/** Насколько сильным должен быть след, чтобы на нём принялся отросток. */
const CARPET_BLOOD_MIN = DANGER_FIELD_DEATH_IMPULSE / 2;
/** Как часто ковёр щупает вокруг себя. Он растение, ему спешить некуда. */
const CARPET_GROW_CD_SEC = 6;
/** Окно поиска: только соседние клетки, дальше он не дотягивается. */
const CARPET_REACH = 2;
/** Потолок разрастания с одного ковра — чтобы этаж не стал сплошным. */
const CARPET_CHILD_CAP = 4;

interface CarpetState {
  growCd: number;
  children: number;
}
const carpetState = speciesState<CarpetState>(() => ({ growCd: CARPET_GROW_CD_SEC, children: 0 }));

/** Сколько отростков дал этот ковёр: путь для отладки и тестов. */
export function peekSporeCarpetChildren(e: Entity): number {
  return carpetState.peek(e)?.children ?? 0;
}

function carpetCellFree(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  const cell = world.cells[ci];
  return (cell === Cell.FLOOR || cell === Cell.WATER) && !world.solid(x, y);
}

/**
 * Ближайшая клетка с чужой кровью в пределах вытянутой пряди.
 * Окно фиксировано и крошечное — это не поиск по этажу, а ощупывание вокруг.
 */
function findBloodCellNear(world: World, e: Entity): { x: number; y: number } | null {
  const cx = Math.floor(e.x);
  const cy = Math.floor(e.y);
  let best: { x: number; y: number } | null = null;
  let bestValue = CARPET_BLOOD_MIN;
  for (let dy = -CARPET_REACH; dy <= CARPET_REACH; dy++) {
    for (let dx = -CARPET_REACH; dx <= CARPET_REACH; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = world.wrap(cx + dx);
      const y = world.wrap(cy + dy);
      if (!carpetCellFree(world, x, y)) continue;
      const value = world.dangerField[world.idx(x, y)];
      if (value < bestValue) continue;
      bestValue = value;
      best = { x, y };
    }
  }
  return best;
}

/**
 * Рост ковра. Ни цели, ни погони, ни игрока в условиях: он тянется к следу
 * крови, чей бы он ни был, и гасит его.
 */
export function updateSporeCarpetGrowth(
  world: World,
  entities: Entity[],
  e: Entity,
  nextId: { v: number },
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.SPORE_CARPET || !e.alive) return false;
  const carpet = carpetState.of(e);
  carpet.growCd -= dt;
  if (carpet.growCd > 0) return true;
  carpet.growCd = CARPET_GROW_CD_SEC + (e.id & 3) * 0.7;

  if (carpet.children >= CARPET_CHILD_CAP) return true;
  const cell = findBloodCellNear(world, e);
  if (!cell) return true;
  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return true;

  // След переходит в ковёр целиком: одну кровь дважды не съедают.
  clearBloodTrailCell(world, cell.x, cell.y);
  carpet.children++;

  const def = MONSTERS[MonsterKind.SPORE_CARPET];
  const level = world.zones[world.zoneMap[world.idx(cell.x, cell.y)]]?.level ?? 1;
  const hp = Math.max(1, Math.round(scaleMonsterHp(def.hp, level) * 0.8));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: cell.x + 0.5,
    y: cell.y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: monsterSpr(MonsterKind.SPORE_CARPET),
    name: def.name,
    hp,
    maxHp: hp,
    monsterKind: MonsterKind.SPORE_CARPET,
    attackCd: 1,
    rpg: randomRPG(level),
  });

  msgs.push(msg('Ковёр пророс по кровяному следу.', time, '#8b6'));
  if (state) {
    publishEvent(state, {
      type: 'spore_carpet_grown',
      time,
      zoneId: world.zoneMap[world.idx(cell.x, cell.y)],
      roomId: world.roomAt(cell.x, cell.y)?.id,
      x: cell.x + 0.5,
      y: cell.y + 0.5,
      actorId: e.id,
      monsterKind: MonsterKind.SPORE_CARPET,
      severity: 2,
      privacy: 'witnessed',
      tags: ['monster', 'spore_carpet', 'growth', 'blood'],
      data: {
        bloodMin: CARPET_BLOOD_MIN,
        childCap: CARPET_CHILD_CAP,
        counterplay: 'move_the_fight_or_burn_the_trail',
      },
    });
  }
  return true;
}
