import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { MonsterKind, QuestType } from '../src/core/types';
import { CONTRACTS } from '../src/data/contracts';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { ITEMS } from '../src/data/items';
import { getMonsterEcology } from '../src/data/monster_ecology';
import {
  allNpcPackages,
  getNpcPackage,
  getPlotNpcCount,
  getPlotNpcNumericId,
  getPlotNpcStringId,
} from '../src/data/npc_packages';
import { PLOT_NPC_ID_ORDER } from '../src/data/npc_plot_ids';
import { PLOT_CHAIN, SIDE_QUESTS, sideQuestGiverId } from '../src/data/plot';
import { floorRunZAllowsNpcs, PROCEDURAL_FLOOR_ZS } from '../src/data/procedural_floors';

/* ── Достижимость авторского контента ─────────────────────────────
 *
 * Контент в этом проекте теряется молча. Личность регистрируется, но её никто
 * не ставит; квест ссылается на предмет, которого нет в описи; шаг цепочки
 * ждёт дающего, которого выселили на безлюдный этаж, и вместе с ним стоит всё,
 * что за ним. Проверить это глазами нельзя: 468 пакетов, 430 сайд-квестов и
 * 205 контрактов лежат в тридцати восьми модулях, и каждая из потерь выглядит
 * как обычная строка регистрации.
 *
 * Здесь заперто РЕЕСТРОВОЕ условие достижимости — то, что считается без
 * генерации мира и потому стоит копейки в гейте: у человека есть настоящий
 * этаж, у квеста есть дающий, у цели есть предмет, вид или маршрут.
 *
 * Мировая сторона того же вопроса — «объявил дом, значит на нём и стоит» —
 * заперта в `tests/npc-home-floor.test.ts`, а «объявил комнату, значит вырыл» в
 * `tests/named-rooms.test.ts`: обе генерируют этажи и потому живут в наборе
 * `test:generation`.
 *
 * ВНИМАНИЕ ПРИ ПРАВКЕ. Этот файл намеренно не тянет слой генерации и остаётся в
 * быстром `test:unit` — то есть и в `check:readonly`, а не только в полном
 * гейте. Маршрутизация в `scripts/run-unit-tests.mjs` — подстрочный поиск пути к
 * этому слою по ВСЕМУ исходнику, включая комментарии, поэтому здесь его нельзя
 * ни импортировать, ни упоминать дословно. Импорт (или упоминание) уводит файл в
 * `test:generation` и добавляет ему тринадцать минут ожидания.
 *
 * Числа ниже — потолок «не ухудшать», а не цель. Контент растёт, поэтому
 * сравнение идёт через `>=`; списки исключений закрыты точным равенством,
 * чтобы новая потеря не спряталась за старой.
 */

const DESIGN_FLOOR_IDS = new Set(DESIGN_FLOOR_ROUTES.map(route => route.id));
const DESIGN_Z_BY_ID = new Map<string, number>(DESIGN_FLOOR_ROUTES.map(route => [route.id, route.z]));
const ROUTE_ZS = new Set<number>([...DESIGN_FLOOR_ROUTES.map(route => route.z), ...PROCEDURAL_FLOOR_ZS]);
const SIDE_QUEST_IDS = new Set(SIDE_QUESTS.map(quest => quest.id));

/** Целевой предмет `money` — санкционированный сентинел: `quests.ts` считает его
 *  по кошельку игрока, а не по описи, поэтому в ITEMS его нет и быть не должно. */
const MONEY_SENTINEL = 'money';

/** Слоты, снятые с регистрации осознанно. Номера заморожены (сейв хранит числа),
 *  но пакета за ними нет: три `liquidator_*` вытеснены близнецами `liq_*`, роль
 *  `arena_master` несёт Марко Лоло, а `void_warning` и два клерка протокола следа
 *  ушли вместе с зачисткой Пустоты. Равенство, а не `<=`: восьмая такая строка
 *  означает, что кто-то потерял человека, а не убрал дубль. */
const DEREGISTERED_PLOT_SLOTS = [
  'arena_master',
  'floor20_void_borrowed_neighbor',
  'floor20_void_protocol_clerk',
  'liquidator_armorer',
  'liquidator_medic',
  'liquidator_quartermaster',
  'void_warning',
];

/** Единственная личность, которую этаж не доставляет: голос приходит событием. */
const EVENT_ONLY_PACKAGES = ['voice'];

/** Контракты, спрятанные от выдачи. Достижимы только отладочной командой
 *  «ГОВНЯК: курьерский пакет» (`systems/debug.ts`), и это осознанно. */
const DEBUG_ONLY_CONTRACTS = [
  'govnyak_courier_confiscate',
  'govnyak_courier_deliver',
  'govnyak_courier_switch',
];

/** TALK-контракт без объявленной цели: `lostchildescort` получает `targetNpcId`
 *  живым родителем в `quests.ts`, а не из данных. Второму такому имени здесь
 *  делать нечего — он просто не завершится. */
const RUNTIME_TARGET_CONTRACTS = ['lostchildescort'];

/* Нижние границы объёма контента на 2026-08-20. Их роль — поймать не правку
   баланса, а молчаливое выпадение целого модуля из точки сборки. */
const CONTENT_FLOOR = {
  packages: 468,
  plotSlots: 475,
  sideQuests: 430,
  contracts: 205,
  plotChain: 19,
} as const;

function itemKnown(defId: string | undefined): boolean {
  return defId === undefined || defId === MONEY_SENTINEL || ITEMS[defId] !== undefined;
}

function packageOfNumericId(numericId: number | undefined) {
  if (numericId === undefined) return undefined;
  const stringId = getPlotNpcStringId(numericId);
  return stringId ? getNpcPackage(stringId) : undefined;
}

/** Кого нельзя поставить дающим или целью: либо личности нет, либо она приходит
 *  событием и на этаже её не встретить, либо её дом не пускает людей. */
function unreachableActorReason(numericId: number | undefined): string | undefined {
  if (numericId === undefined) return undefined;
  const stringId = getPlotNpcStringId(numericId);
  if (!stringId) return `слот ${numericId} не разрешается в строковый id`;
  const pack = getNpcPackage(stringId);
  if (!pack) return `"${stringId}" нет среди зарегистрированных пакетов`;
  if (pack.placement.presence === 'event_only') return `"${stringId}" объявлен event_only — этаж его не доставляет`;
  const key = pack.placement.homeFloorKey;
  if (!key.startsWith('design:')) return undefined;
  const floorId = key.slice('design:'.length);
  const z = DESIGN_Z_BY_ID.get(floorId);
  if (z === undefined) return `"${stringId}" объявил дом "${key}", которого нет в маршруте`;
  if (!floorRunZAllowsNpcs(z)) return `"${stringId}" живёт на безлюдном "${key}" (z=${z})`;
  return undefined;
}

function rewardProblems(quest: {
  rewardItem?: string;
  extraRewards?: { defId: string; count: number }[];
}): string[] {
  const problems: string[] = [];
  if (!itemKnown(quest.rewardItem)) problems.push(`награда "${quest.rewardItem}" не описана в ITEMS`);
  for (const extra of quest.extraRewards ?? []) {
    if (!itemKnown(extra.defId)) problems.push(`доп. награда "${extra.defId}" не описана в ITEMS`);
  }
  return problems;
}

function monsterProblem(kind: MonsterKind | undefined): string | undefined {
  if (kind === undefined) return undefined;
  return getMonsterEcology(kind) ? undefined : `вид ${kind} не описан в экологии — его некому расселять`;
}

function report(lines: readonly string[], headline: string): string {
  return `${headline}: ${lines.length}\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? `\n… ещё ${lines.length - 30}` : ''}`;
}

test('объём авторского контента не проседает', () => {
  assert.ok(
    allNpcPackages().length >= CONTENT_FLOOR.packages,
    `пакетов NPC ${allNpcPackages().length}, было не меньше ${CONTENT_FLOOR.packages} — модуль выпал из src/content.ts?`,
  );
  assert.ok(
    getPlotNpcCount() >= CONTENT_FLOOR.plotSlots && PLOT_NPC_ID_ORDER.length === getPlotNpcCount(),
    `слотов ${getPlotNpcCount()} при списке ${PLOT_NPC_ID_ORDER.length}; порядок заморожен и только дописывается в конец`,
  );
  assert.ok(SIDE_QUESTS.length >= CONTENT_FLOOR.sideQuests, `сайд-квестов ${SIDE_QUESTS.length}, было не меньше ${CONTENT_FLOOR.sideQuests}`);
  assert.ok(CONTRACTS.length >= CONTENT_FLOOR.contracts, `контрактов ${CONTRACTS.length}, было не меньше ${CONTENT_FLOOR.contracts}`);
  // Дописывать шаги можно, терять — нет: за последними тремя стоит финал в
  // Пустоте, и укоротить цепочку значит отрезать его от игрока.
  assert.ok(
    PLOT_CHAIN.length >= CONTENT_FLOOR.plotChain,
    `шагов цепочки ${PLOT_CHAIN.length}, было не меньше ${CONTENT_FLOOR.plotChain} — финал в Пустоте цел?`,
  );
});

test('у каждого пакета NPC есть настоящий дом, который пускает людей', () => {
  const problems: string[] = [];
  for (const pack of allNpcPackages()) {
    const key = pack.placement.homeFloorKey;
    if (key.startsWith('design:')) {
      const floorId = key.slice('design:'.length);
      if (!DESIGN_FLOOR_IDS.has(floorId)) {
        problems.push(`${pack.id}: дом "${key}" — такого маршрутного этажа нет`);
        continue;
      }
      const z = DESIGN_Z_BY_ID.get(floorId)!;
      // Безлюдный маршрутный этаж отменяет доставку целиком: человек, объявивший
      // там дом, не появится нигде, и его квест уйдёт вместе с ним.
      if (!floorRunZAllowsNpcs(z)) problems.push(`${pack.id}: дом "${key}" (z=${z}) не пускает NPC — человек не появится`);
      continue;
    }
    if (!key.startsWith('procedural:') && !key.startsWith('story:') && !key.startsWith('floor_instance:')) {
      problems.push(`${pack.id}: дом "${key}" вне известного пространства ключей`);
    }
  }
  assert.deepEqual(problems, [], report(problems, 'пакетов с недостижимым домом'));
});

test('несуществующие личности — только осознанно снятые слоты', () => {
  const registered = new Set(allNpcPackages().map(pack => pack.id));
  const orphans = PLOT_NPC_ID_ORDER.filter(id => !registered.has(id)).sort();
  assert.deepEqual(
    orphans,
    DEREGISTERED_PLOT_SLOTS,
    `слоты без пакета разошлись со списком снятых.\nсейчас: ${orphans.join(', ')}\nждали: ${DEREGISTERED_PLOT_SLOTS.join(', ')}`,
  );
});

test('event_only остаётся исключением на одного', () => {
  const eventOnly = allNpcPackages()
    .filter(pack => pack.placement.presence === 'event_only')
    .map(pack => pack.id)
    .sort();
  assert.deepEqual(
    eventOnly,
    EVENT_ONLY_PACKAGES,
    `event_only не доставляется этажом. Новое имя здесь = человек, которого никто не встретит: ${eventOnly.join(', ')}`,
  );
});

test('каждый шаг сюжетной цепочки выполним, и ни один не запирает следующие', () => {
  const problems: string[] = [];
  PLOT_CHAIN.forEach((step, index) => {
    const at = `шаг ${index} [${QuestType[step.type]}]`;
    if (step.giverId === undefined) {
      // Шаг без дающего законен только там, где сдавать некому: он выдаёт себя
      // сам, как только закрыт предыдущий, и подписывается `sourceLabel`.
      if (!step.sourceLabel) problems.push(`${at}: нет ни дающего, ни подписи sourceLabel — поручение неоткуда взять`);
    } else {
      const reason = unreachableActorReason(step.giverId);
      if (reason) problems.push(`${at}: дающий недостижим — ${reason}; вместе с ним встают шаги ${index}..${PLOT_CHAIN.length - 1}`);
    }

    const targetReason = unreachableActorReason(step.targetNpcId);
    if (targetReason) problems.push(`${at}: цель недостижима — ${targetReason}`);

    if (!itemKnown(step.targetItem)) problems.push(`${at}: цель-предмет "${step.targetItem}" не описана в ITEMS`);
    problems.push(...rewardProblems(step).map(line => `${at}: ${line}`));

    const monster = monsterProblem(step.targetMonsterKind);
    if (monster) problems.push(`${at}: ${monster}`);

    for (const z of [step.targetFloorZ, step.visitFloorZ]) {
      if (z !== undefined && !ROUTE_ZS.has(z)) problems.push(`${at}: цель на z=${z}, куда лифты не ходят`);
    }
    if (step.targetRoute?.designFloorId && !DESIGN_FLOOR_IDS.has(step.targetRoute.designFloorId)) {
      problems.push(`${at}: маршрут "${step.targetRoute.designFloorId}" не существует`);
    }
    if (step.type === QuestType.VISIT && step.targetFloorZ === undefined && step.visitFloorZ === undefined
      && step.targetRoomDefId === undefined && step.targetRoomType === undefined && step.targetZoneTag === undefined) {
      problems.push(`${at}: VISIT без единого признака места — засчитать нечего`);
    }
  });
  assert.deepEqual(problems, [], report(problems, 'сломанных шагов цепочки'));
});

test('каждый сайд-квест кто-то выдаёт, и его цель существует', () => {
  const problems: string[] = [];
  for (const quest of SIDE_QUESTS) {
    const giverId = sideQuestGiverId(quest);
    if (giverId === undefined) {
      // `giverId` в литерале квеста замерзает на undefined, когда дающий
      // регистрируется позже; `giverPlotNpcId` — второй ключ к тому же человеку.
      problems.push(`${quest.id}: дающий не разрешается ни через giverId, ни через giverPlotNpcId`);
    } else {
      const reason = unreachableActorReason(giverId);
      if (reason) problems.push(`${quest.id}: дающий недостижим — ${reason}`);
    }

    const targetReason = unreachableActorReason(quest.targetNpcId);
    if (targetReason) problems.push(`${quest.id}: цель недостижима — ${targetReason}`);

    if (!itemKnown(quest.targetItem)) problems.push(`${quest.id}: цель-предмет "${quest.targetItem}" не описана в ITEMS`);
    problems.push(...rewardProblems(quest).map(line => `${quest.id}: ${line}`));

    const monster = monsterProblem(quest.targetMonsterKind);
    if (monster) problems.push(`${quest.id}: ${monster}`);

    if (quest.requiresPlotStepDone !== undefined
      && (quest.requiresPlotStepDone < 0 || quest.requiresPlotStepDone >= PLOT_CHAIN.length)) {
      problems.push(`${quest.id}: ждёт шаг ${quest.requiresPlotStepDone}, а в цепочке ${PLOT_CHAIN.length} шагов — предложение не всплывёт никогда`);
    }

    const required = quest.requiresSideQuestDone === undefined
      ? []
      : Array.isArray(quest.requiresSideQuestDone) ? quest.requiresSideQuestDone : [quest.requiresSideQuestDone];
    for (const id of required) {
      if (!SIDE_QUEST_IDS.has(id)) problems.push(`${quest.id}: ждёт несуществующий "${id}" — условие не закроется`);
    }
    for (const id of quest.blockedBySideQuestIds ?? []) {
      if (!SIDE_QUEST_IDS.has(id)) problems.push(`${quest.id}: блокируется несуществующим "${id}"`);
    }
    for (const id of quest.abandonsSideQuestIds ?? []) {
      if (!SIDE_QUEST_IDS.has(id)) problems.push(`${quest.id}: отменяет несуществующий "${id}"`);
    }
    if (quest.failOnNpcDeathId !== undefined && !packageOfNumericId(quest.failOnNpcDeathId)) {
      problems.push(`${quest.id}: срывается смертью слота ${quest.failOnNpcDeathId}, за которым нет личности`);
    }
  }
  assert.deepEqual(problems, [], report(problems, 'сайд-квестов с недостижимой целью или без дающего'));
});

test('каждый контракт выполним', () => {
  const problems: string[] = [];
  const debugOnly: string[] = [];
  const runtimeTarget: string[] = [];
  for (const contract of CONTRACTS) {
    if (contract.tags.includes('debug_only')) debugOnly.push(contract.id);

    if (!itemKnown(contract.targetItem)) problems.push(`${contract.id}: цель-предмет "${contract.targetItem}" не описана в ITEMS`);
    problems.push(...rewardProblems(contract).map(line => `${contract.id}: ${line}`));

    if (!ROUTE_ZS.has(contract.target.z)) problems.push(`${contract.id}: цель на z=${contract.target.z}, куда лифты не ходят`);
    if (contract.target.route?.designFloorId && !DESIGN_FLOOR_IDS.has(contract.target.route.designFloorId)) {
      problems.push(`${contract.id}: маршрут "${contract.target.route.designFloorId}" не существует`);
    }

    if (contract.targetPlotNpcStringId !== undefined) {
      // Строковый id — это лечение замерзшего `getPlotNpcNumericId(...)!` в
      // литерале: цель регистрируется gen-модулем позже contracts.ts.
      const numericId = getPlotNpcNumericId(contract.targetPlotNpcStringId);
      if (numericId === undefined) problems.push(`${contract.id}: цель "${contract.targetPlotNpcStringId}" не зарегистрирована`);
      else {
        const reason = unreachableActorReason(numericId);
        if (reason) problems.push(`${contract.id}: цель недостижима — ${reason}`);
      }
    } else {
      const reason = unreachableActorReason(contract.targetNpcId);
      if (reason) problems.push(`${contract.id}: цель недостижима — ${reason}`);
    }

    if (contract.type === QuestType.TALK
      && contract.targetNpcId === undefined
      && contract.targetPlotNpcStringId === undefined
      && contract.targetNpcName === undefined) {
      runtimeTarget.push(contract.id);
    }

    const monster = monsterProblem(contract.targetMonsterKind);
    if (monster) problems.push(`${contract.id}: ${monster}`);
    if (contract.type === QuestType.KILL && contract.targetMonsterKind === undefined
      && contract.targetNpcId === undefined && contract.targetPlotNpcStringId === undefined) {
      problems.push(`${contract.id}: KILL без вида и без личности — засчитать нечего`);
    }
  }
  assert.deepEqual(problems, [], report(problems, 'контрактов с недостижимой целью'));
  assert.deepEqual(debugOnly.sort(), DEBUG_ONLY_CONTRACTS, 'список контрактов, спрятанных от выдачи, изменился');
  assert.deepEqual(
    runtimeTarget.sort(),
    RUNTIME_TARGET_CONTRACTS,
    `TALK-контракт без цели в данных завершается только если её проставляет рантайм.\nсейчас: ${runtimeTarget.join(', ')}`,
  );
});

test('идентичность квестов не размыта: id уникальны, слоты личностей взаимно однозначны', () => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const quest of SIDE_QUESTS) {
    if (seen.has(quest.id)) duplicates.push(quest.id);
    seen.add(quest.id);
  }
  assert.deepEqual(duplicates, [], report(duplicates, 'повторяющихся id сайд-квестов'));

  const contractIds = new Set<string>();
  const contractDupes: string[] = [];
  for (const contract of CONTRACTS) {
    if (contractIds.has(contract.id)) contractDupes.push(contract.id);
    contractIds.add(contract.id);
  }
  assert.deepEqual(contractDupes, [], report(contractDupes, 'повторяющихся id контрактов'));

  const slotClashes: string[] = [];
  for (const pack of allNpcPackages()) {
    const numericId = getPlotNpcNumericId(pack.id);
    if (numericId === undefined) {
      slotClashes.push(`${pack.id}: у пакета нет числового слота — A-Life не сможет его зарезервировать`);
      continue;
    }
    if (getPlotNpcStringId(numericId) !== pack.id) {
      slotClashes.push(`${pack.id}: слот ${numericId} указывает на "${getPlotNpcStringId(numericId)}" — две личности делят один сейв-номер`);
    }
  }
  assert.deepEqual(slotClashes, [], report(slotClashes, 'разъехавшихся слотов личностей'));
});
