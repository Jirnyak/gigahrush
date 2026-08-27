/* ── Перевалка: держатели ключей и их поручения ───────────────────
 *
 * Четыре базы — четыре разные природы доступа. Одинаковых поручений с разными
 * именами здесь быть не должно: сила и грибы, разговор и услуга, контрабанда и
 * умолчание, теневики. Ключ каждая ветка выдаёт своим последним шагом, и он же
 * лежит первым слотом в инвентаре хозяина — значит убийство, карман и прилавок
 * работают тем же предметом и без отдельного кода.
 */

import { QuestType, type Entity, type Room } from '../../core/types';
import { getPlotNpcNumericId } from '../../data/npc_packages';
import { registerFloorSideQuest } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import {
  DESIGN_NPC_HOME_FLOOR_KEY,
  NPC_DEFS,
  PEREVALKA_BASE_TAGS,
  PEREVALKA_DESIGN_FLOOR_ID,
  PEREVALKA_KEY_CITIZEN,
  PEREVALKA_KEY_LIQUIDATOR,
  PEREVALKA_KEY_SCIENCE,
  PEREVALKA_KEY_WILD,
  PEREVALKA_SHADOW_KIND,
  PEREVALKA_Z,
} from './meta';
import type { PerevalkaBaseRooms } from './yard';

const ROUTE = { designFloorId: PEREVALKA_DESIGN_FLOOR_ID, z: PEREVALKA_Z } as const;
const TAGS = [...PEREVALKA_BASE_TAGS];

/* ── Дикие: сила и грибы ─────────────────────────────────────── */
registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'perevalka_dantes', NPC_DEFS.perevalka_dantes, [
  {
    id: 'perevalka_dantes_harvest',
    giverId: getPlotNpcNumericId('perevalka_dantes')!,
    giverPlotNpcId: 'perevalka_dantes',
    type: QuestType.FETCH,
    desc: 'Дантес считает урожай, а не слова. Принеси шесть кусков грибной массы — с фермы, с этажа, откуда хочешь.',
    targetItem: 'mushroom_mass',
    targetCount: 6,
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    relationDelta: 6,
    xpReward: 45,
    moneyReward: 140,
    eventTags: [...TAGS, 'wild', 'mushroom', 'freight_economy'],
    eventTargetName: 'Грибная артель Дантеса приняла урожай от игрока.',
  },
  {
    id: 'perevalka_dantes_hold_farm',
    giverId: getPlotNpcNumericId('perevalka_dantes')!,
    giverPlotNpcId: 'perevalka_dantes',
    type: QuestType.VISIT,
    desc: 'Постой на ферме, пока Дантес снимает срез. На запах грибницы полезут — держи ферму, и ключ от нижнего лифта твой.',
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    targetRoomDefId: 'perevalka_wild_farm',
    holdSeconds: 30,
    holdResetOnExit: true,
    holdSpawnMonsters: 3,
    holdSpawnIntervalSeconds: 12,
    holdSpawnMaxAlive: 8,
    rewardItem: PEREVALKA_KEY_WILD,
    rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 16 }],
    relationDelta: 14,
    xpReward: 110,
    moneyReward: 60,
    requiresSideQuestDone: 'perevalka_dantes_harvest',
    eventTags: [...TAGS, 'wild', 'mushroom', 'key_gate', 'bounded_event', 'not_refill'],
    eventData: { holdBoundedMaxAlive: 8, spawnIntervalSeconds: 12 },
    eventTargetName: 'Ферма Дантеса удержана, ключ нижнего лифта отдан игроку.',
  },
]);

/* ── Гражданские: разговор и услуга ──────────────────────────── */
registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'perevalka_ariel', NPC_DEFS.perevalka_ariel, [
  {
    id: 'perevalka_ariel_favor',
    giverId: getPlotNpcNumericId('perevalka_ariel')!,
    giverPlotNpcId: 'perevalka_ariel',
    type: QuestType.FETCH,
    desc: 'Ариэль просит воды для очереди: четыре фляги. Маленькая услуга, говорит она, стоит дороже большого выстрела.',
    targetItem: 'water',
    targetCount: 4,
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    relationDelta: 8,
    xpReward: 40,
    moneyReward: 120,
    eventTags: [...TAGS, 'citizen', 'favor', 'diplomacy'],
    eventTargetName: 'Очередь общинной перевалки получила воду.',
  },
  {
    id: 'perevalka_ariel_parley',
    giverId: getPlotNpcNumericId('perevalka_ariel')!,
    giverPlotNpcId: 'perevalka_ariel',
    type: QuestType.VISIT,
    desc: 'Постой у общего стола, пока Ариэль говорит с досмотром. Стрелять не надо — надо просто быть рядом и молчать.',
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    targetRoomDefId: 'perevalka_citizen_hall',
    holdSeconds: 32,
    holdResetOnExit: true,
    rewardItem: PEREVALKA_KEY_CITIZEN,
    rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 2 }],
    relationDelta: 16,
    xpReward: 100,
    moneyReward: 40,
    requiresSideQuestDone: 'perevalka_ariel_favor',
    eventTags: [...TAGS, 'citizen', 'diplomacy', 'key_gate'],
    eventTargetName: 'Переговоры Ариэль закончились ключом общинной перевалки.',
  },
]);

/* ── Ликвидаторы: контрабанда и умолчание ────────────────────── */
registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'perevalka_tomilov', NPC_DEFS.perevalka_tomilov, [
  {
    id: 'perevalka_tomilov_manifest',
    giverId: getPlotNpcNumericId('perevalka_tomilov')!,
    giverPlotNpcId: 'perevalka_tomilov',
    type: QuestType.FETCH,
    desc: 'Томилову нужен кованый корешок с чужой печатью. Он спишет им один груз — и заодно потеряет ключ от нижнего лифта.',
    targetItem: 'forged_permit_slip',
    targetCount: 1,
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    targetRoomDefId: 'perevalka_liquidator_hq',
    rewardItem: PEREVALKA_KEY_LIQUIDATOR,
    rewardCount: 1,
    extraRewards: [{ defId: 'liquidator_token', count: 1 }],
    relationDelta: 6,
    xpReward: 95,
    moneyReward: 0,
    eventTags: [...TAGS, 'liquidator', 'contraband', 'key_gate', 'silence'],
    eventTargetName: 'Досмотр Томилова списал груз, а ключ нижнего лифта ушёл игроку.',
  },
  {
    id: 'perevalka_tomilov_grey_load',
    giverId: getPlotNpcNumericId('perevalka_tomilov')!,
    giverPlotNpcId: 'perevalka_tomilov',
    type: QuestType.FETCH,
    desc: 'Отнеси через его пост четыре куска грибной массы диких. В журнале этого груза не будет, и разговора о нём тоже.',
    targetItem: 'mushroom_mass',
    targetCount: 4,
    targetFloorZ: PEREVALKA_Z,
    targetRoute: ROUTE,
    targetRoomDefId: 'perevalka_liquidator_depot',
    extraRewards: [{ defId: 'ammo_9mm', count: 20 }],
    relationDelta: 4,
    xpReward: 60,
    moneyReward: 180,
    requiresSideQuestDone: 'perevalka_tomilov_manifest',
    eventTags: [...TAGS, 'liquidator', 'wild', 'contraband', 'double_dealing'],
    eventTargetName: 'Груз диких прошёл заставу Томилова мимо журнала.',
  },
]);

/* ── Учёные: только теневики ─────────────────────────────────── */
registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'perevalka_zhirnyak', NPC_DEFS.perevalka_zhirnyak, [
  {
    id: 'perevalka_zhirnyak_shadow_count',
    giverId: getPlotNpcNumericId('perevalka_zhirnyak')!,
    giverPlotNpcId: 'perevalka_zhirnyak',
    type: QuestType.KILL,
    desc: 'Жирняку не нужны деньги и не нужен союз. Убей троих теневиков — где угодно — и принеси ему счёт. Счёт это данные.',
    targetMonsterKind: PEREVALKA_SHADOW_KIND,
    killNeeded: 3,
    rewardItem: PEREVALKA_KEY_SCIENCE,
    rewardCount: 1,
    extraRewards: [{ defId: 'anti_spore_inhaler', count: 1 }],
    relationDelta: 10,
    xpReward: 130,
    moneyReward: 0,
    eventTags: [...TAGS, 'scientist', 'shadow', 'key_gate'],
    eventTargetName: 'Счёт по теневикам сдан Жирняку, ключ теневой лаборатории отдан.',
  },
]);

/** Хозяева баз стоят там, где живут: комната объявлена, доставка их не двоит. */
export function spawnPerevalkaKeyholders(
  entities: Entity[],
  nextId: { v: number },
  bases: readonly PerevalkaBaseRooms[],
): void {
  const byId = new Map(bases.map(base => [base.id, base]));
  for (const [baseId, npcId, angle] of [
    ['wild', 'perevalka_dantes', Math.PI],
    ['citizen', 'perevalka_ariel', Math.PI],
    ['liquidator', 'perevalka_tomilov', Math.PI],
    ['science', 'perevalka_zhirnyak', Math.PI],
  ] as const) {
    const room: Room | undefined = byId.get(baseId)?.hq;
    if (!room) continue;
    const x = room.x + Math.floor(room.w / 2) + 0.5;
    const y = room.y + Math.floor(room.h / 2) + 0.5;
    requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, x, y, {
      angle,
      aiTarget: { x: Math.floor(x), y: Math.floor(y) },
      canGiveQuest: true,
    });
  }
}

/** Держатели ключей по базам: реестр для тестов и отладки. */
export const PEREVALKA_KEYHOLDERS: readonly string[] = [
  'perevalka_dantes',
  'perevalka_ariel',
  'perevalka_tomilov',
  'perevalka_zhirnyak',
];
