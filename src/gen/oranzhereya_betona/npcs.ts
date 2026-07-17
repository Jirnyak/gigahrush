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
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { factionToTerritoryOwner } from '../../data/factions';
import { registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { DESIGN_NPC_HOME_FLOOR_KEY, ORANZHEREYA_BETONA_BASE_FLOOR, CONTENT_TAG, NPC_DEFS } from "./meta";
import { NextId, GreenhouseRooms, setGreenhouseFloor, setFeature, roomCell, cloneInventory, uniqueTags } from "./geometry";

export type GreenhouseNpcId =
  | 'oranzhereya_agronom_nadya'
  | 'oranzhereya_irrigator_gleb'
  | 'oranzhereya_guard_arsen'
  | 'oranzhereya_market_sonya';

export interface OranzhereyaBetonaMetrics {
  cropCells: number;
  waterCells: number;
  basinContainers: number;
  publicHarvestContainers: number;
  sabotageContainers: number;
}

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'oranzhereya_agronom_nadya', NPC_DEFS.oranzhereya_agronom_nadya, [{
  id: 'oranzhereya_save_clean_crop',
  giverId: getPlotNpcNumericId('oranzhereya_agronom_nadya')!,
  type: QuestType.FETCH,
  desc: 'Надя Агроном: «Принеси каменную соль. Споры надо остановить у грядки, пока рынок не назвал их деликатесом.»',
  targetItem: 'rock_salt',
  targetCount: 1,
  rewardItem: 'mushroom_mass',
  rewardCount: 3,
  extraRewards: [{ defId: 'filtered_water', count: 1 }, { defId: 'water_coupon', count: 1 }],
  relationDelta: 12,
  xpReward: 70,
  moneyReward: 36,
  eventTags: [CONTENT_TAG, 'crop_saved', 'food', 'water', 'fungus'],
  eventPrivacy: 'local',
  eventSeverity: 3,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'oranzhereya_irrigator_gleb', NPC_DEFS.oranzhereya_irrigator_gleb, [{
  id: 'oranzhereya_reroute_water',
  giverId: getPlotNpcNumericId('oranzhereya_irrigator_gleb')!,
  type: QuestType.FETCH,
  desc: 'Глеб Капельник: «Найди бирку вентиля. Без неё вода течёт в компост, а люди считают друг друга ведрами.»',
  targetItem: 'valve_tag',
  targetCount: 1,
  rewardItem: 'filtered_water',
  rewardCount: 2,
  extraRewards: [{ defId: 'pipe', count: 1 }],
  relationDelta: 10,
  xpReward: 65,
  moneyReward: 30,
  eventTags: [CONTENT_TAG, 'water', 'reroute', 'valve', 'living_scarcity'],
  eventPrivacy: 'local',
  eventSeverity: 3,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'oranzhereya_guard_arsen', NPC_DEFS.oranzhereya_guard_arsen, [{
  id: 'oranzhereya_burn_infestation',
  giverId: getPlotNpcNumericId('oranzhereya_guard_arsen')!,
  type: QuestType.KILL,
  desc: 'Арсен Водомер: «В прожиговой канаве проснулся борщевик. Сожги или пристрели корень, пока он не научил пайку кусаться.»',
  targetMonsterKind: MonsterKind.BORSHCHEVIK,
  killNeeded: 1,
  rewardItem: 'filter_layer',
  rewardCount: 2,
  extraRewards: [{ defId: 'ammo_fuel', count: 1 }, { defId: 'ammo_9mm', count: 8 }],
  relationDelta: 8,
  xpReward: 110,
  moneyReward: 55,
  eventTags: [CONTENT_TAG, 'burn_infestation', 'liquidator', 'fire', 'crop_defense'],
  eventPrivacy: 'witnessed',
  eventSeverity: 4,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'oranzhereya_market_sonya', NPC_DEFS.oranzhereya_market_sonya, [{
  id: 'oranzhereya_poison_market_crop',
  giverId: getPlotNpcNumericId('oranzhereya_market_sonya')!,
  type: QuestType.FETCH,
  desc: 'Соня Форточка: «Кислоту в питательный басейн. Чистая пайка кормит соседей, испорченная платит сразу.»',
  targetItem: 'acid_bottle',
  targetCount: 1,
  rewardItem: 'forged_ration_card',
  rewardCount: 1,
  extraRewards: [{ defId: 'infected_mushroom', count: 3 }],
  relationDelta: -6,
  xpReward: 55,
  moneyReward: 95,
  eventTags: [CONTENT_TAG, 'poison_crop', 'black_market_88', 'sabotage', 'food'],
  eventPrivacy: 'secret',
  eventSeverity: 4,
}]);

export function alignOranzhereyaBetonaAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = oranzhereyaTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isOranzhereyaAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 109 + offset * 397) % list.length];
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

export function carveCultivationField(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  seed: number,
  rng: () => number,
): void {
  const roomId = world.rooms.length;
  const room: Room = {
    id: roomId,
    type: RoomType.PRODUCTION,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name: `Внешнее поле выращивания #${roomId}`,
    apartmentId: -1,
    wallTex: Tex.PANEL,
    floorTex,
    ceilingTier: 3,
  };
  world.rooms.push(room);

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const row = dy % 12;
      if (row === 0 || row === 1 || row === 6) {
        setGreenhouseFloor(world, x + dx, y + dy, row === 6 ? Tex.F_CONCRETE : floorTex, false, roomId);
      } else if (dx % 13 <= 1) {
        setGreenhouseFloor(world, x + dx, y + dy, Tex.F_WATER, true, roomId);
      }
      if (row === 3 && dx % 17 === 0 && rng() < 0.85) {
        const idx = world.idx(x + dx, y + dy);
        if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) world.features[idx] = Feature.TABLE;
      }
      if ((dx * 19 + dy * 23 + seed) % 211 === 0) {
        stampSurfaceSplat(world, x + dx, y + dy, 0.5, 0.5, 1.1, 0.16, seed * 4099 + dx * 17 + dy, 62, 118, 52, true);
      }
      if (dx > 4 && dy > 4 && dx < w - 4 && dy < h - 4) {
        if (dx % 24 === 0 && dy % 24 === 0) {
          const idx = world.idx(x + dx, y + dy);
          if (!world.aptMask[idx] && !world.hermoWall[idx]) {
            world.cells[idx] = Cell.WALL;
            world.wallTex[idx] = Tex.PIPE;
            world.roomMap[idx] = -1;
            world.features[idx] = Feature.NONE;
          }
        } else if (dx % 24 === 2 && dy % 24 === 0) {
          const idx = world.idx(x + dx, y + dy);
          if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) {
            world.features[idx] = Feature.MACHINE;
          }
        } else if (dx % 24 === 4 && dy % 24 === 0) {
          const idx = world.idx(x + dx, y + dy);
          if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) {
            world.features[idx] = Feature.APPARATUS;
          }
        }
      }
    }
  }
}

export function isOranzhereyaAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function oranzhereyaTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>([
    [ZoneFaction.CITIZEN, []],
    [ZoneFaction.LIQUIDATOR, []],
    [ZoneFaction.CULTIST, []],
    [ZoneFaction.SCIENTIST, []],
    [ZoneFaction.WILD, []],
  ]);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER) continue;
    if (world.aptMask[i] || world.hermoWall[i] || world.containerMap.has(i) || world.features[i] === Feature.LIFT_BUTTON) continue;
    const list = cells.get(world.factionControl[i] as TerritoryOwner);
    if (list) list.push(i);
  }
  return cells;
}

export function placeCropRows(world: World, room: Room, seed: number): void {
  for (let y = room.y + 7; y < room.y + room.h - 5; y += 8) {
    for (let x = room.x + 6; x < room.x + room.w - 6; x++) {
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.FLOOR) continue;
      world.floorTex[idx] = Tex.F_GREEN_CARPET;
      if ((x + seed) % 9 === 0) world.features[idx] = Feature.TABLE;
      if ((x + y + seed) % 23 === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 1.2, 0.18, seed * 1009 + x * 17 + y, 48, 128, 54, true);
    }
  }
}

export function spawnNpcs(entities: Entity[], nextId: NextId, rooms: GreenhouseRooms): Record<GreenhouseNpcId, number> {
  return {
    oranzhereya_agronom_nadya: spawnPlotNpc(entities, nextId, 'oranzhereya_agronom_nadya', rooms.northRows, 8, Math.PI / 2),
    oranzhereya_irrigator_gleb: spawnPlotNpc(entities, nextId, 'oranzhereya_irrigator_gleb', rooms.pump, 7, 0),
    oranzhereya_guard_arsen: spawnPlotNpc(entities, nextId, 'oranzhereya_guard_arsen', rooms.guardPost, 5, Math.PI, 'makarov'),
    oranzhereya_market_sonya: spawnPlotNpc(entities, nextId, 'oranzhereya_market_sonya', rooms.marketStall, 4, -Math.PI / 2),
  };
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: NextId,
  npcId: GreenhouseNpcId,
  room: Room,
  salt: number,
  angle: number,
  weapon = NPC_DEFS[npcId].weapon,
): number {
  const pos = roomCell(room, salt);
  const px = pos.x + 0.5;
  const py = pos.y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    weapon,
    aiTarget: { x: px, y: py },
    extra: {
      assignedRoomId: room.id,
      rpg: randomRPG(3),
    },
  });
  return npc.id;
}

export function placeContainers(
  world: World,
  rooms: GreenhouseRooms,
  owners: Record<GreenhouseNpcId, number>,
): void {
  addContainer(world, rooms.northRows, 1, ContainerKind.FRIDGE, 'Общий ящик чистой зелени', [
    { defId: 'mushroom_mass', count: 3 },
    { defId: 'bread', count: 2 },
    { defId: 'filtered_water', count: 1 },
  ], ['harvest', 'food', 'clean_crop', 'resident_relief'], 'public');

  addContainer(world, rooms.southRows, 2, ContainerKind.FRIDGE, 'Стеллаж спорного урожая', [
    { defId: 'mushroom_mass', count: 2 },
    { defId: 'infected_mushroom', count: 2 },
    { defId: 'spore_print', count: 1 },
  ], ['harvest', 'fungal', 'risky_food', 'black_market_88'], 'room');

  addContainer(world, rooms.waterBasin, 3, ContainerKind.METAL_CABINET, 'Шкаф питательного басейна', [
    { defId: 'filtered_water', count: 2 },
    { defId: 'filter_layer', count: 1 },
    { defId: 'water_coupon', count: 1 },
  ], ['nutrient_basin', 'water', 'reroute', 'service'], 'faction', Faction.LIQUIDATOR, owners.oranzhereya_guard_arsen, NPC_DEFS.oranzhereya_guard_arsen.name);

  addContainer(world, rooms.pump, 4, ContainerKind.TOOL_LOCKER, 'Пломбированный шкаф вентилей', [
    { defId: 'valve_tag', count: 1 },
    { defId: 'pipe', count: 1 },
    { defId: 'wrench', count: 1 },
  ], ['water', 'reroute', 'repair', 'valve', 'service'], 'owner', Faction.CITIZEN, owners.oranzhereya_irrigator_gleb, NPC_DEFS.oranzhereya_irrigator_gleb.name);

  addContainer(world, rooms.seedVault, 5, ContainerKind.METAL_CABINET, 'Семенная кладовая под подпись', [
    { defId: 'substrate_sack', count: 2 },
    { defId: 'spore_print', count: 2 },
    { defId: 'rock_salt', count: 1 },
    { defId: 'ration_registry_extract', count: 1 },
  ], ['seed', 'food', 'evidence_drop', 'ration'], 'owner', Faction.SCIENTIST, owners.oranzhereya_agronom_nadya, NPC_DEFS.oranzhereya_agronom_nadya.name);

  addContainer(world, rooms.marketStall, 6, ContainerKind.SECRET_STASH, 'Форточка испорченной пайки', [
    { defId: 'acid_bottle', count: 1 },
    { defId: 'infected_mushroom', count: 3 },
    { defId: 'forged_ration_card', count: 1 },
  ], ['black_market_88', 'sabotage_drop', 'poison_crop', 'contraband', 'secret'], 'secret', Faction.WILD, owners.oranzhereya_market_sonya, NPC_DEFS.oranzhereya_market_sonya.name);

  addContainer(world, rooms.burnTrench, 7, ContainerKind.TOOL_LOCKER, 'Прожиговый аварийный ящик', [
    { defId: 'ammo_fuel', count: 1 },
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'cleaning_kit', count: 1 },
  ], ['burn_infestation', 'cleanup', 'fungus_counterplay', 'liquidator'], 'faction', Faction.LIQUIDATOR, owners.oranzhereya_guard_arsen, NPC_DEFS.oranzhereya_guard_arsen.name);

  addContainer(world, rooms.compost, 8, ContainerKind.TRASH_BIN, 'Компостная яма недостачи', [
    { defId: 'infected_mushroom', count: 1 },
    { defId: 'grey_briquette', count: 2 },
    { defId: 'rock_salt', count: 1 },
  ], ['compost', 'food', 'theft', 'samosbor'], 'room');
}

export function addContainer(
  world: World,
  room: Room,
  salt: number,
  kind: ContainerKind,
  name: string,
  inventory: readonly Item[],
  tags: readonly string[],
  access: WorldContainer['access'],
  faction?: Faction,
  ownerNpcId?: number,
  ownerName?: string,
): WorldContainer {
  const pos = roomCell(room, salt);
  const idx = world.idx(pos.x, pos.y);
  setFeature(world, pos.x, pos.y, kind === ContainerKind.FRIDGE ? Feature.SINK : Feature.SHELF);
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: pos.x,
    y: pos.y,
    z: ORANZHEREYA_BETONA_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[idx],
    kind,
    name,
    inventory: cloneInventory(inventory),
    capacitySlots: Math.max(6, inventory.length + 3),
    ownerNpcId,
    ownerName,
    faction,
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: access !== 'secret',
    tags: uniqueTags([CONTENT_TAG, ...tags]),
  };
  world.addContainer(container);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnThreats(world: World, entities: Entity[], nextId: NextId, rooms: GreenhouseRooms): void {
  spawnMonster(world, entities, nextId, MonsterKind.BORSHCHEVIK, rooms.burnTrench, 4, 3, 'Борщевик из прожиговой канавы');
  spawnMonster(world, entities, nextId, MonsterKind.SPORE_CARPET, rooms.mushroomWard, 7, 3, 'Споровый ковёр у стеллажа');
  spawnMonster(world, entities, nextId, MonsterKind.CHERNOSLIZ, rooms.waterBasin, 6, 3, 'Чернослиз питательного басейна');
  spawnMonster(world, entities, nextId, MonsterKind.POMOYNY_ROY, rooms.compost, 3, 2, 'Компостный рой');

  const secretWard = world.rooms.find(r => r.name === 'Секретный бокс гидропоники НИИ');
  if (secretWard) spawnMonster(world, entities, nextId, MonsterKind.CHERNOSLIZ, secretWard, 5, 4, 'Лабораторный прото-чернослиз');

  const smugglePoint = world.rooms.find(r => r.name === 'Перевалочный пункт агро-контрабанды');
  if (smugglePoint) spawnMonster(world, entities, nextId, MonsterKind.BORSHCHEVIK, smugglePoint, 5, 4, 'Перекормленный борщевик-охранник');

  const cultAltar = world.rooms.find(r => r.name === 'Святилище Спор Чернобога');
  if (cultAltar) spawnMonster(world, entities, nextId, MonsterKind.POMOYNY_ROY, cultAltar, 5, 3, 'Благословенный рой культа');

  const hydroNode = world.rooms.find(r => r.name === 'Узел гидро-распределения О-8');
  if (hydroNode) spawnMonster(world, entities, nextId, MonsterKind.SPORE_CARPET, hydroNode, 5, 3, 'Уплотненный споровый ковер');
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  room: Room,
  salt: number,
  level: number,
  name?: string,
): void {
  const def = MONSTERS[kind];
  const pos = roomCell(room, salt);
  const idx = world.idx(pos.x, pos.y);
  if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) return;
  const hp = Math.round(def.hp * (0.9 + level * 0.16));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: pos.x + 0.5,
    y: pos.y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (0.95 + level * 0.03),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: pos.x, ty: pos.y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
  });
}

