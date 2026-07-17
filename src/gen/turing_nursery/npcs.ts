import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { randomRPG } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { DESIGN_NPC_HOME_FLOOR_KEY, TURING_NURSERY_ROUTE_ID, TURING_NURSERY_BASE_FLOOR, TURING_NURSERY_ROOM_PREFIX, SEED, FIELD_SIZE, FIELD_CELLS, FIELD_STEPS, TURING_HQ_SPECS, NPC_DEFS } from "./meta";
import { NextId, ReactionField, NurseryRooms, carveTuringMacroNetwork, buildTuringHqSuites, buildTuringDistricts, buildTuringCabinetStrips, buildTuringOuterAnnexes, buildTuringStateGraphRooms, tryAddTuringRoom, connectRoomsNarrow, paintRoomTerritory, decorateMicroRoom, stainReactionRoom, stampReactionWater, laplace, fieldWrap, clamp01, addWetCell, setFeature, markScreenWall, roomCx, roomCy } from "./geometry";

export type TuringNpcId =
  | 'turing_nursery_mother_agafya'
  | 'turing_nursery_liquidator_bryzga'
  | 'turing_nursery_child_sava'
  | 'turing_nursery_registrar_milena';

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'turing_nursery_mother_agafya', NPC_DEFS.turing_nursery_mother_agafya, [
  {
    id: 'turing_nursery_inoculate_basin',
    giverId: getPlotNpcNumericId('turing_nursery_mother_agafya')!,
    type: QuestType.FETCH,
    desc: 'Агафья Мать-Алгоритм: «Принесите герметичный синий образец из вычислительной чаши. Если сначала обеззаразить налёт, образец не проснётся в руках.»',
    targetItem: 'blue_glow_sample_sealed',
    targetCount: 1,
    rewardItem: 'nii_sample_container',
    rewardCount: 1,
    extraRewards: [{ defId: 'sample_chain_form', count: 1 }, { defId: 'decon_fluid', count: 1 }],
    relationDelta: 14,
    xpReward: 130,
    moneyReward: 80,
    eventTags: [TURING_NURSERY_ROUTE_ID, 'inoculation', 'sample', 'reaction_diffusion'],
    eventPrivacy: 'local',
    eventSeverity: 4,
    eventData: { routeId: TURING_NURSERY_ROUTE_ID, decision: 'inoculate_basin' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'turing_nursery_liquidator_bryzga', NPC_DEFS.turing_nursery_liquidator_bryzga, [
  {
    id: 'turing_nursery_burn_bridge',
    giverId: getPlotNpcNumericId('turing_nursery_liquidator_bryzga')!,
    type: QuestType.KILL,
    desc: 'Брызга Л-10: «Слизевой мост держит чёрную пробу. Сожгите или отстрелите глаз у перехода, пока мост не стал новым коридором.»',
    targetMonsterKind: MonsterKind.CHERNOSLIZ,
    killNeeded: 1,
    rewardItem: 'napalm_mix',
    rewardCount: 1,
    extraRewards: [{ defId: 'deactivated_residue', count: 1 }, { defId: 'gasmask_filter', count: 1 }],
    relationDelta: 12,
    xpReward: 145,
    moneyReward: 95,
    eventTags: [TURING_NURSERY_ROUTE_ID, 'burn_bridge', 'liquidator', 'counterplay'],
    eventPrivacy: 'witnessed',
    eventSeverity: 4,
    eventData: { routeId: TURING_NURSERY_ROUTE_ID, decision: 'burn_slime_bridge' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'turing_nursery_child_sava', NPC_DEFS.turing_nursery_child_sava, [
  {
    id: 'turing_nursery_expose_growth_child',
    giverId: getPlotNpcNumericId('turing_nursery_child_sava')!,
    type: QuestType.TALK,
    desc: 'Сава Нулевой: «Поговорите с Миленой. Пусть она скажет, что меня считали ребёнком до того, как узор решил иначе.»',
    targetNpcId: getPlotNpcNumericId('turing_nursery_registrar_milena')!,
    rewardItem: 'clean_health_cert',
    rewardCount: 1,
    relationDelta: 16,
    xpReward: 75,
    moneyReward: 22,
    eventTags: [TURING_NURSERY_ROUTE_ID, 'child', 'expose_growth', 'witness'],
    eventPrivacy: 'local',
    eventData: { routeId: TURING_NURSERY_ROUTE_ID, decision: 'expose_lab_growth' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'turing_nursery_registrar_milena', NPC_DEFS.turing_nursery_registrar_milena, [
  {
    id: 'turing_nursery_growth_audit',
    giverId: getPlotNpcNumericId('turing_nursery_registrar_milena')!,
    type: QuestType.FETCH,
    desc: 'Милена Регистр: «Верните подложный акт НИИ из комнаты экспозиции. Оставите его мне — рост останется учебным. Сдадите Агафье — ясли получат проверку.»',
    targetItem: 'nii_forged_audit',
    targetCount: 1,
    rewardItem: 'record_exposure_notice',
    rewardCount: 1,
    extraRewards: [{ defId: 'forged_quarantine_clearance', count: 1 }],
    relationDelta: 8,
    xpReward: 95,
    moneyReward: 70,
    eventTags: [TURING_NURSERY_ROUTE_ID, 'forgery', 'audit', 'expose_growth'],
    eventPrivacy: 'secret',
    eventSeverity: 3,
    eventData: { routeId: TURING_NURSERY_ROUTE_ID, decision: 'hide_or_expose_growth' },
  },
]);

export function expandTuringNurseryRouteGeometry(world: World, rng: () => number): void {
  const field = reactionField(SEED ^ 0x7a710);
  carveTuringMacroNetwork(world, field);
  buildTuringHqSuites(world);
  buildTuringDistricts(world, field, rng);
  buildTuringCabinetStrips(world, rng);
  buildTuringOuterAnnexes(world, field, rng);
  buildTuringStateGraphRooms(world, field, rng);

  stampReactionWater(world, field, SEED ^ 0x7070, 1600);
  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(true);
}

export function spawnNpcs(entities: Entity[], nextId: NextId, rooms: NurseryRooms): Record<TuringNpcId, number> {
  return {
    turing_nursery_mother_agafya: spawnPlotNpc(entities, nextId, 'turing_nursery_mother_agafya', NPC_DEFS.turing_nursery_mother_agafya, rooms.basin.x + 24, rooms.basin.y + 26, 0),
    turing_nursery_liquidator_bryzga: spawnPlotNpc(entities, nextId, 'turing_nursery_liquidator_bryzga', NPC_DEFS.turing_nursery_liquidator_bryzga, rooms.burn.x + 22, rooms.burn.y + 22, Math.PI / 2, 'makarov'),
    turing_nursery_child_sava: spawnPlotNpc(entities, nextId, 'turing_nursery_child_sava', NPC_DEFS.turing_nursery_child_sava, rooms.ward.x + 28, rooms.ward.y + 18, 0),
    turing_nursery_registrar_milena: spawnPlotNpc(entities, nextId, 'turing_nursery_registrar_milena', NPC_DEFS.turing_nursery_registrar_milena, rooms.exposure.x + 22, rooms.exposure.y + 22, Math.PI),
  };
}

export function spawnAmbientNpcs(entities: Entity[], nextId: NextId, rooms: NurseryRooms): void {
  spawnAmbientNpc(entities, nextId, 'Лаборант чаши Тьюринга', Faction.SCIENTIST, Occupation.SCIENTIST, rooms.basin.x + 106, rooms.basin.y + 42, [
    { defId: 'sterile_swab', count: 2 },
    { defId: 'nii_sample_label', count: 1 },
  ]);
  spawnAmbientNpc(entities, nextId, 'Санитар сухих клеток', Faction.SCIENTIST, Occupation.DOCTOR, rooms.sample.x + 22, rooms.sample.y + 24, [
    { defId: 'anti_spore_inhaler', count: 1 },
    { defId: 'burn_gel', count: 1 },
  ]);
  spawnAmbientNpc(entities, nextId, 'Ликвидатор у мокрой диагонали', Faction.LIQUIDATOR, Occupation.HUNTER, rooms.bridge.x + 18, rooms.bridge.y + 16, [
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'gasmask_filter', count: 1 },
  ], 'makarov');
}

export function placeContainers(world: World, rooms: NurseryRooms, owners: Record<TuringNpcId, number>): Record<string, WorldContainer> {
  const basinKit = addContainer(world, rooms.basin, rooms.basin.x + 12, rooms.basin.y + 14, ContainerKind.MEDICAL_CABINET, 'Лоток инокуляции вычислительной чаши', 'public', [
    { defId: 'decon_fluid', count: 2 },
    { defId: 'sterile_swab', count: 2 },
    { defId: 'nii_sample_container', count: 1 },
  ], undefined, undefined, [TURING_NURSERY_ROUTE_ID, 'inoculation', 'basin', 'sample']);

  const sampleVault = addContainer(world, rooms.sample, rooms.sample.x + 14, rooms.sample.y + 12, ContainerKind.MEDICAL_CABINET, 'Синий шкаф вычисленной пробы', 'locked', [
    { defId: 'blue_glow_sample_sealed', count: 1 },
    { defId: 'slime_sample_blue', count: 1 },
    { defId: 'gas_sample_ampoule', count: 1 },
    { defId: 'sample_chain_form', count: 1 },
    { defId: 'nii_sample_label', count: 2 },
  ], owners.turing_nursery_mother_agafya, NPC_DEFS.turing_nursery_mother_agafya.name, [TURING_NURSERY_ROUTE_ID, 'sample', 'harvest', 'blue_sample']);

  const burnCache = addContainer(world, rooms.burn, rooms.burn.x + rooms.burn.w - 12, rooms.burn.y + 12, ContainerKind.WEAPON_CRATE, 'Ящик прожига слизевого моста', 'faction', [
    { defId: 'napalm_mix', count: 2 },
    { defId: 'ammo_12g_chemical', count: 1 },
    { defId: 'burn_gel', count: 1 },
    { defId: 'deactivated_residue', count: 1 },
  ], owners.turing_nursery_liquidator_bryzga, NPC_DEFS.turing_nursery_liquidator_bryzga.name, [TURING_NURSERY_ROUTE_ID, 'burn_bridge', 'liquidator', 'counterplay']);

  const exposureFile = addContainer(world, rooms.exposure, rooms.exposure.x + rooms.exposure.w - 12, rooms.exposure.y + 14, ContainerKind.FILING_CABINET, 'Папка экспозиции роста', 'owner', [
    { defId: 'nii_forged_audit', count: 1 },
    { defId: 'record_exposure_notice', count: 1 },
    { defId: 'forged_quarantine_clearance', count: 1 },
    { defId: 'blank_form', count: 1 },
  ], owners.turing_nursery_registrar_milena, NPC_DEFS.turing_nursery_registrar_milena.name, [TURING_NURSERY_ROUTE_ID, 'expose_growth', 'audit', 'documents']);

  addContainer(world, rooms.ward, rooms.ward.x + 8, rooms.ward.y + 10, ContainerKind.WOODEN_CHEST, 'Тумба нулевого ребёнка', 'secret', [
    { defId: 'slime_age_label_orange', count: 1 },
    { defId: 'clean_health_cert', count: 1 },
  ], owners.turing_nursery_child_sava, NPC_DEFS.turing_nursery_child_sava.name, [TURING_NURSERY_ROUTE_ID, 'child', 'witness', 'expose_growth']);

  for (let i = 0; i < Math.min(rooms.nodes.length, 6); i++) {
    const room = rooms.nodes[i];
    addContainer(world, room, room.x + room.w - 8, room.y + 8, i % 2 === 0 ? ContainerKind.MEDICAL_CABINET : ContainerKind.METAL_CABINET, `Шкаф клетки узора ${i + 1}`, i % 3 === 0 ? 'locked' : 'public', [
      { defId: i % 2 === 0 ? 'slime_sample_green' : 'contaminated_swab', count: 1 },
      { defId: 'filter_layer', count: 1 },
    ], undefined, undefined, [TURING_NURSERY_ROUTE_ID, 'reaction_cell', 'sample']);
  }

  return { basinKit, sampleVault, burnCache, exposureFile };
}

export function spawnThreats(world: World, entities: Entity[], nextId: NextId, rooms: NurseryRooms): void {
  spawnMonster(world, entities, nextId, MonsterKind.CHERNOSLIZ, rooms.bridge.x + rooms.bridge.w - 26, rooms.bridge.y + 16, 4, 'Чёрная проба на слизевом мосту');
  spawnMonster(world, entities, nextId, MonsterKind.SLIME_WOMAN, rooms.basin.x + rooms.basin.w - 34, rooms.basin.y + 48, 4, 'Жижевая воспитательница чаши');
  spawnMonster(world, entities, nextId, MonsterKind.HEAD_SLUG, rooms.ward.x + rooms.ward.w - 12, rooms.ward.y + 18, 3, 'Головной слизень у кровати');
  spawnMonster(world, entities, nextId, MonsterKind.TRUBNYY_AVTOMAT, rooms.sample.x + rooms.sample.w - 20, rooms.sample.y + 26, 4, 'Трубный автомат синего шкафа');
  for (let i = 0; i < Math.min(rooms.nodes.length, 4); i++) {
    const room = rooms.nodes[i];
    spawnMonster(world, entities, nextId, i % 2 === 0 ? MonsterKind.SLIMEVIK : MonsterKind.BEZEKHIY, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 3, `Сбой клетки узора ${i + 1}`);
  }
}

export function registerNurseryRouteCues(world: World, rooms: NurseryRooms, containers: Record<string, WorldContainer>): void {
  registerRouteCue(world, {
    id: 'turing_nursery_inoculation_basin',
    x: rooms.entry.x + 22.5,
    y: rooms.entry.y + 11.5,
    targetX: containers.basinKit.x + 0.5,
    targetY: containers.basinKit.y + 0.5,
    z: TURING_NURSERY_BASE_FLOOR,
    roomId: rooms.entry.id,
    targetRoomId: rooms.basin.id,
    zoneId: world.zoneMap[world.idx(rooms.entry.x + 22, rooms.entry.y + 11)],
    label: 'чаша инокуляции',
    hint: 'реагент открывает безопасный сбор синей пробы',
    targetName: containers.basinKit.name,
    color: '#7fdc8a',
    tags: [TURING_NURSERY_ROUTE_ID, 'inoculation', 'sample', 'counterplay'],
    toneSeed: rooms.basin.id * 97 + containers.basinKit.id,
    heardText: 'Чаша Тьюринга щёлкает мокрым счётом: сначала реагент, потом проба.',
    followedText: 'Вы у лотка инокуляции. Синий шкаф рядом, но мокрый узор любит голые руки.',
    ignoredText: 'Сухой шлюз остался позади. Чаша продолжает считать мокрые клетки.',
  });

  registerRouteCue(world, {
    id: 'turing_nursery_burn_bridge',
    x: rooms.burn.x + 12.5,
    y: rooms.burn.y + 13.5,
    targetX: roomCx(rooms.bridge) + 0.5,
    targetY: roomCy(rooms.bridge) + 0.5,
    z: TURING_NURSERY_BASE_FLOOR,
    roomId: rooms.burn.id,
    targetRoomId: rooms.bridge.id,
    zoneId: world.zoneMap[world.idx(rooms.burn.x + 12, rooms.burn.y + 13)],
    label: 'слизевой мост',
    hint: 'напалм и химия рвут мокрую связность',
    targetName: rooms.bridge.name,
    color: '#ff9b5a',
    tags: [TURING_NURSERY_ROUTE_ID, 'burn_bridge', 'fire', 'counterplay'],
    toneSeed: rooms.bridge.id * 101,
    heardText: 'Пост прожига стучит клапаном: слизевой мост ещё держит переход.',
    followedText: 'Вы у слизевого моста. Чёрная проба охраняет влажную перемычку.',
    ignoredText: 'Мост остался живым за спиной и продолжает выбирать короткую дорогу.',
  });

  registerRouteCue(world, {
    id: 'turing_nursery_growth_exposure',
    x: rooms.ward.x + 18.5,
    y: rooms.ward.y + 18.5,
    targetX: containers.exposureFile.x + 0.5,
    targetY: containers.exposureFile.y + 0.5,
    z: TURING_NURSERY_BASE_FLOOR,
    roomId: rooms.ward.id,
    targetRoomId: rooms.exposure.id,
    zoneId: world.zoneMap[world.idx(rooms.ward.x + 18, rooms.ward.y + 18)],
    label: 'акт роста',
    hint: 'бумага решает: учебная слизь или доказательство',
    targetName: containers.exposureFile.name,
    color: '#8fdcff',
    tags: [TURING_NURSERY_ROUTE_ID, 'expose_growth', 'documents', 'child'],
    toneSeed: rooms.exposure.id * 103 + containers.exposureFile.id,
    heardText: 'Из палаты нулевого ребёнка слышно: бумага роста спрятана в комнате экспозиции.',
    followedText: 'Вы у папки экспозиции роста. Этот акт можно спрятать, сдать или продать как чужую ошибку.',
    ignoredText: 'Палата осталась тихой. Без акта Сава остаётся контрольной группой.',
  });
}

export function buildTuringMicroBlock(
  world: World,
  lab: Room,
  owner: TerritoryOwner,
  name: string,
  cols: number,
  rows: number,
  seed: number,
): void {
  let previousRowFirst: Room | null = null;
  for (let row = 0; row < rows; row++) {
    let previous: Room | null = null;
    let rowFirst: Room | null = null;
    for (let col = 0; col < cols; col++) {
      const serial = seed * 64 + row * 13 + col;
      const room = tryAddTuringRoom(
        world,
        col % 5 === 0 ? RoomType.BATHROOM : col % 4 === 0 ? RoomType.OFFICE : col % 3 === 0 ? RoomType.MEDICAL : RoomType.STORAGE,
        lab.x - 26 + col * 18,
        lab.y + lab.h + 34 + row * 15,
        10 + (serial % 5),
        8 + ((serial + 3) % 4),
        `${TURING_NURSERY_ROOM_PREFIX}: ${name}: ${row + 1}-${col + 1}`,
        col % 3 === 0 ? Tex.TILE_W : Tex.METAL,
        col % 3 === 0 ? Tex.F_TILE : Tex.F_CONCRETE,
      );
      if (!room) continue;
      paintRoomTerritory(world, room, owner);
      decorateMicroRoom(world, room, serial);
      if (!rowFirst) rowFirst = room;
      if (previous) connectRoomsNarrow(world, previous, 'east', room, 'west', serial % 6 === 0 ? DoorState.CLOSED : DoorState.OPEN);
      previous = room;
    }
    if (rowFirst) {
      connectRoomsNarrow(world, previousRowFirst ?? lab, 'south', rowFirst, 'north', DoorState.CLOSED);
      previousRowFirst = rowFirst;
    }
  }
}

export function decorateSmallBowl(world: World, room: Room, field: ReactionField, serial: number): void {
  stainReactionRoom(world, room, field, SEED ^ (serial * 19));
  for (let y = room.y + 5; y < room.y + room.h - 4; y += 5) {
    for (let x = room.x + 6; x < room.x + room.w - 5; x += 8) {
      if (((x + y + serial) & 1) === 0) addWetCell(world, x, y);
      else setFeature(world, x, y, Feature.APPARATUS);
    }
  }
  markScreenWall(world, room.x + (room.w >> 1), room.y - 1, serial);
}

export function reactionField(seed: number): ReactionField {
  const u = new Float32Array(FIELD_CELLS);
  const v = new Float32Array(FIELD_CELLS);
  const nextU = new Float32Array(FIELD_CELLS);
  const nextV = new Float32Array(FIELD_CELLS);
  u.fill(1);
  const seeds = [
    { x: 32, y: 32, r: 8, w: 0.95 },
    { x: 22, y: 36, r: 7, w: 0.72 },
    { x: 42, y: 27, r: 6, w: 0.66 },
    { x: 18, y: 18, r: 5, w: 0.55 },
    { x: 47, y: 46, r: 6, w: 0.58 },
  ];
  for (const s of seeds) seedReaction(u, v, s.x, s.y, s.r, s.w);

  for (let step = 0; step < FIELD_STEPS; step++) {
    for (let y = 0; y < FIELD_SIZE; y++) {
      for (let x = 0; x < FIELD_SIZE; x++) {
        const i = y * FIELD_SIZE + x;
        const uvv = u[i] * v[i] * v[i];
        const feed = 0.031 + hash01(seed, x, y, 5) * 0.013;
        const kill = 0.056 + hash01(seed, x, y, 13) * 0.012;
        nextU[i] = clamp01(u[i] + 0.155 * laplace(u, x, y) - uvv + feed * (1 - u[i]));
        nextV[i] = clamp01(v[i] + 0.078 * laplace(v, x, y) + uvv - (feed + kill) * v[i]);
      }
    }
    u.set(nextU);
    v.set(nextV);
  }
  return { v };
}

export function seedReaction(u: Float32Array, v: Float32Array, sx: number, sy: number, radius: number, weight: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const x = fieldWrap(sx + dx);
      const y = fieldWrap(sy + dy);
      const i = y * FIELD_SIZE + x;
      const k = (1 - d / radius) * weight;
      v[i] = Math.min(0.82, v[i] + k * 0.44);
      u[i] = Math.max(0.18, u[i] - k * 0.22);
    }
  }
}

export function hash01(seed: number, x: number, y: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((x + 0x632be5ab) | 0, 0x27d4eb2d);
  h ^= Math.imul((y + 0x85157af5) | 0, 0x165667b1);
  h ^= Math.imul((salt + 0x94d049bb) | 0, 0xd3a2646c);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 0x100000000;
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: NextId,
  npcId: TuringNpcId,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): number {
  const px = x + 0.5;
  const py = y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    weapon,
    aiTarget: { x: px, y: py },
  });
  return npc.id;
}

export function spawnAmbientNpc(
  entities: Entity[],
  nextId: NextId,
  name: string,
  faction: Faction,
  occupation: Occupation,
  x: number,
  y: number,
  inventory: Item[],
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: faction === Faction.LIQUIDATOR ? 0.95 : 0.75 + rng() * 0.18,
    sprite: occupation,
    name,
    needs: freshNeeds(),
    hp: faction === Faction.LIQUIDATOR ? 150 : 88,
    maxHp: faction === Faction.LIQUIDATOR ? 150 : 88,
    money: 10 + Math.floor(rng() * 42),
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: inventory.map(item => ({ ...item })),
    weapon,
    faction,
    occupation,
    questId: -1,
  });
}

export function isTuringAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    entity.id === undefined &&
    entity.persistentNpcId === undefined &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function turingTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const spec of TURING_HQ_SPECS) {
    if (!cells.has(spec.owner)) cells.set(spec.owner, []);
  }
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

export function alignTuringNurseryAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = turingTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isTuringAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 127 + offset * 443) % list.length];
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

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name?: string,
): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (0.86 + level * 0.16));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (0.95 + level * 0.04),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SHADOW || kind === MonsterKind.SPIRIT,
  });
}

export function addContainer(
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
    x: world.wrap(x),
    y: world.wrap(y),
    z: TURING_NURSERY_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    faction: access === 'faction' ? Faction.LIQUIDATOR : undefined,
    access,
    lockDifficulty: access === 'locked' ? 4 : undefined,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.MEDICAL_CABINET ? Feature.APPARATUS : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

