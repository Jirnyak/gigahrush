import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  RoomType,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { REGISTRY_MORGUE_ROUTE_ID, REGISTRY_MORGUE_BASE_FLOOR, CORPSE_NUMBER_TAG_ITEM, NextId, MorgueRecordDomain, MORGUE_RECORD_DOMAINS } from "./meta";
import { setCellFeature, addDrop } from "./geometry";

export function dressMorgueSupportRoom(world: World, room: Room, seed: number): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      setCellFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
      setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
      setCellFeature(world, room.x + Math.floor(room.w / 2), room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setCellFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
      setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
      break;
    case RoomType.MEDICAL:
      setCellFeature(world, room.x + 2, room.y + Math.floor(room.h / 2), Feature.BED);
      setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.APPARATUS);
      break;
    case RoomType.PRODUCTION:
      setCellFeature(world, room.x + 2, room.y + 2, Feature.MACHINE);
      setCellFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.APPARATUS);
      break;
    case RoomType.OFFICE:
      setCellFeature(world, room.x + 2, room.y + 2, Feature.DESK);
      setCellFeature(world, room.x + 3, room.y + 3, Feature.CHAIR);
      setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
      break;
    case RoomType.COMMON:
      setCellFeature(world, room.x + 2, room.y + 2, Feature.TABLE);
      setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.CHAIR);
      break;
    case RoomType.STORAGE:
    default:
      for (let dx = 2; dx < room.w - 2; dx += 4) setCellFeature(world, room.x + dx, room.y + 2, Feature.SHELF);
      break;
  }
  if (seed % 2 === 0) setCellFeature(world, room.x + room.w - 2, room.y + room.h - 2, Feature.LAMP);
}

export function dressDrawerRoom(world: World, room: Room, seed: number): void {
  for (let dx = 2; dx < room.w - 2; dx += 4) {
    setCellFeature(world, room.x + dx, room.y + 1, Feature.SHELF);
    setCellFeature(world, room.x + dx, room.y + room.h - 2, Feature.SHELF);
  }
  setCellFeature(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), Feature.BED);
  if (seed % 3 === 0) setCellFeature(world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
}

export function nextMorgueContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(container => container.id === id)) id++;
  return id;
}

export function drawerInventory(domain: MorgueRecordDomain, order: number): WorldContainer['inventory'] {
  if (order % 4 === 0) return [];
  const def = MORGUE_RECORD_DOMAINS[domain];
  return [{ defId: def.items[order % def.items.length], count: 1 }];
}

export function spawnMorgueNpc(
  entities: Entity[],
  nextId: NextId,
  _def: PlotNpcDef,
  plotNpcId: string,
  x: number,
  y: number,
  canGiveQuest = true,
  weapon?: string,
): Entity {
  return requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle: rng() * Math.PI * 2,
    weapon,
    canGiveQuest,
    isTraveler: false,
    aiTarget: { x: 0, y: 0 },
  });
}

export function spawnMorgueMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  x: number,
  y: number,
  kind: MonsterKind,
  name: string,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  entities.push({
    id: nextId.v++, type: EntityType.MONSTER,
    x: x + 0.5, y: y + 0.5,
    angle: rng() * Math.PI * 2, pitch: 0,
    alive: true, speed: def.speed,
    sprite: monsterSpr(kind),
    name,
    hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  });
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 3, 0.22, 7100 + kind, 82, 88, 94, false);
}

export function addMorgueContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  tags: string[],
  faction: Faction,
  owner?: Entity,
): void {
  world.addContainer({
    id: world.containers.length + 1,
    x,
    y,
    z: REGISTRY_MORGUE_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: Math.max(6, inventory.length + 3),
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction,
    access,
    lockDifficulty: access === 'locked' || access === 'owner' ? 4 : undefined,
    discovered: true,
    tags: [REGISTRY_MORGUE_ROUTE_ID, 'morgue', ...tags],
  });
}

export function seedRegistryMorgueContainers(
  world: World,
  rooms: {
    tagRoom: Room;
    cold: Room;
    ledger: Room;
    contaminated: Room;
  },
  npcs: {
    faina: Entity;
    stepan: Entity;
    sanitar: Entity;
    ira: Entity;
  },
): void {
  addMorgueContainer(
    world, rooms.tagRoom,
    rooms.tagRoom.x + 2, rooms.tagRoom.y + 2,
    ContainerKind.FILING_CABINET,
    'Бирочная стойка N-16',
    'faction',
    [
      { defId: 'container_key_label', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
    ],
    ['record_correction', 'identity', 'paper', 'morgue_theft'],
    Faction.SCIENTIST,
    npcs.faina,
  );

  addMorgueContainer(
    world, rooms.cold,
    rooms.cold.x + 2, rooms.cold.y + 5,
    ContainerKind.METAL_CABINET,
    'Холодная картотека без номера',
    'owner',
    [
      { defId: 'missing_record_file', count: 1 },
      { defId: CORPSE_NUMBER_TAG_ITEM, count: 1 },
      { defId: 'container_key_label', count: 1 },
      { defId: 'emergency_roster', count: 1 },
    ],
    ['body_storage', 'identity', 'contaminated', 'morgue_theft'],
    Faction.CITIZEN,
    npcs.stepan,
  );

  addMorgueContainer(
    world, rooms.ledger,
    rooms.ledger.x + rooms.ledger.w - 3, rooms.ledger.y + 2,
    ContainerKind.SAFE,
    'Сейф свидетельств о смерти',
    'locked',
    [
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'official_quarantine_clearance', count: 1 },
      { defId: 'archive_access_permit', count: 1 },
    ],
    ['false_death', 'death_record', 'certificate', 'archive_hook'],
    Faction.SCIENTIST,
    npcs.faina,
  );

  addMorgueContainer(
    world, rooms.contaminated,
    rooms.contaminated.x + 3, rooms.contaminated.y + rooms.contaminated.h - 3,
    ContainerKind.MEDICAL_CABINET,
    'Опечатанный медицинский шкаф Крутова',
    'owner',
    [
      { defId: 'sanitary_kit', count: 1 },
      { defId: 'antibiotic', count: 1 },
      { defId: 'morphine_ampoule', count: 1 },
      { defId: 'bandage', count: 2 },
    ],
    ['quarantine', 'medical', 'scarcity', 'morgue_theft'],
    Faction.LIQUIDATOR,
    npcs.sanitar,
  );

  addMorgueContainer(
    world, rooms.ledger,
    rooms.ledger.x + 2, rooms.ledger.y + rooms.ledger.h - 2,
    ContainerKind.SECRET_STASH,
    'Папка Иры под пустым ящиком',
    'secret',
    [
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'tea', count: 1 },
    ],
    ['relative', 'name', 'secret'],
    Faction.CITIZEN,
    npcs.ira,
  );
}

export function seedRegistryMorgueReadables(world: World, entities: Entity[], nextId: NextId, rooms: {
  reception: Room;
  tagRoom: Room;
  cold: Room;
  ledger: Room;
  contaminated: Room;
}): void {
  addDrop(
    entities,
    nextId,
    rooms.reception.x + 3,
    rooms.reception.y + rooms.reception.h - 2,
    'note',
    1,
    'Прием ведется по двум спискам: кто умер и кто может это доказать. Несовпадение списков считать очередью.',
  );
  addDrop(
    entities,
    nextId,
    rooms.tagRoom.x + rooms.tagRoom.w - 3,
    rooms.tagRoom.y + 3,
    'note',
    1,
    'Бирка N-16 совпала с живой очередью Райсовета. До выяснения считать фамилию холодной и не выдавать ей воду.',
  );
  addDrop(
    entities,
    nextId,
    rooms.cold.x + rooms.cold.w - 4,
    rooms.cold.y + rooms.cold.h - 2,
    'siren_instruction',
    1,
  );
  addDrop(
    entities,
    nextId,
    rooms.ledger.x + 4,
    rooms.ledger.y + rooms.ledger.h - 2,
    'note',
    1,
    'Свидетельство о смерти открывает архив быстрее пропуска, если подпись поставлена до вопроса. После вопроса проверяющий смотрит на того, кто принес бумагу.',
  );
  addDrop(
    entities,
    nextId,
    rooms.contaminated.x + rooms.contaminated.w - 4,
    rooms.contaminated.y + 3,
    'note',
    1,
    'Если человек сам просит свою бирку, проверьте дистанцию. Нелюдь любит чужой порядок и ближний разговор.',
  );

  stampSurfaceSplat(world, rooms.ledger.x + 5, rooms.ledger.y + 5, 0.5, 0.5, 2, 0.18, 7161, 35, 35, 42, false);
  stampSurfaceSplat(world, rooms.cold.x + 7, rooms.cold.y + 5, 0.5, 0.5, 4, 0.2, 7162, 120, 140, 150, false);
  stampSurfaceSplat(world, rooms.tagRoom.x + 5, rooms.tagRoom.y + 5, 0.5, 0.5, 2, 0.18, 7163, 50, 45, 32, false);
}

