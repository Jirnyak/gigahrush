/* ── Форпост ликвидаторов — Major Grom's outpost (maintenance) ── */
/*   9×7 metal-walled room near the center of maintenance floor.  */
/*   Contains Major Grom + 2 liquidator guards.                   */
/*   Protected by aptMask.                                        */

import {
  W, Cell, Feature,
  type Room, type Entity,
  EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds, randomName } from '../../data/catalog';
import { PLOT_ROOMS } from '../../data/plot_rooms';
import { stampRoom, protectRoom, findClearArea } from '../shared';
import { applyNamedRoom } from '../named_rooms';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { randomRPG, getMaxHp } from '../../systems/rpg';
import { Spr } from '../../entities/sprite_index';
import { rng } from '../../core/rand';

/** Псевдоним комнаты форпоста. По нему её находит сцена обороны. */
export const FORPOST_ANCHOR = 'forpost' as const;
/** Докуда вести коридор наружу, если живой пол всё не встречается. */
const FORPOST_APPROACH_REACH = 40;


/**
 * Что сносить нельзя: настоящее жильё и НУТРО комнат, объявленных чужим
 * псевдонимом. Первое — чужой дом, второе — чужая ссылка: по `defId` эту комнату
 * кто-то ищет, и форпост, севший поверх, молча её угонит.
 *
 * Стена при этом не нутро. Пробить в чужой стене проём — то же, что поставить
 * дверь, и запрещать это нельзя: коридор, наткнувшийся на объявленную комнату,
 * иначе обрывается целиком, и форпост остаётся отрезанным при полностью открытом
 * пространстве вокруг. Ровно так он и терялся на части сидов.
 */
function isProtectedCell(world: World, ci: number, wallsArePassable = false): boolean {
  const roomId = world.roomMap[ci];
  const room = roomId !== undefined && roomId >= 0 ? world.rooms[roomId] : undefined;
  const isWall = world.cells[ci] === Cell.WALL;
  if (room?.defId) return !(wallsArePassable && isWall);
  if (!world.aptMask[ci]) return false;
  if ((room?.apartmentId ?? -1) >= 0) return true;
  // Служебная метка без настоящего жилья: рамка чужого POI. Стену в ней открыть
  // можно, содержимое — нет.
  return !(wallsArePassable && isWall);
}

/**
 * Место, которое ЗАКОННО расчистить. `findClearArea` ищет сплошной камень, а его
 * в прорытом лабиринте нет ни на одном сиде; здесь же смотрят на право сноса, а
 * не на текущее содержимое: нет чужого жилья, нет нутра объявленных комнат, нет
 * лифта — значит, бульдозер вправе выжечь пятно под узел обороны.
 */
function findBulldozableArea(
  world: World, cx: number, cy: number, w: number, h: number, minDist: number, maxDist: number,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 400; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const tx = world.wrap(cx + Math.round(Math.cos(angle) * dist));
    const ty = world.wrap(cy + Math.round(Math.sin(angle) * dist));
    let ok = true;
    for (let dy = -1; dy <= h && ok; dy++) {
      for (let dx = -1; dx <= w && ok; dx++) {
        const ci = world.idx(world.wrap(tx + dx), world.wrap(ty + dy));
        if (world.cells[ci] === Cell.LIFT || isProtectedCell(world, ci)) ok = false;
      }
    }
    if (ok) return { x: tx, y: ty };
  }
  return null;
}

/**
 * Коридоры на четыре стороны — до ближайшего проходимого.
 *
 * Один проём делает из форпоста тупик: твари лезут гуськом, бой не растекается по
 * подходам, а если единственная сторона упёрлась в глухой карман, комната и вовсе
 * остаётся недостижимой. Поэтому наружу пробивается с каждой стороны, и каждый
 * коридор идёт, пока не выйдет на живой пол.
 *
 * Обстановка с полосы снимается: клетка, свободная по геометрии, но занятая
 * тумбой, для дерева путей непроходима — коридор вышел бы нарисованным, а не
 * проходимым.
 *
 * Полоса ведётся НА ВСЮ ДЛИНУ, а не до первой встреченной клетки пола. Первая
 * попавшаяся вполне может лежать в закупоренном кармане: по геометрии связь есть,
 * для путей — нет, и форпост оставался недостижим при совершенно живом виде.
 * Четыре луча по сорок клеток читаются служебными трубами — ровно тем, что этот
 * узел и держит.
 */
function connectForpostApproaches(world: World, rx: number, ry: number, w: number, h: number, floorTex: number): number[] {
  const touched: number[] = [];
  const midX = rx + Math.floor(w / 2);
  const midY = ry + Math.floor(h / 2);
  const sides: [number, number, number, number][] = [
    [midX, ry - 1, 0, -1],
    [midX, ry + h, 0, 1],
    [rx - 1, midY, -1, 0],
    [rx + w, midY, 1, 0],
  ];
  for (const [sx, sy, ddx, ddy] of sides) {
    let x = world.wrap(sx);
    let y = world.wrap(sy);
    for (let step = 0; step < FORPOST_APPROACH_REACH; step++) {
      const ci = world.idx(x, y);
      if (!isProtectedCell(world, ci, true)) {
        if (world.cells[ci] !== Cell.FLOOR) {
          world.cells[ci] = Cell.FLOOR;
          world.floorTex[ci] = floorTex;
        }
        world.features[ci] = Feature.NONE;
        world.aptMask[ci] = 0;
        touched.push(ci);
      }
      x = world.wrap(x + ddx);
      y = world.wrap(y + ddy);
    }
  }
  return touched;
}

/**
 * Место для узла обороны.
 *
 * Сперва — ГОТОВАЯ комната подходящего размера. Она уже вписана в этаж, и это
 * решает главное: собственное место ищется как сплошной блок стены, а в прорытом
 * лабиринте такого блока нет ни на одном сиде — поиск проваливается в слепой
 * запасной вариант, и комната штампуется поверх застройки.
 *
 * Расчищать место бульдозером тоже нельзя как правило: на коллекторах есть залы,
 * забитые обстановкой почти сплошь, и поставленная внутрь такого зала комната
 * оказывается отрезанной сколько коридоров к ней ни веди — по самому залу пути
 * не ходят. Готовая комната этой ловушки лишена по построению.
 *
 * Прежний отбор брал что угодно «не меньше пяти на пять», и форпост выходил пять
 * на шесть: взводу негде стоять, камере негде облететь командира. Нижняя граница
 * теперь — САМ РАЗМЕР УЗЛА из таблицы: занимать имеет смысл только ту готовую
 * комнату, в которую взвод и облёт помещаются целиком. Всё, что меньше, дешевле
 * вырыть своё, чем ужимать сцену под чужой простенок.
 */
function placeForpostRoom(
  world: World, nextRoomId: number, cx: number, cy: number, spec: typeof PLOT_ROOMS[string],
): { room: Room; nextRoomId: number; x: number; y: number; w: number; h: number } {
  const candidates = world.rooms.filter(r => {
    if (!r || r.w < spec.w || r.h < spec.h) return false;
    if (r.apartmentId >= 0) return false;
    // Занимать уже объявленную комнату нельзя: её псевдоним — чужая ссылка.
    if (r.defId) return false;
    const d = world.dist(cx, cy, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
    return d >= 5 && d <= 40;
  });

  let room: Room;
  let roomW: number;
  let roomH: number;
  let labX: number;
  let labY: number;

  if (candidates.length > 0) {
    // Самая просторная из подходящих: сцене нужен объём, а не первая попавшаяся.
    room = candidates.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best));
    roomW = room.w;
    roomH = room.h;
    labX = room.x;
    labY = room.y;
    room.type = spec.roomType;
  } else {
    /* Своё место — всегда полного размера.
     *
     * Ужимать было нечем: прежний цикл убавлял сразу обе стороны и сторожил
     * только ширину, поэтому упирался в семь на ТРИ — коридор вместо узла
     * обороны. На всех трёх проверяемых сидах форпост выходил именно таким, и
     * командир уезжал из кадра на восемнадцать клеток, потому что стоять внутри
     * было негде.
     *
     * Сплошного камня под полный размер в прорытом лабиринте нет, поэтому за
     * глухим местом идёт РАСЧИЩАЕМОЕ: чужого жилья и нутра объявленных комнат
     * там нет, а стены и обстановку бульдозер снимает сам — тем же проходом
     * ниже. */
    roomW = spec.w;
    roomH = spec.h;
    const pos = findClearArea(world, cx, cy, roomW, roomH, 5, 40)
      ?? findBulldozableArea(world, cx, cy, roomW, roomH, 5, 40);
    labX = pos ? pos.x : (cx + 15) % W;
    labY = pos ? pos.y : (cy + 15) % W;
    room = stampRoom(world, nextRoomId++, spec.roomType, labX, labY, roomW, roomH, -1);
    // Слепое место может оказаться занятым застройкой — нутро выжигаем явно.
    for (let dy = 0; dy < roomH; dy++) {
      for (let dx = 0; dx < roomW; dx++) {
        const ci = world.idx(world.wrap(labX + dx), world.wrap(labY + dy));
        if (isProtectedCell(world, ci)) continue;
        world.cells[ci] = Cell.FLOOR;
        world.features[ci] = Feature.NONE;
        world.floorTex[ci] = spec.floorTex;
        world.roomMap[ci] = room.id;
      }
    }
  }

  return { room, nextRoomId, x: labX, y: labY, w: roomW, h: roomH };
}

export function generateForpost(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  spawnX: number, spawnY: number,
): { room: Room; nextRoomId: number } {
  const cx = Math.floor(spawnX);
  const cy = Math.floor(spawnY);
  const spec = PLOT_ROOMS['forpost'];
  const placed = placeForpostRoom(world, nextRoomId, cx, cy, spec);
  const room = placed.room;
  const labX = placed.x;
  const labY = placed.y;
  const roomW = placed.w;
  const roomH = placed.h;
  nextRoomId = placed.nextRoomId;

  room.wallTex = spec.wallTex;
  room.floorTex = spec.floorTex;
  protectRoom(world, labX, labY, roomW, roomH, spec.wallTex, spec.floorTex);
  connectForpostApproaches(world, labX, labY, roomW, roomH, spec.floorTex);

  // Личность комнаты объявляется здесь, каким бы путём её ни добыли: по этому
  // псевдониму её находит сцена обороны форпоста, а не по русскому имени.
  applyNamedRoom(room, FORPOST_ANCHOR, {
    type: spec.roomType,
    name: spec.name,
    tags: ['forpost', 'liquidator'],
  });

  // Lamps and furniture
  const rcx = room.x + Math.floor(room.w / 2);
  const rcy = room.y + Math.floor(room.h / 2);
  /* Середина зала — якорь сцены обороны и рабочее место командира, и она обязана
   * оставаться ПРОХОДИМОЙ. Лампа стояла ровно в центре, поэтому цель, к которой
   * сцена возвращает майора, была недостижима для поиска пути: он замирал в семи
   * клетках от середины на всю сцену, а облетать оказывалось некого. Свет тот же,
   * просто по краям осевой линии. */
  world.features[world.idx(rcx - 2, rcy)] = Feature.LAMP;
  world.features[world.idx(rcx + 2, rcy)] = Feature.LAMP;
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.TABLE;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.SHELF;
  world.features[world.idx(room.x + 1, room.y + room.h - 2)] = Feature.LAMP;

  requireSpawnedPlotNpcFromPackage(entities, nextId, 'major_grom', rcx + 0.5, rcy + 0.5, { angle: Math.PI });

  // Spawn 6 liquidator guards
  const guardPositions = [
    [room.x + 2, room.y + room.h - 2],
    [room.x + 5, room.y + room.h - 2],
    [room.x + 1, room.y + 2],
    [room.x + room.w - 2, room.y + 2],
    [room.x + 3, room.y + 1],
    [room.x + room.w - 3, room.y + room.h - 2],
  ];
  const guardWeapons = ['makarov', 'makarov', 'shotgun', 'nailgun', 'ppsh', 'makarov'];
  const guardAmmo: Record<string, { defId: string; count: number }> = {
    makarov: { defId: 'ammo_9mm', count: 12 },
    shotgun: { defId: 'ammo_shells', count: 8 },
    nailgun: { defId: 'ammo_nails', count: 20 },
    ppsh: { defId: 'ammo_9mm', count: 40 },
  };
  // Spawn 2 patrollers out of the 6 liquidators (modify the last 2 guard positions to patrol)
  for (let g = 0; g < guardPositions.length; g++) {
    const gx = guardPositions[g][0];
    const gy = guardPositions[g][1];
    const ci = world.idx(gx, gy);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const rpg = randomRPG(7);
    const maxHp = Math.round(getMaxHp(rpg) * 1.6);
    const nm = randomName(Faction.LIQUIDATOR);
    const wpn = guardWeapons[g % guardWeapons.length];
    const ammo = guardAmmo[wpn] ?? { defId: 'ammo_9mm', count: 12 };

    // Last 2 guards are patrollers
    const isPatroller = g >= 4;
    const goal = isPatroller ? AIGoal.WANDER : AIGoal.IDLE;

    entities.push({
      id: nextId.v++, type: EntityType.NPC,
      x: gx + 0.5, y: gy + 0.5,
      angle: 0, pitch: 0, alive: true, speed: 1.4 + rng() * 0.3,
      sprite: Occupation.HUNTER,
      name: nm.name, firstName: nm.firstName, lastName: nm.lastName, isFemale: nm.female,
      needs: freshNeeds(), hp: maxHp, maxHp,
      money: 30 + Math.floor(rng() * 50),
      ai: { goal, tx: gx, ty: gy, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [
        { defId: wpn, count: 1 },
        { defId: ammo.defId, count: ammo.count },
      ],
      weapon: wpn,
      faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER,
      isTraveler: false,
      questId: -1,
      rpg,
    });
  }

  // Spawn 5-8 Wild NPCs outside the perimeter
  // We find a clear area a bit further away (distance 40 to 80)
  const wildPos = findClearArea(world, cx, cy, 3, 3, 40, 80);
  if (wildPos) {
    const wildCount = 5 + Math.floor(rng() * 4);
    const wildWeapons = ['pipe', 'makarov', 'shotgun', 'knife'];
    for (let w = 0; w < wildCount; w++) {
      const wx = wildPos.x + Math.floor(rng() * 3);
      const wy = wildPos.y + Math.floor(rng() * 3);
      if (world.cells[world.idx(wx, wy)] !== Cell.FLOOR) continue;

      const rpg = randomRPG(7);
      const maxHp = Math.round(getMaxHp(rpg) * 1.2);
      const nm = randomName(Faction.WILD);
      const wpn = wildWeapons[Math.floor(rng() * wildWeapons.length)];

      entities.push({
        id: nextId.v++, type: EntityType.NPC,
        x: wx + 0.5, y: wy + 0.5,
        angle: 0, pitch: 0, alive: true, speed: 1.2 + rng() * 0.4,
        sprite: Occupation.HUNTER,
        name: nm.name, firstName: nm.firstName, lastName: nm.lastName, isFemale: nm.female,
        needs: freshNeeds(), hp: maxHp, maxHp,
        money: 10 + Math.floor(rng() * 20),
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        inventory: [
          { defId: wpn, count: 1 },
          { defId: 'ammo_9mm', count: wpn === 'makarov' ? 6 : 0 },
          { defId: 'ammo_shells', count: wpn === 'shotgun' ? 4 : 0 },
        ],
        weapon: wpn,
        faction: Faction.WILD, occupation: Occupation.HUNTER,
        isTraveler: false,
        questId: -1,
        rpg,
      });
    }
  }

  // Drop some supplies
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: room.x + room.w - 2 + 0.5, y: room.y + room.h - 2 + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory: [{ defId: 'ammo_9mm', count: 6 }, { defId: 'bandage', count: 2 }],
  });

  return { room, nextRoomId };
}
