import { DESIGN_NPC_HOME_FLOOR_KEY, JANITOR_DEPOT, PUMP_RESCUE_ROOM, nextServiceEntityId, SERVICE_FLOOR_BASE_FLOOR, setFeature } from './index';
/* ── Design z: service_floor — lift machines and staff routes ─ */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  QuestType,
  W,
  ZoneFaction,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { Spr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';


export const BORIS_DEF: PlotNpcDef = {
  name: 'Борис Лифтёр',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.MECHANIC,
  sprite: Occupation.MECHANIC,
  hp: 170, maxHp: 170, money: 95, speed: 1.0,
  inventory: [
    { defId: 'wrench', count: 1 },
    { defId: 'lift_scheme', count: 1 },
    { defId: 'fuse', count: 1 },
  ],
  talkLines: [
    'Машина С-15 тянет кабину честно, а маршрут врёт. Если поменять предохранители, лифт хотя бы перестанет выбирать нижний этаж наугад.',
    'Я чиню не лифт целиком. Только маленькое право доехать туда, куда нажал.',
    'Служебный ключ не открывает мир. Он открывает две двери, за которые я потом отвечаю.',
  ],
  talkLinesPost: [
    'Маршрут держит. Не навсегда, но достаточно, чтобы успеть пожалеть о поездке.',
    'Если кнопка молчит, слушай реле. Реле врёт тише человека.',
  ],
};

export const NADYA_DEF: PlotNpcDef = {
  name: 'Надя Ключница',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 115, maxHp: 115, money: 65, speed: 0.95,
  inventory: [
    { defId: 'inspection_mirror', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'cigs', count: 1 },
  ],
  talkLines: [
    'Мастер-ключ тут не главный. Главный тот, кто знает, какие две двери в ведомости, а какие придумали жильцы.',
    'Кладовая моя. Возьмёшь без спроса — шум пойдёт по трубам раньше тебя.',
    'Вентиляция ведёт быстро, если не боишься того, что питается светом.',
  ],
  talkLinesPost: [
    'Теперь ты знаешь малый круг. За большой круг людей списывают.',
    'Не показывай допуск в Министерстве. Они спросят, почему он полезный.',
  ],
};

export const ROMA_DEF: PlotNpcDef = {
  name: 'Рома Щитовой',
  isFemale: false,
  faction: Faction.SCIENTIST,
  occupation: Occupation.ELECTRICIAN,
  sprite: Occupation.ELECTRICIAN,
  hp: 125, maxHp: 125, money: 80, speed: 1.0,
  inventory: [
    { defId: 'relay_diagram', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'flashlight', count: 1 },
  ],
  talkLines: [
    'Свет можно вернуть на один маршрут. На все нельзя: дом решит, что мы вызываем его наружу.',
    'Ламповый ест яркое. Поэтому я чиню темноту аккуратно.',
    'Если щитовая хлопнет во время самосбора, двери станут мнением.',
  ],
  talkLinesPost: [
    'Один контур горит. Второй пусть стыдится в темноте.',
    'Не стой под новой лампой слишком долго. Она теперь пахнет тобой.',
  ],
};

export const CLERK_DEF: PlotNpcDef = {
  name: 'Павел Без Пропуска',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 100, maxHp: 100, money: 40, speed: 0.9,
  inventory: [
    { defId: 'elevator_override_form', count: 1 },
    { defId: 'official_permit_slip', count: 1 },
  ],
  talkLines: [
    'Меня заперли снаружи моего же журнала. Там рейдовая очередь, и она уже почти дошла до рынка.',
    'Переставь форму обхода — рейд пойдёт первым в пустой коридор, а не к людям.',
    'Это не спасение. Это перенос ошибки на адрес, где пока никто не расписался.',
  ],
  talkLinesPost: [
    'Журнал поменял очередь. Теперь он делает вид, что сам так решил.',
    'Если спросят, меня тут не было. Я всё ещё заперт, просто с другой стороны.',
  ],
};

export const MITKA_DEF: PlotNpcDef = {
  name: 'Митя Насосный',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.LOCKSMITH,
  sprite: Occupation.LOCKSMITH,
  hp: 135, maxHp: 135, money: 55, speed: 0.98,
  inventory: [
    { defId: 'valve_tag', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ],
  talkLines: [
    'Насос держит пол на честном слове. Если дать обратный напор, коридор станет мокрым, зато угри уйдут в трубу.',
    'Я не герой. Я просто знаю, какой вентиль не трогать во время сирены.',
    'Вытащи меня до следующего щелчка, и бирку давления заберешь без рапорта.',
  ],
  talkLinesPost: [
    'Западный стояк дышит ровно. Восточный врёт, но хотя бы по расписанию.',
    'Если щиток воды ругается, не спорь с ним лицом.',
  ],
};

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'service_liftmaster_boris', BORIS_DEF, [
  {
    id: 'service_fix_lift_machine',
    giverId: getPlotNpcNumericId('service_liftmaster_boris')!,
    type: QuestType.FETCH,
    desc: 'Борис: «Три предохранителя в машинный зал С-15. Починим не весь лифт, а маленькое право доехать по кнопке.»',
    targetItem: 'fuse', targetCount: 3,
    rewardItem: 'lift_scheme', rewardCount: 1,
    extraRewards: [{ defId: 'gear', count: 1 }, { defId: 'elevator_override_form', count: 1 }],
    relationDelta: 14, xpReward: 90, moneyReward: 85,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'service_janitor_nadya', NADYA_DEF, [
  {
    id: 'service_steal_master_key',
    giverId: getPlotNpcNumericId('service_janitor_nadya')!,
    type: QuestType.VISIT,
    desc: 'Надя: «Зайди в кладовую С-15 и посмотри ведомость малого круга. Мастер-ключ тут означает ровно две двери.»',
    targetRoomDefId: JANITOR_DEPOT,
    rewardItem: 'door_kit', rewardCount: 1,
    extraRewards: [{ defId: 'inspection_mirror', count: 1 }],
    relationDelta: 10, xpReward: 60, moneyReward: 45,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'service_electrician_roma', ROMA_DEF, [
  {
    id: 'service_restore_lights',
    giverId: getPlotNpcNumericId('service_electrician_roma')!,
    type: QuestType.FETCH,
    desc: 'Рома: «Неси релейную схему. Поднимем свет на одном маршруте, а не устроим ламповым столовую.»',
    targetItem: 'relay_diagram', targetCount: 1,
    rewardItem: 'flashlight', rewardCount: 1,
    extraRewards: [{ defId: 'gasmask_filter', count: 1 }, { defId: 'fuse', count: 1 }],
    relationDelta: 12, xpReward: 75, moneyReward: 70,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'service_locked_out_clerk', CLERK_DEF, [
  {
    id: 'service_reroute_raid',
    giverId: getPlotNpcNumericId('service_locked_out_clerk')!,
    type: QuestType.FETCH,
    desc: 'Павел: «Бланк обхода в диспетчерскую С-15. Рейдовую очередь отправят в пустой коридор, если печать пройдет у диспетчера.»',
    targetItem: 'elevator_override_form', targetCount: 1,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 12 }],
    relationDelta: 8, xpReward: 80, moneyReward: 95,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'service_trapped_pump_worker', MITKA_DEF, [
  {
    id: 'service_rescue_pump_worker',
    giverId: getPlotNpcNumericId('service_trapped_pump_worker')!,
    type: QuestType.VISIT,
    desc: 'Митя: «Западная насосная ниша С-15 захлопнулась. Вытащи меня из стояка, пока обратный напор не позвал трубных.»',
    targetRoomDefId: PUMP_RESCUE_ROOM,
    rewardItem: 'valve_tag', rewardCount: 1,
    extraRewards: [{ defId: 'sealant_tube', count: 1 }, { defId: 'gasmask_filter', count: 1 }],
    relationDelta: 9, xpReward: 85, moneyReward: 60,
  },
]);

export function spawnServicePumpRescue(world: World, entities: Entity[], room: Room): void {
  if (entities.some(entity => entity.id === getPlotNpcNumericId('service_trapped_pump_worker'))) return;
  const nextId = { v: nextServiceEntityId(entities) };
  const mitkaId = spawnPlotNpc(
    entities,
    nextId,
    'service_trapped_pump_worker',
    MITKA_DEF,
    room.x + 6,
    room.y + 5,
    0,
  );
  addServiceContainer(world, room, room.x + room.w - 5, room.y + 4, ContainerKind.TOOL_LOCKER, 'Аварийный ящик западного стояка С-15', 'owner', [
    { defId: 'valve_tag', count: 1 },
    { defId: 'wire_coil', count: 1 },
    { defId: 'sealant_tube', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
  ], mitkaId, MITKA_DEF.name, ['service_floor', 'pressure', 'rescue', 'tools']);
  dropItems(world, entities, nextId, room, ['valve_tag', 'wire_coil', 'sealant_tube']);
  spawnMonsterPack(world, entities, nextId, room.x + room.w - 11, room.y + 6, [
    MonsterKind.TUBE_EEL,
    MonsterKind.LOTOCHNIK,
    MonsterKind.PAUPSINA,
  ]);
}

export function seedServiceBasinLoot(world: World, entities: Entity[], basins: readonly Room[]): void {
  const nextId = { v: nextServiceEntityId(entities) };
  const basinDrops: readonly string[][] = [
    ['gasmask_filter', 'sealant_tube'],
    ['wire_coil', 'fuse'],
    ['valve_tag', 'sealant_tube'],
    ['ammo_energy', 'gasmask_filter'],
  ];
  const basinMonsters: readonly MonsterKind[][] = [
    [MonsterKind.TUBE_EEL, MonsterKind.LOTOCHNIK],
    [MonsterKind.TRUBNYY_AVTOMAT, MonsterKind.RZHAVNIK],
    [MonsterKind.PAUPSINA, MonsterKind.POLZUN],
    [MonsterKind.VODYANOY_KOSHMAR, MonsterKind.TUBE_EEL],
  ];
  for (let i = 0; i < basins.length; i++) {
    const basin = basins[i];
    dropItems(world, entities, nextId, basin, basinDrops[i % basinDrops.length]);
    spawnMonsterPack(
      world,
      entities,
      nextId,
      basin.x + 5,
      basin.y + 5,
      basinMonsters[i % basinMonsters.length],
    );
  }
}

export function isServiceAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    (entity.name?.startsWith('Служебный этаж: ремонтник ') ?? false);
}

export function serviceTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>([
    [ZoneFaction.CITIZEN, []],
    [ZoneFaction.LIQUIDATOR, []],
    [ZoneFaction.CULTIST, []],
    [ZoneFaction.SCIENTIST, []],
    [ZoneFaction.WILD, []],
  ]);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR) continue;
    const list = cells.get(world.factionControl[i] as TerritoryOwner);
    if (list) list.push(i);
  }
  return cells;
}

export function alignServiceFloorAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = serviceTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isServiceAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 127 + offset * 421) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, x + 0.5, y + 0.5, {
    angle,
  });
  return npc.id;
}

export function addServiceContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  ownerNpcId: number | undefined,
  ownerName: string | undefined,
  tags: string[],
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: SERVICE_FLOOR_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(i => ({ ...i })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    access,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.FRIDGE ? Feature.SINK : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function dropItems(world: World, entities: Entity[], nextId: { v: number }, room: Room, itemIds: string[]): void {
  for (let n = 0; n < itemIds.length; n++) {
    const x = room.x + 2 + ((n * 5) % Math.max(1, room.w - 4));
    const y = room.y + 2 + ((n * 3) % Math.max(1, room.h - 4));
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: x + 0.5, y: y + 0.5, angle: 0, pitch: 0,
      alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: itemIds[n], count: 1 }],
    });
  }
}

export function spawnMonsterPack(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  kinds: MonsterKind[],
): void {
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const def = MONSTERS[kind];
    if (!def) continue;
    const mx = x + (i % 2) * 3 - 1;
    const my = y + Math.floor(i / 2) * 3 - 1;
    const ci = world.idx(mx, my);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const zone = world.zones[world.zoneMap[ci]];
    const zoneLevel = zone?.level ?? 3;
    const hp = scaleMonsterHp(def.hp, zoneLevel);
    const monster: Entity = {
      id: nextId.v++, type: EntityType.MONSTER,
      x: mx + 0.5, y: my + 0.5,
      angle: 0, pitch: 0,
      alive: true,
      speed: scaleMonsterSpeed(def.speed, zoneLevel),
      sprite: def.sprite,
      hp, maxHp: hp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: randomRPG(zoneLevel),
    };
    entities.push(monster);
  }
}

