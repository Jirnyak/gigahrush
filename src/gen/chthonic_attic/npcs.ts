/* ── Future design z: Хтонический чердак ─────────────────── */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  W, Cell, Feature,
  RoomType, EntityType, AIGoal, Faction, Occupation,
  QuestType, ContainerKind, MonsterKind, ZoneFaction,
  type Entity, type Room, type TerritoryOwner, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { monsterSpr, Spr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { randomAtticRootCell } from './geometry';
import { DESIGN_NPC_HOME_FLOOR_KEY, type ChthonicAtticRootChoice } from './meta';
export const ATTIC_NPCS: Record<string, PlotNpcDef> = {
  attic_agrafena_rootkeeper: {
    name: 'Аграфена Корневая',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 140, maxHp: 140, money: 45, speed: 0.75,
    inventory: [
      { defId: 'gear', count: 2 },
      { defId: 'wire_coil', count: 2 },
      { defId: 'hermo_gasket', count: 1 },
    ],
    talkLines: [
      'Корень держит плиту не хуже балки. Срубите чужой - крыша даст трещину там, где стояли люди.',
      'Накормить корень дешевле, чем чинить пролёт. Только потом он попросит фамилию.',
      'Сервисный этаж любит детали. Ад любит реликвии. Чердак любит, когда выбирают быстро.',
    ],
    talkLinesPost: [
      'Теперь ход открыт. Если потолок вздохнет, не отвечайте.',
      'Срез сухой - значит, ниже кто-то будет ругаться на щель.',
    ],
  },
  attic_deacon_ostap: {
    name: 'Дьякон Остап',
    isFemale: false,
    faction: Faction.CULTIST,
    occupation: Occupation.PRIEST,
    sprite: Occupation.PRIEST,
    hp: 160, maxHp: 160, money: 30, speed: 0.7,
    inventory: [
      { defId: 'denunciation', count: 1 },
      { defId: 'meat_rune', count: 1 },
      { defId: 'holy_water', count: 1 },
    ],
    talkLines: [
      'В нише тесно, зато самосбор считает нас частью стены.',
      'Свидетельство оставите - дверь подумает, что вы свой.',
      'Не всякий культ молится. Некоторые просто правильно оформляют страх.',
    ],
    talkLinesPost: [
      'Укрытие примет вас медленно. Медленная дверь честнее быстрой.',
      'Черная ладонь уже на стене. Осталось выбрать, кому она будет уликой.',
    ],
  },
  attic_cable_boy_yura: {
    name: 'Юра Кабельный',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 80, maxHp: 80, money: 7, speed: 1.55,
    inventory: [
      { defId: 'fuse', count: 1 },
      { defId: 'siren_instruction', count: 1 },
    ],
    talkLines: [
      'По большому коридору стреляют. По маленькому - ползут и молчат.',
      'Я знаю лаз, где кабели теплые. Если сирена начнет считать, идем сразу.',
      'Не берите рюкзак. Корень рюкзак слышит первым.',
    ],
    talkLinesPost: [
      'Лаз еще дышит. Значит, мы прошли вовремя.',
      'Если дверь стала уже, идите боком и не спорьте.',
    ],
  },
  attic_liquidator_masha: {
    name: 'Маша Прожиг',
    isFemale: true,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 240, maxHp: 240, money: 90, speed: 1.0,
    inventory: [
      { defId: 'ammo_fuel', count: 1 },
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 10 },
    ],
    talkLines: [
      'Жечь надо контуром, а не верой. Иначе дым пойдет вниз по лифту.',
      'Ниша не храм, а пробка. Прожжем - получим проход и злых соседей.',
      'Корень после огня не растет. Только копоть остается на потолке.',
    ],
    talkLinesPost: [
      'Обуглилось ровно. Почти без крика бетона.',
      'Если снизу спросят, это была профилактика, не крестовый поход.',
    ],
  },
};

export let contentRegistered = false;

export function registerChthonicAtticContent(): void {
  if (contentRegistered) return;
  contentRegistered = true;

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'attic_agrafena_rootkeeper', ATTIC_NPCS.attic_agrafena_rootkeeper, [
    {
      id: 'attic_cut_or_feed_root',
      giverId: getPlotNpcNumericId('attic_agrafena_rootkeeper')!,
      type: QuestType.FETCH,
      desc: 'Аграфена Корневая: «Две шестерни. Срежем несущий корень аккуратно; детали уйдут на сервисный этаж, реликвия останется за бетоном.»',
      targetItem: 'gear', targetCount: 2,
      rewardItem: 'hermo_gasket', rewardCount: 1,
      extraRewards: [{ defId: 'wire_coil', count: 1 }],
      relationDelta: 10, xpReward: 70, moneyReward: 80,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'attic_deacon_ostap', ATTIC_NPCS.attic_deacon_ostap, [
    {
      id: 'attic_black_hand_report',
      giverId: getPlotNpcNumericId('attic_deacon_ostap')!,
      type: QuestType.FETCH,
      desc: 'Дьякон Остап: «Принесите донос или акт о черной ладони. Министерство назовет это уликой, мы - платой за укрытие.»',
      targetItem: 'denunciation', targetCount: 1,
      rewardItem: 'meat_rune', rewardCount: 1,
      extraRewards: [{ defId: 'holy_water', count: 1 }],
      relationDelta: 8, xpReward: 65, moneyReward: 40,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'attic_cable_boy_yura', ATTIC_NPCS.attic_cable_boy_yura, [
    {
      id: 'attic_crawl_escort',
      giverId: getPlotNpcNumericId('attic_cable_boy_yura')!,
      type: QuestType.VISIT,
      desc: 'Юра Кабельный: «Проведите меня через низкий кабельный лаз во время предупреждения. Большой коридор пусть шумит без нас.»',
      targetRoomType: RoomType.CORRIDOR,
      targetRoomDefId: 'Низкий кабельный лаз',
      rewardItem: 'fuse', rewardCount: 1,
      extraRewards: [{ defId: 'siren_instruction', count: 1 }],
      relationDelta: 12, xpReward: 75, moneyReward: 35,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'attic_liquidator_masha', ATTIC_NPCS.attic_liquidator_masha, [
    {
      id: 'attic_burn_niche',
      giverId: getPlotNpcNumericId('attic_liquidator_masha')!,
      type: QuestType.FETCH,
      desc: 'Маша Прожиг: «Канистру топлива. Сожжем нишу по контуру: дым, вражда культистов, зато проход не затянет.»',
      targetItem: 'ammo_fuel', targetCount: 1,
      rewardItem: 'ammo_9mm', rewardCount: 12,
      extraRewards: [{ defId: 'bandage', count: 2 }],
      relationDelta: 14, xpReward: 90, moneyReward: 110,
      spawnMonstersOnAccept: 2,
    },
  ]);
}

registerChthonicAtticContent();

export function seedAtticShaftCaches(world: World, rooms: readonly Room[], rng: () => number): void {
  const loot: readonly WorldContainer['inventory'][] = [
    [{ defId: 'gasmask_filter', count: 1 }, { defId: 'wire_coil', count: 2 }, { defId: 'sealant_tube', count: 1 }],
    [{ defId: 'hermo_gasket', count: 1 }, { defId: 'fuse', count: 2 }, { defId: 'lamp_bulb', count: 1 }],
    [{ defId: 'circuit_board', count: 1 }, { defId: 'relay_diagram', count: 1 }, { defId: 'wire_coil', count: 1 }],
    [{ defId: 'gear', count: 2 }, { defId: 'sealant_tube', count: 1 }, { defId: 'gasmask_filter', count: 1 }],
  ];
  let placed = 0;
  for (const room of rooms) {
    if (room.type !== RoomType.PRODUCTION && room.type !== RoomType.STORAGE) continue;
    const cell = atticCacheCell(world, room, rng);
    if (cell < 0) continue;
    const x = cell % W;
    const y = (cell / W) | 0;
    world.addContainer({
      id: world.containers.length + 1,
      x,
      y,
      z: 30,
      roomId: room.id,
      zoneId: world.zoneMap[cell],
      kind: placed % 3 === 0 ? ContainerKind.SECRET_STASH : ContainerKind.TOOL_LOCKER,
      name: placed % 3 === 0 ? 'Запаянный шахтный тайник' : 'Сервисный шкаф чердака',
      inventory: loot[placed % loot.length].map(item => ({ ...item })),
      capacitySlots: 6,
      faction: placed % 2 === 0 ? Faction.LIQUIDATOR : Faction.CITIZEN,
      access: placed % 3 === 0 ? 'secret' : 'locked',
      lockDifficulty: placed % 3 === 0 ? undefined : 4,
      discovered: placed % 3 !== 0,
      tags: ['attic', 'shaft', 'utility', 'cache'],
    });
    placed++;
  }
}

export function seedAtticIslandCache(world: World, room: Room, owner: TerritoryOwner, rng: () => number): void {
  const idx = atticCacheCell(world, room, rng);
  if (idx < 0) return;
  const x = idx % W;
  const y = (idx / W) | 0;
  const faction = owner === ZoneFaction.LIQUIDATOR ? Faction.LIQUIDATOR
    : owner === ZoneFaction.CULTIST ? Faction.CULTIST
      : owner === ZoneFaction.SCIENTIST ? Faction.SCIENTIST
        : owner === ZoneFaction.WILD ? Faction.WILD
          : Faction.CITIZEN;
  world.addContainer({
    id: world.containers.length + 1,
    x,
    y,
    z: 30,
    roomId: room.id,
    zoneId: world.zoneMap[idx],
    kind: owner === ZoneFaction.WILD ? ContainerKind.SECRET_STASH : ContainerKind.TOOL_LOCKER,
    name: owner === ZoneFaction.WILD ? 'Дикий чердачный тайник' : 'Фракционный шкаф чердака',
    inventory: atticIslandCacheLoot(owner),
    capacitySlots: 6,
    faction,
    access: owner === ZoneFaction.WILD ? 'secret' : 'faction',
    lockDifficulty: owner === ZoneFaction.WILD ? undefined : 4,
    discovered: owner !== ZoneFaction.WILD,
    tags: ['attic', 'cache', 'territory', faction.toString()],
  });
}

export function atticIslandCacheLoot(owner: TerritoryOwner): WorldContainer['inventory'] {
  switch (owner) {
    case ZoneFaction.LIQUIDATOR:
      return [{ defId: 'ammo_9mm', count: 8 }, { defId: 'bandage', count: 1 }, { defId: 'gasmask_filter', count: 1 }];
    case ZoneFaction.CULTIST:
      return [{ defId: 'holy_water', count: 1 }, { defId: 'meat_rune', count: 1 }, { defId: 'cigs', count: 2 }];
    case ZoneFaction.SCIENTIST:
      return [{ defId: 'circuit_board', count: 1 }, { defId: 'relay_diagram', count: 1 }, { defId: 'fuse', count: 1 }];
    case ZoneFaction.WILD:
      return [{ defId: 'wire_coil', count: 1 }, { defId: 'gear', count: 1 }, { defId: 'sealant_tube', count: 1 }];
    default:
      return [{ defId: 'kasha', count: 1 }, { defId: 'lamp_bulb', count: 1 }, { defId: 'wire_coil', count: 1 }];
  }
}

export function atticCacheCell(world: World, room: Room, rng: () => number): number {
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4));
    const y = room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4));
    const idx = world.idx(x, y);
    if (world.cells[idx] !== Cell.FLOOR || world.roomMap[idx] !== room.id || world.features[idx] !== Feature.NONE) continue;
    return idx;
  }
  return -1;
}

export function spawnAtticAmbientMonsters(world: World, entities: Entity[], rng: () => number, count: number): void {
  let nextId = entities.reduce((max, entity) => Math.max(max, entity.id), 0) + 1;
  const kinds: readonly MonsterKind[] = [MonsterKind.SHADOW, MonsterKind.POLZUN, MonsterKind.SPIRIT, MonsterKind.REBAR];
  for (let i = 0; i < count; i++) {
    const point = randomAtticRootCell(world, rng);
    if (!point) break;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    nextId = spawnMonster(entities, nextId, kind, point.x + 0.5, point.y + 0.5);
  }
}

export function addAtticContainers(
  world: World,
  rootkeeper: Room,
  deacon: Room,
  evidence: Room,
  shrine: Room,
  masha: Room,
  rootChoice: ChthonicAtticRootChoice,
): void {
  addContainer(world, rootkeeper, rootkeeper.x + 3, rootkeeper.y + 5, ContainerKind.TOOL_LOCKER, 'Ящик несущих корней', 'owner', [
    { defId: 'gear', count: 2 },
    { defId: 'wire_coil', count: 2 },
    { defId: 'sealant_tube', count: 1 },
  ], ['attic', 'root', 'cut'], Faction.CITIZEN);

  addContainer(world, deacon, deacon.x + 4, deacon.y + 6, ContainerKind.FILING_CABINET, 'Ведомость укрытия Остапа', 'owner', [
    { defId: 'denunciation', count: 1 },
    { defId: 'voluntary_receipt', count: 1 },
    { defId: 'holy_water', count: 1 },
  ], ['attic', 'shelter', 'witness'], Faction.CULTIST);

  addContainer(world, evidence, evidence.x + 9, evidence.y + 6, ContainerKind.SAFE, 'Кладовая черной ладони', 'locked', [
    { defId: 'denunciation', count: 1 },
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'note', count: 1 },
  ], ['attic', 'ministry', 'evidence'], Faction.CITIZEN);

  addContainer(world, shrine, shrine.x + 10, shrine.y + 7, ContainerKind.SECRET_STASH, 'Реликварий корневой ниши', rootChoice === 'feed' ? 'public' : 'secret', [
    { defId: 'idol_chernobog', count: 1 },
    { defId: 'meat_rune', count: 1 },
    { defId: 'psi_dust', count: 1 },
  ], ['attic', 'hell', 'relic', rootChoice], Faction.CULTIST);

  addContainer(world, masha, masha.x + 16, masha.y + 6, ContainerKind.WEAPON_CRATE, 'Контур прожига Маши', 'faction', [
    { defId: 'ammo_fuel', count: 1 },
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'bandage', count: 2 },
  ], ['attic', 'burn', 'liquidator'], Faction.LIQUIDATOR);
}

export function addContainer(
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
): void {
  world.addContainer({
    id: world.containers.length + 1,
    x,
    y,
    z: 30,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: 8,
    faction,
    access,
    lockDifficulty: access === 'locked' ? 5 : undefined,
    discovered: access !== 'secret',
    tags,
  });
}

export function spawnNpc(
  entities: Entity[],
  id: number,
  plotNpcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
): number {
  const nextId = { v: id };
  requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x, y, {
    angle: 0,
    canGiveQuest: true,
    aiTarget: { x, y },
  });
  return nextId.v;
}

export function addItemDrop(
  entities: Entity[],
  id: number,
  defId: string,
  count: number,
  x: number,
  y: number,
): number {
  entities.push({
    id,
    type: EntityType.ITEM_DROP,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
  return id + 1;
}

export function spawnMonster(
  entities: Entity[],
  id: number,
  kind: MonsterKind,
  x: number,
  y: number,
): number {
  const hp = kind === MonsterKind.REBAR ? 130 : kind === MonsterKind.SHADOW ? 75 : kind === MonsterKind.EYE ? 60 : 18;
  const speed = kind === MonsterKind.REBAR ? 1.1 : kind === MonsterKind.SHADOW ? 2.3 : kind === MonsterKind.EYE ? 2.0 : 2.8;
  entities.push({
    id,
    type: EntityType.MONSTER,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed,
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    ai: { goal: AIGoal.HUNT, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    monsterKind: kind,
    attackCd: 0,
    faction: Faction.WILD,
  });
  return id + 1;
}

