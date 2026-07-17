import { getPlotNpcNumericId } from '../../data/npc_packages';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  QuestType,
  W,
  type Entity,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { HUMAN_TERRITORY_OWNERS, factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { registerRouteCue } from '../../systems/route_cues';
import { randomRPG } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { DESIGN_NPC_HOME_FLOOR_KEY, DESIGN_FLOOR_ID, PRODUCTION_BELT_ROUTE_Z, PRODUCTION_BELT_BASE_FLOOR, CONTENT_TAG, PRODUCTION_BELT_PIPELINE_DEPENDENCIES, FOREMAN_DEF, MECHANIC_DEF, WORKER_DEF, AUDITOR_DEF } from "./meta";
import { ProductionBeltLineDef, ProductionBeltRouteState, ProductionBeltRooms, setFeature, roomCell, cloneInventory, roomCellForActor, dropItems, uniqueTags } from "./geometry";

export interface ProductionBeltLineState {
  id: string;
  factoryId: string;
  roomId: number;
  outputContainerId: number;
  state: ProductionBeltLineDef['state'];
  dependencyIds: string[];
}

export let contentRegistered = false;

export function registerProductionBeltContent(): void {
  if (contentRegistered) return;
  contentRegistered = true;

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'prod_foreman_galina', FOREMAN_DEF, [{
    id: 'prod_worker_escort',
    giverId: getPlotNpcNumericId('prod_foreman_galina')!,
    type: QuestType.TALK,
    desc: 'Галина: «Найди Егора {dir} и доведи до проходной хотя бы словами. Если он пропадет, смену закроют вместе с людьми.»',
    targetNpcId: getPlotNpcNumericId('prod_worker_egor')!,
    rewardItem: 'water',
    rewardCount: 2,
    extraRewards: [{ defId: 'bread', count: 2 }],
    relationDelta: 10,
    xpReward: 50,
    moneyReward: 45,
  }]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'prod_mechanic_rustam', MECHANIC_DEF, [{
    id: 'prod_restore_line',
    giverId: getPlotNpcNumericId('prod_mechanic_rustam')!,
    type: QuestType.FETCH,
    desc: 'Рустам: «Две шестерни в восстановительный вал. Линия снова даст комплект, а не искры.»',
    targetItem: 'gear',
    targetCount: 2,
    rewardItem: 'door_kit',
    rewardCount: 1,
    extraRewards: [{ defId: 'wrench', count: 1 }],
    relationDelta: 14,
    xpReward: 70,
    moneyReward: 70,
  }]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'prod_worker_egor', WORKER_DEF, [{
    id: 'prod_steal_crate',
    giverId: getPlotNpcNumericId('prod_worker_egor')!,
    type: QuestType.FETCH,
    desc: 'Егор: «Вытащи энергоячейку из выходного шкафа зарядки. Без нее опасную смену остановит ревизия, а не похороны.»',
    targetItem: 'ammo_energy',
    targetCount: 1,
    rewardItem: 'fake_pass',
    rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 10 }],
    relationDelta: 6,
    xpReward: 60,
    moneyReward: 55,
  }]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'prod_auditor_bot', AUDITOR_DEF, [{
    id: 'prod_bad_batch',
    giverId: getPlotNpcNumericId('prod_auditor_bot')!,
    type: QuestType.FETCH,
    desc: 'Аудитор-БОТ 14: «Две зеленые единицы из карантина. Выдать наверх или списать - решит акт, не желудок.»',
    targetItem: 'green_briquette',
    targetCount: 2,
    rewardItem: 'clean_health_cert',
    rewardCount: 1,
    extraRewards: [{ defId: 'container_key_label', count: 1 }],
    relationDelta: 8,
    xpReward: 65,
    moneyReward: 90,
  }]);
}

registerProductionBeltContent();

export interface ProductionBeltContainers {
  metalOutput: WorldContainer;
  chargeOutput: WorldContainer;
  ammoOutput: WorldContainer;
  p41Mount: WorldContainer;
  g41Mount: WorldContainer;
  zhernovMachine: WorldContainer;
  quarantine: WorldContainer;
  lockers: WorldContainer;
  loading: WorldContainer;
}

export function productionBeltTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const owner = world.factionControl[i] as TerritoryOwner;
    const list = cells.get(owner);
    if (list) list.push(i);
  }
  return cells;
}

export function isProductionBeltAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.name?.startsWith('Производственный пояс: работник') === true &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function alignProductionBeltAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = productionBeltTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isProductionBeltAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 127 + offset * 463) % list.length];
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

export function seedExpandedProductionCaches(world: World, dockRooms: readonly Room[], hazardRooms: readonly Room[]): void {
  const dockInventories: readonly (readonly { defId: string; count: number }[])[] = [
    [{ defId: 'gear', count: 1 }, { defId: 'fuse', count: 1 }, { defId: 'metal_sheet', count: 1 }],
    [{ defId: 'pipe', count: 1 }, { defId: 'wrench', count: 1 }, { defId: 'relay_diagram', count: 1 }],
    [{ defId: 'door_kit', count: 1 }, { defId: 'metal_sheet', count: 1 }, { defId: 'filter_layer', count: 1 }],
    [{ defId: 'ammo_energy', count: 1 }, { defId: 'fuse', count: 1 }, { defId: 'gasmask_filter', count: 1 }],
  ];
  for (let i = 0; i < dockRooms.length; i++) {
    addContainer(
      world,
      dockRooms[i],
      17 + i,
      ContainerKind.TOOL_LOCKER,
      `Запертый ремонтный шкаф ленты 14-${i + 1}`,
      dockInventories[i % dockInventories.length],
      ['industrial_cache', 'repair', 'locked_output', 'service_floor', 'quota'],
      'locked',
      Faction.LIQUIDATOR,
      undefined,
      'Охрана ленты 14',
      i % 2 === 0 ? 'metal_shop' : 'utility_room',
    );
  }

  const hazardInventories: readonly (readonly { defId: string; count: number }[])[] = [
    [{ defId: 'acid_bottle', count: 1 }, { defId: 'filter_layer', count: 1 }, { defId: 'metal_sheet', count: 1 }],
    [{ defId: 'ammo_fuel', count: 1 }, { defId: 'pipe', count: 1 }, { defId: 'gear', count: 1 }],
  ];
  for (let i = 0; i < hazardRooms.length; i++) {
    addContainer(
      world,
      hazardRooms[i],
      31 + i,
      ContainerKind.METAL_CABINET,
      `Аварийная тара брака ${i + 1}`,
      hazardInventories[i % hazardInventories.length],
      ['industrial_cache', 'hazard', 'bad_batch', 'repair', 'theft'],
      i % 2 === 0 ? 'locked' : 'room',
      Faction.WILD,
      undefined,
      'Ночная смена',
      'illegal_ammo_smelter',
    );
  }
}

export function spawnNpc(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  _def: PlotNpcDef,
  room: Room,
  salt: number,
  angle: number,
  weapon?: string,
): number {
  const pos = roomCellForActor(room, salt);
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, pos.x, pos.y, {
    angle,
    canGiveQuest: true,
    weapon,
    aiTarget: { x: 0, y: 0 },
    extra: {
      assignedRoomId: room.id,
      rpg: randomRPG(3),
    },
  });
  return npc.id;
}

export function spawnMonster(
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  room: Room,
  salt: number,
  level: number,
): void {
  const def = MONSTERS[kind];
  const pos = roomCellForActor(room, salt);
  const hp = Math.round(def.hp * (1 + Math.max(0, level - 1) * 0.18));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: pos.x,
    y: pos.y,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT,
  });
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

export function addContainer(
  world: World,
  room: Room,
  salt: number,
  kind: ContainerKind,
  name: string,
  inventory: readonly { defId: string; count: number }[],
  tags: readonly string[],
  access: WorldContainer['access'],
  faction?: Faction,
  ownerNpcId?: number,
  ownerName?: string,
  factoryId?: string,
): WorldContainer {
  const pos = roomCell(world, room, salt);
  setFeature(world, pos.x, pos.y, kind === ContainerKind.SAFE ? Feature.DESK : Feature.SHELF);
  const ci = world.idx(pos.x, pos.y);
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: pos.x,
    y: pos.y,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory: cloneInventory(inventory),
    capacitySlots: Math.max(6, inventory.length + 3),
    ownerNpcId,
    ownerName,
    faction,
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: true,
    factoryId,
    tags: uniqueTags([CONTENT_TAG, ...tags]),
  };
  world.addContainer(container);
  return container;
}

export function createProductionBeltState(
  rooms: ProductionBeltRooms,
  containers: ProductionBeltContainers,
): ProductionBeltRouteState {
  return {
    routeId: DESIGN_FLOOR_ID,
    anchorZ: PRODUCTION_BELT_ROUTE_Z,
    lines: [
      {
        id: 'prod_restore_line',
        factoryId: 'metal_shop',
        roomId: rooms.metalLine.id,
        outputContainerId: containers.metalOutput.id,
        state: 'repairable',
        dependencyIds: ['prod_to_service_door_kits'],
      },
      {
        id: 'prod_charge_line',
        factoryId: 'utility_room',
        roomId: rooms.chargeLine.id,
        outputContainerId: containers.chargeOutput.id,
        state: 'audited',
        dependencyIds: ['prod_charge_to_service_power'],
      },
      {
        id: 'prod_illegal_ammo',
        factoryId: 'illegal_ammo_smelter',
        roomId: rooms.ammoLine.id,
        outputContainerId: containers.ammoOutput.id,
        state: 'bad_batch',
        dependencyIds: ['prod_bad_batch_to_market', 'prod_bad_batch_to_living_warning'],
      },
    ],
    dependencies: PRODUCTION_BELT_PIPELINE_DEPENDENCIES.map(dep => ({ ...dep })),
    cueIds: [
      'production_belt_repair_feed',
      'production_belt_service_feed',
      'production_belt_bad_batch_warning',
      'production_belt_tracked_zhernov',
      'production_belt_tensor_spine',
      'production_belt_machine_shelter',
    ],
  };
}

export function stampMachineHazardCues(world: World, cells: readonly number[], seed: number): void {
  if (cells.length === 0) return;
  const step = Math.max(1, Math.floor(cells.length / 14));
  for (let n = 0; n < cells.length; n += step) {
    const cell = cells[n];
    const x = cell % W;
    const y = (cell / W) | 0;
    stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.26, 0.5, seed + n * 37, 210, 138, 44, false);
  }
}

export function registerProductionBeltRouteCues(
  world: World,
  rooms: ProductionBeltRooms,
  containers: ProductionBeltContainers,
): void {
  const repairMarkerX = rooms.metalLine.x + 6.5;
  const repairMarkerY = rooms.metalLine.y + 12.5;
  const repairTargetX = containers.metalOutput.x + 0.5;
  const repairTargetY = containers.metalOutput.y + 0.5;
  const repairCell = world.idx(Math.floor(repairMarkerX), Math.floor(repairMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_repair_feed',
    x: repairMarkerX,
    y: repairMarkerY,
    targetX: repairTargetX,
    targetY: repairTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.metalLine.id,
    targetRoomId: rooms.metalLine.id,
    zoneId: world.zoneMap[repairCell],
    label: 'ремонтная линия',
    hint: 'две шестерни возвращают дверь-комплект в выходной шкаф',
    targetName: containers.metalOutput.name,
    color: '#fd6',
    tags: ['production_belt', 'repair', 'pipeline', 'service_floor', 'quota'],
    toneSeed: rooms.metalLine.id * 97 + containers.metalOutput.id,
    radius: 8,
    targetRadius: 2.8,
    cooldownSec: 30,
    heardText: 'Восстановительная линия бьет валом: Рустаму нужны шестерни, выходной шкаф ждет комплект.',
    followedText: 'Вы у выходного шкафа восстановительной линии. Его можно чинить по акту или обчищать как сменный долг.',
    ignoredText: 'Стук восстановительной линии остался позади. Без ремонта С-15 снова недополучит дверь-комплект.',
  });

  const serviceMarkerX = rooms.chargeLine.x + 6.5;
  const serviceMarkerY = rooms.chargeLine.y + 6.5;
  const serviceTargetX = containers.chargeOutput.x + 0.5;
  const serviceTargetY = containers.chargeOutput.y + 0.5;
  const serviceCell = world.idx(Math.floor(serviceMarkerX), Math.floor(serviceMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_service_feed',
    x: serviceMarkerX,
    y: serviceMarkerY,
    targetX: serviceTargetX,
    targetY: serviceTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.chargeLine.id,
    targetRoomId: rooms.chargeLine.id,
    zoneId: world.zoneMap[serviceCell],
    label: 'зарядная передача',
    hint: 'реле ведет к энергоячейке для С-15',
    targetName: containers.chargeOutput.name,
    color: '#8cf',
    tags: ['production_belt', 'pipeline', 'service_floor', 'transfer'],
    toneSeed: rooms.chargeLine.id * 101 + containers.chargeOutput.id,
    radius: 9,
    targetRadius: 2.8,
    cooldownSec: 32,
    heardText: 'Зарядная линия щелкает в сторону С-15: ячейку можно сдать, украсть или сорвать смену.',
    followedText: 'Вы у ящика энергоячеек. Это питание для обхода Служебного этажа и повод для кражи.',
    ignoredText: 'Реле зарядки осталось позади. Служебный обход не получил эту ячейку.',
  });

  const warningMarkerX = rooms.auditOffice.x + 9.5;
  const warningMarkerY = rooms.auditOffice.y + 4.5;
  const warningTargetX = containers.quarantine.x + 0.5;
  const warningTargetY = containers.quarantine.y + 0.5;
  const warningCell = world.idx(Math.floor(warningMarkerX), Math.floor(warningMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_bad_batch_warning',
    x: warningMarkerX,
    y: warningMarkerY,
    targetX: warningTargetX,
    targetY: warningTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.auditOffice.id,
    targetRoomId: rooms.quarantine.id,
    zoneId: world.zoneMap[warningCell],
    label: 'акт брака',
    hint: 'зеленая партия пищит за стеной аудита',
    targetName: containers.quarantine.name,
    color: '#afa',
    tags: ['production_belt', 'warning', 'bad_batch', 'living'],
    toneSeed: rooms.auditOffice.id * 103 + containers.quarantine.id,
    radius: 8,
    targetRadius: 3,
    cooldownSec: 36,
    heardText: 'Экран БОТ-14 предупреждает: зеленую партию можно выдать наверх или остановить актом.',
    followedText: 'Карантинный шкаф найден. Дальше выбор: образцы аудитору, товар рынку или оставить отраву в линии.',
    ignoredText: 'Предупреждение БОТ-14 погасло за спиной. Зеленая партия осталась в маршруте.',
  });

  const zhernovMarkerX = rooms.metalLine.x + 22.5;
  const zhernovMarkerY = rooms.metalLine.y + 6.5;
  const zhernovTargetX = containers.zhernovMachine.x + 0.5;
  const zhernovTargetY = containers.zhernovMachine.y + 0.5;
  const zhernovCell = world.idx(Math.floor(zhernovMarkerX), Math.floor(zhernovMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_tracked_zhernov',
    x: zhernovMarkerX,
    y: zhernovMarkerY,
    targetX: zhernovTargetX,
    targetY: zhernovTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.metalLine.id,
    targetRoomId: rooms.metalLine.id,
    zoneId: world.zoneMap[zhernovCell],
    label: 'гусеничный жернов',
    hint: 'пломбированная тележка добивает собранных тварей, но числится у ликвидаторов',
    targetName: containers.zhernovMachine.name,
    color: '#f96',
    tags: ['production_belt', 'tracked_zhernov', 'liquidator', 'regenerator_finisher', 'theft'],
    toneSeed: rooms.metalLine.id * 107 + containers.zhernovMachine.id,
    radius: 8,
    targetRadius: 2.8,
    cooldownSec: 42,
    heardText: 'У восстановительной линии скрежещет тележка жернова: финишер для собранной твари стоит под пломбой.',
    followedText: 'Вы у пломбированной тележки жернова. Можно оставить её ликвидаторам или вынести как тяжёлый финальный аргумент.',
    ignoredText: 'Скрежет жернова остался за спиной. Собранную тварь придётся добивать обычным железом.',
  });

  const spineMarkerX = rooms.corridor.x + 32.5;
  const spineMarkerY = rooms.corridor.y + 3.5;
  const spineTargetX = rooms.exitDock.x + rooms.exitDock.w - 3.5;
  const spineTargetY = rooms.exitDock.y + 3.5;
  const spineCell = world.idx(Math.floor(spineMarkerX), Math.floor(spineMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_tensor_spine',
    x: spineMarkerX,
    y: spineMarkerY,
    targetX: spineTargetX,
    targetY: spineTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.corridor.id,
    targetRoomId: rooms.exitDock.id,
    zoneId: world.zoneMap[spineCell],
    label: 'тензорная линия',
    hint: 'светлая полоса ленты ведет от проходной к докам и обходам',
    targetName: rooms.exitDock.name,
    color: '#fd6',
    tags: ['production_belt', 'conveyor_spine', 'static_route_line', 'dock_loop'],
    toneSeed: rooms.corridor.id * 109 + rooms.exitDock.id,
    radius: 10,
    targetRadius: 3,
    cooldownSec: 34,
    heardText: 'На полу тянется светлая линия ленты: по ней можно идти к докам без живой механики конвейера.',
    followedText: 'Вы на линии ленты. Она не двигает тело, но читает маршрут: доки, обходы, выдача.',
    ignoredText: 'Полоса ленты ушла в шум цеха. Без нее доки придется искать по железу и лампам.',
  });

  const hazardMarkerX = rooms.chargeLine.x + 9.5;
  const hazardMarkerY = rooms.chargeLine.y + 8.5;
  const shelterTargetX = rooms.shelter.x + 8.5;
  const shelterTargetY = rooms.shelter.y + 4.5;
  const hazardCell = world.idx(Math.floor(hazardMarkerX), Math.floor(hazardMarkerY));
  registerRouteCue(world, {
    id: 'production_belt_machine_shelter',
    x: hazardMarkerX,
    y: hazardMarkerY,
    targetX: shelterTargetX,
    targetY: shelterTargetY,
    z: PRODUCTION_BELT_BASE_FLOOR,
    roomId: rooms.chargeLine.id,
    targetRoomId: rooms.shelter.id,
    zoneId: world.zoneMap[hazardCell],
    label: 'укрытие у станков',
    hint: 'желтый туман показывает опасную кромку, освещенная бытовка дает безопасный обход',
    targetName: rooms.shelter.name,
    color: '#fc8',
    tags: ['production_belt', 'machine_hazard', 'shelter', 'samosbor', 'bypass'],
    toneSeed: rooms.chargeLine.id * 113 + rooms.shelter.id,
    radius: 9,
    targetRadius: 3.2,
    cooldownSec: 38,
    heardText: 'Зарядная линия шипит желтым полем. Сменная бытовка справа держит сухую кромку.',
    followedText: 'Вы у безопасной кромки станков. Отсюда можно переждать такт, чинить линию или вести Егора к проходной.',
    ignoredText: 'Станочная кромка осталась без ориентира. В шуме цеха укрытие выглядит как обычная дверь.',
  });
}

export function populateRooms(world: World, entities: Entity[], nextId: { v: number }, rooms: ProductionBeltRooms): ProductionBeltContainers {
  const galinaId = spawnNpc(entities, nextId, 'prod_foreman_galina', FOREMAN_DEF, rooms.foreman, 1, Math.PI / 2);
  const rustamId = spawnNpc(entities, nextId, 'prod_mechanic_rustam', MECHANIC_DEF, rooms.metalLine, 2, Math.PI);
  const egorId = spawnNpc(entities, nextId, 'prod_worker_egor', WORKER_DEF, rooms.quarantine, 3, -Math.PI / 2);
  const auditorId = spawnNpc(entities, nextId, 'prod_auditor_bot', AUDITOR_DEF, rooms.auditOffice, 4, Math.PI, 'makarov');

  const metalOutput = addContainer(world, rooms.metalLine, 1, ContainerKind.TOOL_LOCKER, 'Выходной шкаф восстановительной линии', [
    { defId: 'pipe', count: 1 },
    { defId: 'door_kit', count: 1 },
    { defId: 'metal_sheet', count: 2 },
  ], ['production_output', 'metal_shop', 'tools', 'faction', 'legal_output', 'service_floor', 'theft'], 'owner', Faction.CITIZEN, galinaId, FOREMAN_DEF.name, 'metal_shop');

  const chargeOutput = addContainer(world, rooms.chargeLine, 2, ContainerKind.TOOL_LOCKER, 'Опломбированный ящик энергоячеек', [
    { defId: 'ammo_energy', count: 1 },
    { defId: 'fuse', count: 2 },
    { defId: 'relay_diagram', count: 1 },
  ], ['production_output', 'utility_room', 'utility', 'room', 'tech', 'service_floor', 'transfer', 'theft'], 'owner', Faction.CITIZEN, rustamId, MECHANIC_DEF.name, 'utility_room');

  const ammoOutput = addContainer(world, rooms.ammoLine, 3, ContainerKind.WEAPON_CRATE, 'Серый ящик патронной смены', [
    { defId: 'rpl23_lmg', count: 1 },
    { defId: 'ammo_belt', count: 40 },
    { defId: 'ammo_9mm', count: 18 },
    { defId: 'ammo_fuel', count: 1 },
    { defId: 'brt2_foam_projector', count: 1 },
    { defId: 'foam_grenade_6p10', count: 3 },
    { defId: 'pbrog1_foam_launcher', count: 1 },
    { defId: 'metal_sheet', count: 1 },
    { defId: 'homemade_ammo_instruction', count: 1 },
  ], ['production_output', 'illegal_ammo_smelter', 'ammo', 'weapon', 'engineer', 'foam', 'rare_engineer_crate', 'illegal', 'black_market_88', 'theft'], 'faction', Faction.WILD, egorId, WORKER_DEF.name, 'illegal_ammo_smelter');

  const p41Mount = addContainer(world, rooms.ammoLine, 6, ContainerKind.WEAPON_CRATE, 'Опломбированный станок 6П41', [
    { defId: 'p41_heavy_mg', count: 1 },
    { defId: 'ammo_belt', count: 80 },
    { defId: 'weapon_checkout_tag', count: 1 },
  ], ['mounted_weapon', 'p41_heavy_mg', 'heavy_mg', 'ammo_belt', 'stationary', 'authored_route', 'theft'], 'faction', Faction.LIQUIDATOR, auditorId, AUDITOR_DEF.name, 'illegal_ammo_smelter');

  const g41Mount = addContainer(world, rooms.ammoLine, 7, ContainerKind.WEAPON_CRATE, 'Опломбированный станок 5Г41', [
    { defId: 'g41_grenade_launcher', count: 1 },
    { defId: 'grenade', count: 3 },
    { defId: 'weapon_checkout_tag', count: 1 },
  ], ['mounted_weapon', 'g41_grenade_launcher', 'grenade', 'stationary', 'authored_route', 'theft'], 'faction', Faction.LIQUIDATOR, auditorId, AUDITOR_DEF.name, 'illegal_ammo_smelter');

  const zhernovMachine = addContainer(world, rooms.metalLine, 8, ContainerKind.WEAPON_CRATE, 'Пломбированная тележка жернова', [
    { defId: 'tracked_zhernov', count: 1 },
    { defId: 'weapon_checkout_tag', count: 1 },
  ], ['mounted_weapon', 'tracked_zhernov', 'stationary', 'authored_route', 'regenerator_finisher', 'theft'], 'faction', Faction.LIQUIDATOR, auditorId, AUDITOR_DEF.name, 'metal_shop');

  const quarantine = addContainer(world, rooms.quarantine, 4, ContainerKind.METAL_CABINET, 'Карантинный шкаф зеленой партии', [
    { defId: 'green_briquette', count: 4 },
    { defId: 'acid_bottle', count: 1 },
    { defId: 'filter_layer', count: 2 },
  ], ['quarantine', 'bad_batch', 'food', 'living', 'warning', 'theft'], 'owner', Faction.CITIZEN, auditorId, AUDITOR_DEF.name);

  const lockers = addContainer(world, rooms.lockers, 5, ContainerKind.TOOL_LOCKER, 'Открытые шкафчики смены', [
    { defId: 'labor_shift_card', count: 2 },
    { defId: 'gear', count: 2 },
    { defId: 'fuse', count: 1 },
    { defId: 'wrench', count: 1 },
    { defId: 'water', count: 1 },
  ], ['repair', 'public', 'shift'], 'public');

  const loading = addContainer(world, rooms.loadingDock, 6, ContainerKind.METAL_CABINET, 'Промежуточная тара погрузки', [
    { defId: 'grey_briquette', count: 3 },
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'container_key_label', count: 1 },
  ], ['loading', 'public', 'food'], 'room', Faction.CITIZEN);

  dropItems(world, entities, nextId, rooms.lockers, ['gear', 'gear', 'fuse', 'circuit_board', 'water']);
  dropItems(world, entities, nextId, rooms.metalLine, ['metal_sheet', 'pipe', 'wrench', 'relay_diagram']);
  dropItems(world, entities, nextId, rooms.quarantine, ['green_briquette', 'green_briquette', 'acid_bottle']);
  dropItems(world, entities, nextId, rooms.shelter, ['bread', 'bandage', 'grey_briquette']);

  spawnMonster(entities, nextId, MonsterKind.REBAR, rooms.metalLine, 5, 3);
  spawnMonster(entities, nextId, MonsterKind.ROBOT, rooms.chargeLine, 6, 3);
  spawnMonster(entities, nextId, MonsterKind.ROBOT, rooms.chargeLine, 7, 3);
  spawnMonster(entities, nextId, MonsterKind.SBORKA, rooms.quarantine, 8, 2);
  spawnMonster(entities, nextId, MonsterKind.SBORKA, rooms.quarantine, 9, 2);

  return { metalOutput, chargeOutput, ammoOutput, p41Mount, g41Mount, zhernovMachine, quarantine, lockers, loading };
}

