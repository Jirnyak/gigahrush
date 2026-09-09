/* ── Банк узнаёт, что у него сделали ──────────────────────────────
 * `BankActionKind` не читал никто, кроме собственного публикатора, а
 * `publishBankFloorEvent` не звали ни разу: банк был единственным этажом,
 * который знает про вклад, кредит, долг и хранилище, и при этом не сообщал о
 * них миру ничего. Прежний разбор предлагал звать публикацию из
 * `systems/banking.ts` и сам же это отклонил — вышло бы ребро `systems → gen`.
 *
 * Подписка снизу вверх такого ребра не создаёт. Пять видов приходят двумя уже
 * публикуемыми семействами фактов:
 *
 *   1. `quest_completed` с `data.sideQuestId` — четыре денежных действия;
 *   2. `item_stolen` / `container_looted` из ящиков хранилища — пятый,
 *      `vault_theft`. Его никакая побочка и не может закрыть: хранилище не
 *      сдают, его выносят, и `witnessed` с пятой тяжестью уже прописаны в самой
 *      публикации ровно под этот случай.
 *
 * Донос на поддельную бумагу (`bank_report_forged_debt_paper`) сюда НЕ
 * отображён намеренно: это не денежное действие игрока, а обвинение, и у него
 * своя дорога через репутацию.
 */

import { type GameState, type WorldEvent } from '../../core/types';
import { type World } from '../../core/world';
import { registerFloorScopedReset } from '../../world/world_contexts';
import { registerWorldEventObserver } from '../../systems/events';
import { publishBankFloorEvent } from './index';
import {
  BANK_FLOOR_ROUTE_ID,
  BANK_FLOOR_Z,
  BANK_ROOM_NAMES,
  type BankActionKind,
  type BankFloorState,
} from './meta';

/** Какая побочка какое денежное действие закрывает. */
const QUEST_TO_ACTION: Readonly<Record<string, BankActionKind>> = {
  bank_cash_deposit_50: 'deposit',
  bank_take_corridor_loan: 'loan',
  bank_repay_corridor_loan: 'repay',
  bank_cash_forged_debt_paper: 'forgery',
};

const ACTION_TARGET: Readonly<Record<BankActionKind, string>> = {
  deposit: BANK_ROOM_NAMES.deposit,
  loan: BANK_ROOM_NAMES.credit,
  repay: BANK_ROOM_NAMES.debtorCircuit,
  forgery: BANK_ROOM_NAMES.bypassGate,
  vault_theft: BANK_ROOM_NAMES.vault,
};

let activeWorld: World | null = null;
let activeState: BankFloorState | null = null;
const announced = new Set<BankActionKind>();

registerFloorScopedReset(current => {
  if (activeWorld !== current) resetBankFloorDecisions();
});

/** Зовёт генератор, когда ящики хранилища уже собраны и записаны в состояние. */
export function bindBankFloorDecisions(world: World, bankState: BankFloorState): void {
  activeWorld = world;
  activeState = bankState;
  announced.clear();
}

export function resetBankFloorDecisions(): void {
  activeWorld = null;
  activeState = null;
  announced.clear();
}

/** Для замка: что банк уже объявил миру. */
export function announcedBankFloorActions(): readonly BankActionKind[] {
  return [...announced];
}

function announce(state: GameState, kind: BankActionKind, event: WorldEvent): void {
  if (!activeState || announced.has(kind)) return;
  announced.add(kind);
  publishBankFloorEvent(state, kind, ACTION_TARGET[kind], event.roomId, event.zoneId);
}

function handleBankFloorEvent(state: GameState, event: WorldEvent): void {
  if (!activeState) return;
  // Сторож этажа первой строкой: дела и кражи есть на каждом этаже.
  if (event.z !== BANK_FLOOR_Z) return;
  // Собственный факт банка обратно в него не заходит.
  if (event.tags.includes(BANK_FLOOR_ROUTE_ID) && event.tags.includes('banking')) return;

  if (event.type === 'quest_completed') {
    const sideQuestId = event.data?.sideQuestId;
    if (typeof sideQuestId !== 'string') return;
    const kind = QUEST_TO_ACTION[sideQuestId];
    if (kind) announce(state, kind, event);
    return;
  }

  if (event.type === 'item_stolen' || event.type === 'container_looted') {
    if (event.containerId === undefined) return;
    if (activeState.vaultContainerIds.includes(event.containerId)) announce(state, 'vault_theft', event);
  }
}

registerWorldEventObserver(handleBankFloorEvent);
