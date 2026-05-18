/* ── Проверочный коридор документов — Ministry document gate ─── */

import {
  W, Cell, ContainerKind, DoorState, EntityType, Faction, Feature, FloorLevel,
  MonsterKind, Occupation, QuestType, RoomType, Tex, AIGoal,
  type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { freshNeeds } from '../../data/catalog';
import { chernobogDocketGateItems } from '../../data/chernobog_docket';
import {
  type NextId, addItemDrop, setFeature, spawnAdminMonster, spawnAdminNpc, spawnNamedCivilian,
} from './admin_common';
import { carveCorridor, findClearArea, protectRoom, stampRoom } from '../shared';
import { genLog } from '../log';
import { spawnChernobogDocketHandlers } from './chernobog_archive_docket';

const GATE_ROOM_NAME = 'Проверочный коридор N3';
const GATE_W = 19;
const GATE_H = 9;

const GALINA_DEF: PlotNpcDef = {
  name: 'Галина Окошечная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 120, maxHp: 120, money: 75, speed: 0.75,
  inventory: [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'note', count: 3 },
    { defId: 'tea', count: 1 },
  ],
  talkLines: [
    'Окно N3 принимает живых по документу, мертвых по акту.',
    'Официальный корешок пропуска кладите сухой стороной вверх.',
    'С документом проход тихий. Без документа проход тоже бывает, но потом шумит журнал.',
    'Если у вас подделка, не показывайте ее мне. У меня печать с памятью.',
  ],
  talkLinesPost: [
    'Коридор признал вас временно проходящим.',
    'Ключ не право. Ключ - это просьба двери не спорить.',
  ],
};

const ARKADIY_DEF: PlotNpcDef = {
  name: 'Аркадий Подложный',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 95, maxHp: 95, money: 45, speed: 0.85,
  inventory: [
    { defId: 'forged_permit_slip', count: 1 },
    { defId: 'fake_pass', count: 1 },
    { defId: 'ink_bottle', count: 1 },
  ],
  talkLines: [
    'Я не открываю дверь. Я помогаю двери ошибиться.',
    'Кованый корешок подойдет, если держать его уверенно и не давать печатееду нюхать.',
    'Поддельная бумага дешевле очереди, но дороже тишины после нее.',
  ],
  talkLinesPost: [
    'Если спросят, кто вас пропустил, называйте стену.',
    'Бумага прошла. Теперь главное - чтобы вы прошли быстрее бумаги.',
  ],
};

const BORIS_DEF: PlotNpcDef = {
  name: 'Борис Безчековый',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 160, maxHp: 160, money: 160, speed: 0.7,
  inventory: [
    { defId: 'ration_stamp_pad', count: 1 },
    { defId: 'container_key_label', count: 1 },
    { defId: 'cigs', count: 2 },
  ],
  talkLines: [
    'Никаких взяток. Только ускорительный сбор без квитанции.',
    'Сто двадцать рублей делают очередь короче ровно на одну дверь.',
    'Деньги не заменяют документ. Они заменяют вопрос, где документ.',
  ],
  talkLinesPost: [
    'Сбор принят. Если кто спросит, вы стояли здесь вчера.',
    'Дверь любит наличные меньше бумаги, но быстрее.',
  ],
};

registerSideQuest('galina_okoshechnaya', GALINA_DEF, [
  {
    id: 'document_gate_official_slip',
    giverNpcId: 'galina_okoshechnaya',
    type: QuestType.FETCH,
    desc: 'Галина Окошечная: «Официальный корешок пропуска - и проверочный коридор N3 откроется без записи в журнале.»',
    targetItem: 'official_permit_slip', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'tea', count: 1 }],
    relationDelta: 14, xpReward: 70, moneyReward: 35,
  },
]);

registerSideQuest('arkadiy_podlozhny', ARKADIY_DEF, [
  {
    id: 'document_gate_forged_slip',
    giverNpcId: 'arkadiy_podlozhny',
    type: QuestType.FETCH,
    desc: 'Аркадий Подложный: «Кованый корешок пропуска проведет через N3, если не кормить им печатееда.»',
    targetItem: 'forged_permit_slip', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 1 }],
    relationDelta: -4, xpReward: 65, moneyReward: 20,
  },
]);

registerSideQuest('boris_bezchekovy', BORIS_DEF, [
  {
    id: 'document_gate_quiet_bribe',
    giverNpcId: 'boris_bezchekovy',
    type: QuestType.FETCH,
    desc: 'Борис Безчековый: «Сто двадцать рублей ускорительного сбора - и дверь считает вас вчерашним посетителем.»',
    targetItem: 'money', targetCount: 120,
    rewardItem: 'key', rewardCount: 1,
    relationDelta: -6, xpReward: 45, moneyReward: 0,
  },
]);

function createGateRoom(world: World, nextRoomId: number, spawnX: number, spawnY: number): Room | null {
  const cx = Math.floor(spawnX);
  const cy = Math.floor(spawnY);
  const pos = findClearArea(world, cx, cy, GATE_W, GATE_H, 35, 130)
    ?? findClearArea(world, cx, cy, GATE_W, GATE_H, 0, Math.floor(W / 4));
  if (!pos) {
    console.warn(`[DOCUMENT_GATE] failed to place ${GATE_ROOM_NAME}`);
    return null;
  }

  const liftCells: number[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT) liftCells.push(i);
  }

  const room = stampRoom(world, nextRoomId, RoomType.OFFICE, pos.x, pos.y, GATE_W, GATE_H, -1);
  room.name = GATE_ROOM_NAME;
  room.wallTex = Tex.MARBLE;
  room.floorTex = Tex.F_MARBLE_TILE;
  protectRoom(world, room.x, room.y, room.w, room.h, Tex.MARBLE, Tex.F_MARBLE_TILE);

  for (const ci of liftCells) {
    if (world.cells[ci] !== Cell.LIFT) world.cells[ci] = Cell.LIFT;
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.floorTex[ci] = Tex.F_MARBLE_TILE;
      world.wallTex[ci] = Tex.MARBLE;
    }
  }
  return room;
}

function findNearbyFloor(world: World, sx: number, sy: number, roomId: number): { x: number; y: number } | null {
  for (let r = 5; r <= 70; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = world.wrap(sx + dx);
        const y = world.wrap(sy + dy);
        const ci = world.idx(x, y);
        if (world.cells[ci] !== Cell.FLOOR) continue;
        if (world.aptMask[ci] || world.roomMap[ci] === roomId) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function addExteriorDoor(world: World, room: Room, side: 'west' | 'east', y: number): void {
  const dx = side === 'west' ? -1 : 1;
  const doorX = side === 'west' ? room.x - 1 : room.x + room.w;
  const outsideX = world.wrap(doorX + dx);
  const doorIdx = world.idx(doorX, y);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_WOOD;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.CLOSED,
    roomA: room.id,
    roomB: -1,
    keyId: '',
    timer: 0,
  });
  if (!room.doors.includes(doorIdx)) room.doors.push(doorIdx);

  const outIdx = world.idx(outsideX, y);
  world.cells[outIdx] = Cell.FLOOR;
  world.floorTex[outIdx] = Tex.F_MARBLE_TILE;
  world.roomMap[outIdx] = -1;
  world.aptMask[outIdx] = 0;

  const target = findNearbyFloor(world, outsideX, y, room.id);
  if (target) carveCorridor(world, outsideX, y, target.x, target.y);
}

function addLockedCheckGate(world: World, room: Room, gateX: number, doorY: number): void {
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    const ci = world.idx(gateX, y);
    world.features[ci] = Feature.NONE;
    world.cells[ci] = Cell.WALL;
    world.wallTex[ci] = Tex.MARBLE;
  }

  const doorIdx = world.idx(gateX, doorY);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_METAL;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.LOCKED,
    roomA: room.id,
    roomB: room.id,
    keyId: 'key',
    timer: 0,
  });
  if (!room.doors.includes(doorIdx)) room.doors.push(doorIdx);
}

function addGateContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  ownerNpcId: number,
  ownerName: string,
): void {
  const id = world.containers.reduce((mx, c) => Math.max(mx, c.id), 0) + 1;
  const container: WorldContainer = {
    id,
    x,
    y,
    floor: FloorLevel.MINISTRY,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: ContainerKind.CASHBOX,
    name: 'Касса ускорительного сбора N3',
    inventory: [
      { defId: 'key', count: 1 },
      { defId: 'forged_permit_slip', count: 1 },
      { defId: 'stolen_archive_card', count: 1 },
      ...chernobogDocketGateItems(),
    ],
    capacitySlots: 5,
    ownerNpcId,
    ownerName,
    faction: Faction.CITIZEN,
    access: 'owner',
    discovered: true,
    tags: ['evidence', 'cult', 'archive', 'chernobog', 'witness', 'ministry', 'document_gate', 'theft'],
  };
  world.addContainer(container);
}

function spawnGateGuard(entities: Entity[], nextId: NextId, x: number, y: number): number {
  const guardId = nextId.v;
  spawnNamedCivilian(
    entities, nextId, 'Инспектор Сухарь', false,
    x, y, Occupation.HUNTER, Faction.LIQUIDATOR,
    [
      { defId: 'key', count: 1 },
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 8 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    'makarov',
  );
  return guardId;
}

function spawnQueueWitness(entities: Entity[], nextId: NextId, x: number, y: number): void {
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: x + 0.5, y: y + 0.5,
    angle: Math.PI, pitch: 0,
    alive: true, speed: 0.75, sprite: Occupation.HOUSEWIFE,
    name: 'Зина Очевидная', isFemale: true,
    needs: freshNeeds(), hp: 80, maxHp: 80, money: 12,
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: 'neighbor_complaint', count: 1 }, { defId: 'bread', count: 1 }],
    faction: Faction.CITIZEN, occupation: Occupation.HOUSEWIFE,
    questId: -1,
  });
}

export function generateDocumentGate(
  world: World, nextRoomId: number, entities: Entity[], nextId: NextId, spawnX: number, spawnY: number,
): { nextRoomId: number } {
  const room = createGateRoom(world, nextRoomId, spawnX, spawnY);
  if (!room) return { nextRoomId };

  const cy = room.y + Math.floor(room.h / 2);
  const gateX = room.x + 10;
  addExteriorDoor(world, room, 'west', cy);
  addExteriorDoor(world, room, 'east', cy);
  addLockedCheckGate(world, room, gateX, cy);

  for (let dx = 2; dx < gateX - room.x - 2; dx++) {
    setFeature(world, room.x + dx, room.y + 2, Feature.DESK);
  }
  for (let dy = 1; dy < room.h - 1; dy += 2) {
    setFeature(world, room.x + 1, room.y + dy, Feature.SHELF);
    setFeature(world, room.x + room.w - 2, room.y + dy, Feature.SHELF);
  }
  setFeature(world, room.x + 3, cy + 2, Feature.CHAIR);
  setFeature(world, room.x + 6, cy + 2, Feature.CHAIR);
  setFeature(world, gateX - 1, cy - 1, Feature.LAMP);
  setFeature(world, gateX + 3, cy - 2, Feature.LAMP);
  world.wallTex[world.idx(room.x + 5, room.y - 1)] = Tex.POSTER_BASE + 17;
  world.wallTex[world.idx(gateX + 4, room.y + room.h)] = Tex.PORTRAIT_BASE + 27;

  addItemDrop(entities, nextId, room.x + 2, room.y + room.h - 2, 'blank_form', 1);
  addItemDrop(entities, nextId, room.x + 4, room.y + room.h - 2, 'note', 1);
  addItemDrop(entities, nextId, gateX + 2, room.y + 2, 'temp_pass', 1);
  addItemDrop(entities, nextId, gateX + 4, room.y + 2, 'elevator_access_order', 1);
  addItemDrop(entities, nextId, gateX + 2, room.y + room.h - 3, 'chernobog_external_cell_index', 1);
  addItemDrop(entities, nextId, gateX + 4, room.y + room.h - 3, 'chernobog_redacted_central_note', 1);

  spawnAdminNpc(entities, nextId, GALINA_DEF, 'galina_okoshechnaya', room.x + 3, room.y + 1);
  spawnAdminNpc(entities, nextId, ARKADIY_DEF, 'arkadiy_podlozhny', room.x + 4, cy + 2);
  spawnAdminNpc(entities, nextId, BORIS_DEF, 'boris_bezchekovy', gateX - 2, room.y + 1);
  spawnChernobogDocketHandlers(entities, nextId, room, gateX, cy);
  const guardId = spawnGateGuard(entities, nextId, gateX - 1, cy + 2);
  spawnQueueWitness(entities, nextId, room.x + 2, cy + 2);

  addGateContainer(world, room, gateX - 2, cy + 2, guardId, 'Инспектор Сухарь');
  spawnAdminMonster(world, entities, nextId, gateX + 4, cy + 2, MonsterKind.PARAGRAPH);

  genLog(`[DOCUMENT_GATE] ${room.name} at (${room.x}, ${room.y}) room #${room.id}`);
  return { nextRoomId: room.id + 1 };
}
