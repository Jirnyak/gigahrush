import {  applyDesignFloorPopulationField } from '../design_floors/population';
import type { DesignFloorGeneration } from '../floor_manifest';
import { seededRandom, hashSeed } from '../../core/rand';
/* -- Design z: Морг регистраций ----------------------------
 * Authored route floor registry_morgue, z=+18.
 */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  W,
  DoorState,
  LiftDirection,
  MonsterKind,
  QuestType,
  RoomType,
  Tex,
  ZoneFaction,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import {
  generateZones,
  sanitizeDoors,
} from '../shared';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';
import { DESIGN_NPC_HOME_FLOOR_KEY, REGISTRY_MORGUE_ROUTE_ID, REGISTRY_MORGUE_FUTURE_Z, REGISTRY_MORGUE_BASE_FLOOR, CORPSE_NUMBER_TAG_ITEM, REGISTRY_MORGUE_TARGET_ROUTE, NextId, NPC_DEFS } from "./meta";
import { createDesignRoom, linkRooms, reinforceRegistryMorgueAuthoredTerritory, expandRegistryMorgueGeometry, placeDesignLift, decorateRegistryMorgue, retuneRegistryMorgueZones } from "./geometry";
import { spawnMorgueNpc, spawnMorgueMonster, seedRegistryMorgueContainers, seedRegistryMorgueReadables } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'morgue_registrar_faina', NPC_DEFS.morgue_registrar_faina, [
  {
    id: 'morgue_find_tag',
    giverId: getPlotNpcNumericId('morgue_registrar_faina')!,
    type: QuestType.FETCH,
    desc: 'Фаина Реестровая: «Верните номерок из холодной камеры. Без него живого человека можно закрыть бумагой, а потом искать уже по форме.»',
    targetItem: CORPSE_NUMBER_TAG_ITEM, targetCount: 1,
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Холодная камера-укрытие',
    targetHint: 'номерок лежит в холодной картотеке; взять его без сдачи можно как кражу из моргового хранения',
    rewardItem: 'official_quarantine_clearance', rewardCount: 1,
    extraRewards: [{ defId: 'clean_health_cert', count: 1 }],
    relationDelta: 14, xpReward: 65, moneyReward: 55,
    eventTags: ['registry_morgue', 'record_correction', 'death_record', 'tag_returned', 'identity'],
    eventData: { outcome: 'record_corrected', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Бирка N-16 возвращена в книгу умерших; запись перестала закрывать живую фамилию.',
    eventSeverity: 4,
  },
  {
    id: 'morgue_swap_certificate',
    giverId: getPlotNpcNumericId('morgue_registrar_faina')!,
    type: QuestType.FETCH,
    desc: 'Фаина Реестровая: «Принесите акт о пропавшей записи. Я оформлю смерть так, что Райсовет выдаст допуск человеку у окна. Пустую строку не трогайте.»',
    targetItem: 'record_exposure_notice', targetCount: 1,
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Кабинет книги умерших',
    rewardItem: 'archive_access_permit', rewardCount: 1,
    extraRewards: [{ defId: 'passport_stub', count: 1 }],
    relationDelta: -4, xpReward: 80, moneyReward: 95,
    eventTags: ['registry_morgue', 'false_death', 'death_record', 'forgery', 'archive_access'],
    eventData: { outcome: 'false_death_registered', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Ложная смерть внесена в морговой журнал; архивный допуск выдан до проверки тела.',
    eventSeverity: 5,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'morgue_orderly_stepan', NPC_DEFS.morgue_orderly_stepan, [
  {
    id: 'morgue_missing_body',
    giverId: getPlotNpcNumericId('morgue_orderly_stepan')!,
    type: QuestType.KILL,
    desc: 'Степан Носильный: «В зараженной камере ходит человек с чужой биркой. Проверьте дистанцией и уберите подмену.»',
    targetMonsterKind: MonsterKind.NELYUD,
    killNeeded: 1,
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Зараженная камера сверки',
    rewardItem: 'personal_file_copy', rewardCount: 1,
    extraRewards: [{ defId: 'filter_receipt', count: 1 }],
    relationDelta: 16, xpReward: 95, moneyReward: 90,
    eventTags: ['registry_morgue', 'false_body', 'false_death', 'nelyud', 'quarantine'],
    eventData: { outcome: 'false_body_exposed', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Человек с чужой биркой разоблачен в зараженной камере.',
    eventSeverity: 4,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'morgue_relative_ira', NPC_DEFS.morgue_relative_ira, [
  {
    id: 'morgue_name_return',
    giverId: getPlotNpcNumericId('morgue_relative_ira')!,
    type: QuestType.FETCH,
    desc: 'Ира Заименованная: «Найдите пропавшее личное дело. Мне нужен не ящик, а имя, пока графа не стала чужой.»',
    targetItem: 'missing_record_file', targetCount: 1,
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Холодная камера-укрытие',
    rewardItem: 'sealed_complaint', rewardCount: 1,
    extraRewards: [{ defId: 'tea', count: 1 }],
    relationDelta: 18, xpReward: 70, moneyReward: 35,
    eventTags: ['registry_morgue', 'identity', 'missing_record', 'name_returned'],
    eventData: { outcome: 'name_returned', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Пропавшее личное дело вернуло Ире фамилию до закрытия ящика.',
    eventSeverity: 4,
  },
  {
    id: 'morgue_relative_escort',
    giverId: getPlotNpcNumericId('morgue_relative_ira')!,
    type: QuestType.VISIT,
    desc: 'Ира Заименованная: «Проведите меня до книги умерших. Одной мне выдадут тишину, а при свидетеле должны назвать строку.»',
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Кабинет книги умерших',
    targetHint: 'доведите Иру от окна приема через бирочную к книге умерших; не оставляйте ее среди холодных ящиков',
    rewardItem: 'personal_file_copy', rewardCount: 1,
    extraRewards: [{ defId: 'water_coupon', count: 1 }],
    relationDelta: 14, xpReward: 65, moneyReward: 25,
    requiresSideQuestDone: 'morgue_name_return',
    failOnNpcDeathId: getPlotNpcNumericId('morgue_relative_ira')!,
    eventTags: ['registry_morgue', 'escort', 'relative', 'identity', 'death_record'],
    eventData: { outcome: 'relative_escorted_to_ledger', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Иру довели до книги умерших как живого свидетеля записи.',
    eventSeverity: 4,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'morgue_quarantine_sanitar', NPC_DEFS.morgue_quarantine_sanitar, [
  {
    id: 'morgue_medicine_lock',
    giverId: getPlotNpcNumericId('morgue_quarantine_sanitar')!,
    type: QuestType.FETCH,
    desc: 'Санитар Крутов: «Принесите чистую карантинную справку. Открою медшкаф законно. Иначе это будет кража.»',
    targetItem: 'official_quarantine_clearance', targetCount: 1,
    targetFloorZ: REGISTRY_MORGUE_BASE_FLOOR,
    targetRoute: REGISTRY_MORGUE_TARGET_ROUTE,
    targetRoomDefId: 'Зараженная камера сверки',
    rewardItem: 'sanitary_kit', rewardCount: 1,
    extraRewards: [{ defId: 'antibiotic', count: 1 }],
    relationDelta: 12, xpReward: 75, moneyReward: 60,
    eventTags: ['registry_morgue', 'quarantine_paper_use', 'medical', 'legal_medicine'],
    eventData: { outcome: 'quarantine_paper_spent', routeId: REGISTRY_MORGUE_ROUTE_ID },
    eventTargetName: 'Чистая карантинная справка обменяна на законную медицинскую выдачу.',
    eventSeverity: 4,
  },
]);

export function generateRegistryMorgueDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 10000 };
  let nextRoomId = 0;

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.TILE_W;
    world.floorTex[i] = Tex.F_TILE;
  }
  generateZones(world);
  for (const zone of world.zones) {
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.level = zone.id % 7 === 0 ? 3 : 2;
    zone.fogged = false;
  }

  const ox = 488;
  const oy = 500;
  const washing = createDesignRoom(
    world, nextRoomId++, RoomType.MEDICAL,
    ox, oy, 16, 11,
    'Моечный коридор регистрации',
    Tex.TILE_W, Tex.F_TILE,
  );
  const cold = createDesignRoom(
    world, nextRoomId++, RoomType.STORAGE,
    ox + 17, oy, 28, 11,
    'Холодная камера-укрытие',
    Tex.HERMO_WALL, Tex.F_TILE,
    true,
  );
  const contaminated = createDesignRoom(
    world, nextRoomId++, RoomType.MEDICAL,
    ox + 46, oy, 13, 11,
    'Зараженная камера сверки',
    Tex.HERMO_WALL, Tex.F_TILE,
    true,
  );
  const reception = createDesignRoom(
    world, nextRoomId++, RoomType.OFFICE,
    ox, oy + 12, 16, 10,
    'Окно приема смертей',
    Tex.TILE_W, Tex.F_LINO,
  );
  const tagRoom = createDesignRoom(
    world, nextRoomId++, RoomType.OFFICE,
    ox + 17, oy + 12, 12, 10,
    'Бирочная',
    Tex.TILE_W, Tex.F_LINO,
  );
  const ledger = createDesignRoom(
    world, nextRoomId++, RoomType.OFFICE,
    ox + 30, oy + 12, 16, 10,
    'Кабинет книги умерших',
    Tex.MARBLE, Tex.F_PARQUET,
  );

  linkRooms(world, washing, reception, DoorState.CLOSED);
  linkRooms(world, reception, tagRoom, DoorState.CLOSED);
  linkRooms(world, tagRoom, ledger, DoorState.CLOSED);
  linkRooms(world, tagRoom, cold, DoorState.HERMETIC_CLOSED);
  linkRooms(world, cold, contaminated, DoorState.HERMETIC_CLOSED);
  sanitizeDoors(world);

  placeDesignLift(world, reception.x + 1, reception.y + 1, LiftDirection.UP);
  placeDesignLift(world, reception.x + 1, reception.y + 3, LiftDirection.DOWN);

  decorateRegistryMorgue(world, { reception, washing, tagRoom, cold, ledger, contaminated });

  const faina = spawnMorgueNpc(
    entities, nextId, NPC_DEFS.morgue_registrar_faina,
    'morgue_registrar_faina', reception.x + 8, reception.y + 2,
  );
  const stepan = spawnMorgueNpc(
    entities, nextId, NPC_DEFS.morgue_orderly_stepan,
    'morgue_orderly_stepan', washing.x + 5, washing.y + 6,
    true, 'crowbar',
  );
  const ira = spawnMorgueNpc(
    entities, nextId, NPC_DEFS.morgue_relative_ira,
    'morgue_relative_ira', reception.x + 4, reception.y + 7,
  );
  const sanitar = spawnMorgueNpc(
    entities, nextId, NPC_DEFS.morgue_quarantine_sanitar,
    'morgue_quarantine_sanitar', contaminated.x + 2, contaminated.y + 2,
    true, 'pipe',
  );

  seedRegistryMorgueContainers(world, { tagRoom, cold, ledger, contaminated }, { faina, stepan, sanitar, ira });
  seedRegistryMorgueReadables(world, entities, nextId, { reception, tagRoom, cold, ledger, contaminated });

  spawnMorgueMonster(
    world, entities, nextId,
    contaminated.x + contaminated.w - 4,
    contaminated.y + contaminated.h - 4,
    MonsterKind.NELYUD,
    'Человек с чужой биркой',
  );
  spawnMorgueMonster(
    world, entities, nextId,
    ledger.x + ledger.w - 5,
    ledger.y + Math.floor(ledger.h / 2),
    MonsterKind.PECHATEED,
    'Печатеед свидетельств',
  );

  world.bakeLights();

  const spawnX = reception.x + 6.5;
  const spawnY = reception.y + 5.5;
  genLog(`[DESIGN_FLOOR] ${REGISTRY_MORGUE_ROUTE_ID} z=${REGISTRY_MORGUE_FUTURE_Z} at (${ox}, ${oy}) rooms=${nextRoomId}`);
    const generation: DesignFloorGeneration = { isDecentralized: true, world, entities, spawnX, spawnY };

  const rngFn = seededRandom(hashSeed('design-full:registry_morgue:18', 18));
  expandRegistryMorgueGeometry(world, rngFn);
  reinforceRegistryMorgueAuthoredTerritory(world);
  retuneRegistryMorgueZones(world);

  applyDesignFloorPopulationField(generation, { id: 'registry_morgue', z: 18 });
  return generation;
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
