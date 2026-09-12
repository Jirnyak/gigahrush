/* ── Архив узнаёт, что с ним сделали ──────────────────────────────
 * Пять видов событий архива были объявлены (`RaionsovetArchiveEventKind`), и ни
 * один не публиковался: `publishRaionsovetArchiveEvent` не звали ни разу, а
 * `resolveRaionsovetArchiveAccess` — тем более. Четыре побочки этажа при этом
 * игрались, и подозрение с репутацией за подлог никуда не шли.
 *
 * Ребро `systems → gen` не нужно: этаж подписывается на общую шину снизу вверх,
 * как `gen/production_belt/decisions.ts` и `gen/hell/choir_tax.ts`. Слушаются
 * два уже публикуемых семейства фактов:
 *
 *   1. `quest_completed` с `data.sideQuestId` — четыре вида по четырём делам;
 *   2. `access_granted` / `permit_exposed` — пятый, `archive_denied`, и
 *      проверка допуска. Бумага, поданная в архивное окно, уже проходит через
 *      `recordPermitAccess` / `recordPermitExposure` (`systems/inventory.ts`),
 *      так что спрашивать `resolveRaionsovetArchiveAccess` есть с чем и есть
 *      когда: `permit_exposed` — это и есть отказ, за него `witnessed` и
 *      четвёртая тяжесть уже прописаны в самой публикации.
 *
 * Найдено при подключении: `publishRaionsovetArchiveEvent` печатал `z: 30`
 * литералом, а этаж стоит на `z = 22`. Пока функцию не звали, врать было
 * некому; на первом же вызове факт архива уехал бы в министерство — вместе с
 * зонными буферами и слухами.
 */

import { type GameState, type WorldEvent } from '../../core/types';
import { type World } from '../../core/world';
import { registerFloorScopedReset } from '../../world/world_contexts';
import { registerWorldEventObserver } from '../../systems/events';
import { type RaionsovetArchiveEventKind } from './geometry';
import {
  RAIONSOVET_ARCHIVE_ACCESS_CHECKS,
  RAIONSOVET_ARCHIVE_ROUTE_ID,
  RAIONSOVET_ARCHIVE_Z,
  publishRaionsovetArchiveEvent,
  resolveRaionsovetArchiveAccess,
} from './meta';

/** Какое дело какой вид события закрывает. Ключ — `sideQuestId` шага. */
const QUEST_TO_KIND: Readonly<Record<string, RaionsovetArchiveEventKind>> = {
  archive_get_floor_permit: 'permit_issued',
  archive_swap_card: 'card_swapped',
  archive_save_or_burn: 'shelf_burned',
  archive_market_license: 'market_license_changed',
};

/** Какая проверка допуска какой вид объявляет, когда бумага ПРИНЯТА. */
const CHECK_TO_KIND: Readonly<Record<string, RaionsovetArchiveEventKind>> = {
  access_living_shelf_legal: 'permit_issued',
  access_market_license_safe: 'market_license_changed',
  access_apartment_card_swap: 'card_swapped',
};

/** Вид объявляется один раз за прогон: повторная подача той же бумаги ничего
 *  в картотеке не двигает. Дела и бумаги считаются раздельно — сдать дело и
 *  предъявить допуск это два разных факта об одном виде. */
const announcedQuests = new Set<string>();
const announcedTargets = new Set<string>();
let activeWorld: World | null = null;

/* Этаж перестал быть играемым — объявленное уходит вместе с ним, иначе новый
 * прогон архива начнётся с чужой памятью и первое же дело промолчит. */
registerFloorScopedReset(current => {
  if (activeWorld !== current) resetRaionsovetArchiveDecisions();
});

/** Зовёт генератор: этаж собран, память объявленного пуста. */
export function bindRaionsovetArchiveDecisions(world: World): void {
  resetRaionsovetArchiveDecisions();
  activeWorld = world;
}

export function resetRaionsovetArchiveDecisions(): void {
  activeWorld = null;
  announcedQuests.clear();
  announcedTargets.clear();
}

function checkForItem(itemId: string | undefined) {
  if (!itemId) return undefined;
  return RAIONSOVET_ARCHIVE_ACCESS_CHECKS.find(c => c.legalItemId === itemId || c.illegalItemId === itemId);
}

function handleArchiveQuest(state: GameState, event: WorldEvent): void {
  const sideQuestId = event.data?.sideQuestId;
  if (typeof sideQuestId !== 'string') return;
  const kind = QUEST_TO_KIND[sideQuestId];
  if (!kind || announcedQuests.has(sideQuestId)) return;
  announcedQuests.add(sideQuestId);
  publishRaionsovetArchiveEvent(
    state,
    kind,
    RAIONSOVET_ARCHIVE_ROUTE_ID,
    sideQuestId,
    event.roomId,
    event.zoneId,
  );
}

function handleArchivePaper(state: GameState, event: WorldEvent): void {
  const check = checkForItem(event.itemId);
  if (!check) return;
  /* Отказ решает не наблюдатель, а сама проверка допуска: она одна знает, какая
   * бумага у этой цели законна, какая проходит подлогом и какая не проходит
   * вовсе. Разоблачённая бумага спрашивается СВОИМ id — если он не из пары этой
   * цели, ответом будет `allowed: false`, то есть отказ по существу. */
  const access = resolveRaionsovetArchiveAccess(event.itemId!, check.targetId);
  if (!access) return;
  const denied = event.type === 'permit_exposed' || !access.allowed;
  const kind: RaionsovetArchiveEventKind = denied ? 'archive_denied' : CHECK_TO_KIND[check.id];
  if (!kind) return;
  const key = `${check.targetId}:${kind}`;
  if (announcedTargets.has(key)) return;
  announcedTargets.add(key);
  publishRaionsovetArchiveEvent(
    state,
    kind,
    RAIONSOVET_ARCHIVE_ROUTE_ID,
    check.targetId,
    event.roomId,
    event.zoneId,
  );
}

function handleRaionsovetArchiveEvent(state: GameState, event: WorldEvent): void {
  // Архива под ногами нет — объявлять нечего и некому.
  if (!activeWorld) return;
  // Сторож этажа первой строкой: и дела, и бумаги есть на каждом этаже.
  if (event.z !== RAIONSOVET_ARCHIVE_Z) return;
  // Собственные факты архива обратно в него не заходят.
  if (event.tags.includes('archive') && event.tags.includes(RAIONSOVET_ARCHIVE_ROUTE_ID)) return;

  if (event.type === 'quest_completed') {
    handleArchiveQuest(state, event);
    return;
  }
  if (event.type === 'access_granted' || event.type === 'permit_exposed') {
    handleArchivePaper(state, event);
  }
}

registerWorldEventObserver(handleRaionsovetArchiveEvent);
