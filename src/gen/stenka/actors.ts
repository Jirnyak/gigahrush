/* ── Стенка на стенку: гнёзда, башни и лут ───────────────────────
 *
 *   Ни одна из сторон не заводит своего кода поведения. Всё держится на
 *   двух объявлениях у сущности:
 *     `faction`   — вражду решает общая матрица отношений, как у людей;
 *     `homeRoomId`— поводок территориального режима, указывающий на
 *                   ЧУЖОЙ рубеж, отчего поводок и работает как марш.
 *   Гнездо передаёт оба поля приплоду (см. `systems/matka_source.ts`).
 */

import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  MonsterKind,
  type Entity,
  type Item,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../entities/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { campLootCell, lanePointAt } from './geometry';
import { NEST_T, STENKA_Z, TOWER_TS, type StenkaLane, type StenkaRooms } from './meta';

/** Сторона: фракция решает вражду, чётность сида — цвет спрайта. */
interface Side {
  faction: Faction;
  spriteSeed: number;
  label: string;
}

const LIQUIDATORS: Side = { faction: Faction.LIQUIDATOR, spriteSeed: 2, label: 'ликвидаторов' };
const WILDS: Side = { faction: Faction.WILD, spriteSeed: 3, label: 'диких' };

/** Логово стороны не носит: `side === null` и есть «нейтрал, обычная экология». */
function makeArenaMonster(
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  side: Side | null,
  spriteSeed: number,
  homeRoomId: number | undefined,
  name: string,
): Entity {
  const def = MONSTERS[kind];
  return {
    id: nextId.v++,
    type: EntityType.MONSTER,
    monsterKind: kind,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: monsterSpr(kind),
    spriteSeed,
    faction: side?.faction,
    name,
    hp: def.hp,
    maxHp: def.hp,
    attackCd: def.attackRate,
    ai: {
      goal: AIGoal.WANDER,
      tx: Math.floor(x),
      ty: Math.floor(y),
      path: [],
      pi: 0,
      stuck: 0,
      timer: 0,
      homeRoomId,
    },
    rpg: randomRPG(12),
    // Источник тикает общим шагом; ноль означает «первый выводок сразу».
    matkaTimer: MONSTERS[kind].source ? 0 : undefined,
  };
}

function makeLaneMonster(
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  side: Side,
  homeRoomId: number | undefined,
  name: string,
): Entity {
  return makeArenaMonster(nextId, kind, x, y, side, side.spriteSeed, homeRoomId, name);
}

export function placeLaneActors(
  entities: Entity[],
  nextId: { v: number },
  lanes: readonly StenkaLane[],
  rooms: StenkaRooms,
): { nests: number; towers: number } {
  let nests = 0;
  let towers = 0;

  for (const lane of lanes) {
    // Гнёзда стоят на своей линии и целятся в чужой рубеж ТОЙ ЖЕ линии.
    const nestA = lanePointAt(lane, NEST_T);
    const nestB = lanePointAt(lane, 1 - NEST_T);
    entities.push(makeLaneMonster(nextId, MonsterKind.GNEZDO, nestA.x, nestA.y, LIQUIDATORS,
      rooms.frontB[lane.id].id, `Гнездо ликвидаторов (${lane.id})`));
    entities.push(makeLaneMonster(nextId, MonsterKind.GNEZDO, nestB.x, nestB.y, WILDS,
      rooms.frontA[lane.id].id, `Гнездо диких (${lane.id})`));
    nests += 2;

    // Башни: ближняя половина линии — ликвидаторские, дальняя — дикие.
    for (const t of TOWER_TS) {
      const side = t < 0.5 ? LIQUIDATORS : WILDS;
      const at = lanePointAt(lane, t);
      entities.push(makeLaneMonster(nextId, MonsterKind.BASHNYA, at.x, at.y, side, undefined,
        `Башня ${side.label} (${lane.id})`));
      towers++;
    }
  }

  // По две башни во дворе каждой базы: последний рубеж перед гнездом.
  for (const [base, side] of [[rooms.baseA, LIQUIDATORS], [rooms.baseB, WILDS]] as const) {
    for (const [dx, dy] of [[-18, 0], [18, 0]] as const) {
      const x = base.x + (base.w >> 1) + dx;
      const y = base.y + (base.h >> 1) + dy;
      entities.push(makeLaneMonster(nextId, MonsterKind.BASHNYA, x, y, side, undefined,
        `Башня ${side.label} (двор)`));
      towers++;
    }
  }

  return { nests, towers };
}

/**
 * Логова лесных лагерей. Стороны у них нет намеренно: приплод остаётся обычной
 * экологией, а значит враждебен и игроку, и ОБЕИМ командам — сторонний монстр
 * читает против экологии ту же таблицу «фракция-монстры», что человек его
 * фракции. Волна, забредшая в карман, там и вязнет.
 */
export function placeCampDens(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: StenkaRooms,
): number {
  let placed = 0;
  rooms.campDens.forEach((den, i) => {
    const camp = rooms.camps[i];
    if (!camp) return;
    // Логово обязано стоять В КАМНЕ: на полу его можно было бы убить, и лагерь
    // вычищался бы насовсем. Если геометрия вдруг оставила там пол — лагерь
    // остаётся без логова, но неубиваемость не подменяется числом хитов.
    if (world.cells[world.idx(den.x, den.y)] !== Cell.WALL) return;
    entities.push(makeArenaMonster(
      nextId, MonsterKind.LOGOVO, den.x, den.y, null, camp.id, camp.id, `Логово: ${camp.name}`,
    ));
    placed++;
  });
  return placed;
}

function campLoot(index: number): Item[] {
  const bank: Item[][] = [
    [{ defId: 'bandage', count: 2 }, { defId: 'bread', count: 1 }],
    [{ defId: 'ammo_9mm', count: 12 }, { defId: 'psi_dust', count: 1 }],
    [{ defId: 'liquidator_ration', count: 1 }, { defId: 'bandage', count: 1 }],
    [{ defId: 'ammo_762', count: 10 }, { defId: 'water', count: 1 }],
  ];
  return bank[index % bank.length].map(item => ({ ...item }));
}

export function placeCampLoot(world: World, camps: readonly Room[]): void {
  camps.forEach((camp, i) => {
    const cell = campLootCell(camp);
    const ci = world.idx(cell.x, cell.y);
    world.addContainer({
      id: world.containers.length + 1,
      x: cell.x,
      y: cell.y,
      z: STENKA_Z,
      roomId: camp.id,
      zoneId: world.zoneMap[ci],
      kind: ContainerKind.WEAPON_CRATE,
      name: 'Ящик лесного лагеря',
      inventory: campLoot(i),
      access: 'public',
      discovered: false,
      tags: ['stenka', 'camp', 'loot'],
    });
  });
}
