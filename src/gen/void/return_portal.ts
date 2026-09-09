/* ── Портал возврата из Пустоты ───────────────────────────────────
 * Финал маршрута: Творец падает — на его клетке закрепляется портал, и центр
 * портала возвращает игрока в жилую зону. Знание об этом этаже (`void`,
 * `MonsterKind.CREATOR`, `Tex.PORTAL`, «Пустотный шип») живёт здесь, в пакете
 * своего этажа, а не в `main.ts`.
 *
 * Смена мира остаётся за `main.ts` — она его работа по контракту слоёв. Модуль
 * решает КОГДА возвращать и ЧТО при этом сказано; сам обмен геометрии делает
 * впрыснутый переход (`setVoidReturnTransition`).
 */

import {
  Cell, EntityType, MonsterKind, QuestType, Tex, W,
  msg,
  type Entity, type GameState,
} from '../../core/types';
import { World } from '../../core/world';
import { isValidZ } from '../../data/design_floors';
import { onCreatorKilled } from '../../data/plot_events';
import {
  registerContentEntityDeathHook, registerContentRuntimeHook,
} from '../../systems/content_hooks';
import { publishEvent } from '../../systems/events';
import { currentFloorRunEntry } from '../../systems/procedural_floors';
import { checkQuests } from '../../systems/quests';
import { finiteNumber } from '../../systems/save_sanitize';

/** Куда возвращает портал: канонический жилой этаж. */
export const VOID_RETURN_TARGET_Z = 0;

/** Как часто портал вообще спрашивает, стоит ли игрок в центре. */
const PORTAL_POLL_TICKS = 10;
const HINT_COOLDOWN_TICKS = 180;
const LEAVE_HINT_COOLDOWN_TICKS = 120;
const HINT_RADIUS = 12;

export interface VoidReturnPortalState {
  active: boolean;
  used: boolean;
  cell: number;
  openedAt: number;
  openedTick: number;
  creatorId: number;
  playerMustLeaveCell?: boolean;
  enteredFromFloor?: number;
  usedAt?: number;
  voidSpikeCarried?: boolean;
  voidSpikeResolved?: boolean;
}

type VoidReturnPortalHost = GameState & {
  voidReturnPortal?: VoidReturnPortalState;
  voidEntryFromFloor?: number;
};

/** Всё, что уносится из Пустоты в событие и в текст прибытия. */
export interface VoidReturnDeparture {
  fromFloor: number;
  portalCell: number;
  openedAt: number;
  openedTick: number;
  creatorId: number;
  enteredFromFloor?: number;
  voidSpikeCarried: boolean;
  voidSpikeResolved: boolean;
  voidSpikeTag: string;
}

let lastHintTick = -9999;

/* ── Состояние и сейв ─────────────────────────────────────────── */

export function normalizeVoidReturnPortalState(input: unknown): VoidReturnPortalState | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const src = input as Partial<VoidReturnPortalState>;
  const cell = Math.floor(finiteNumber(src.cell, -1));
  if (cell < 0 || cell >= W * W) return undefined;
  const enteredFromFloor = isValidZ(src.enteredFromFloor) ? src.enteredFromFloor : undefined;
  return {
    active: src.active === true,
    used: src.used === true,
    cell,
    openedAt: finiteNumber(src.openedAt, 0),
    openedTick: Math.max(0, Math.floor(finiteNumber(src.openedTick, 0))),
    creatorId: Math.floor(finiteNumber(src.creatorId, -1)),
    playerMustLeaveCell: src.playerMustLeaveCell === true,
    enteredFromFloor,
    usedAt: typeof src.usedAt === 'number' && Number.isFinite(src.usedAt) ? src.usedAt : undefined,
    voidSpikeCarried: src.voidSpikeCarried === true,
    voidSpikeResolved: src.voidSpikeResolved === true,
  };
}

export function getVoidReturnPortalState(state: GameState): VoidReturnPortalState | undefined {
  const host = state as VoidReturnPortalHost;
  const normalized = normalizeVoidReturnPortalState(host.voidReturnPortal);
  if (normalized) host.voidReturnPortal = normalized;
  else delete host.voidReturnPortal;
  return normalized;
}

export function setVoidReturnPortalState(state: GameState, input: unknown): void {
  const host = state as VoidReturnPortalHost;
  const normalized = normalizeVoidReturnPortalState(input);
  if (normalized) host.voidReturnPortal = normalized;
  else delete host.voidReturnPortal;
}

export function clearVoidReturnPortalState(state: GameState): void {
  delete (state as VoidReturnPortalHost).voidReturnPortal;
  lastHintTick = -9999;
}

export function setVoidEntryFromFloor(state: GameState, value: unknown): void {
  const host = state as VoidReturnPortalHost;
  if (isValidZ(value)) host.voidEntryFromFloor = value;
  else delete host.voidEntryFromFloor;
}

export function getVoidEntryFromFloor(state: GameState): number | undefined {
  return (state as VoidReturnPortalHost).voidEntryFromFloor;
}

export function voidReturnPortalStateForSave(state: GameState): VoidReturnPortalState | undefined {
  const portal = getVoidReturnPortalState(state);
  return portal ? { ...portal } : undefined;
}

/* ── Условия ──────────────────────────────────────────────────── */

export function hasVoidSpike(player: Entity): boolean {
  return (player.inventory ?? []).some(item => item.defId === 'void_spike' && item.count > 0);
}

export function voidSpikeResolved(state: GameState): boolean {
  return state.quests.some(q =>
    q.type === QuestType.FETCH &&
    q.targetItem === 'void_spike' &&
    q.done &&
    !q.failed);
}

export function creatorKillQuestSatisfied(state: GameState): boolean {
  return state.quests.some(q =>
    q.type === QuestType.KILL &&
    q.targetMonsterKind === MonsterKind.CREATOR &&
    (q.done || (q.killCount ?? 0) >= (q.killNeeded ?? 1)));
}

/**
 * Тот ли это этаж, где портал имеет силу.
 *
 * Одна проверка на все три площадки — открытие портала, его печать в мир и
 * вход в центр. Раньше их было две, и они были ВЗАИМОИСКЛЮЧАЮЩИМИ: смерть
 * Творца требовала `designFloorId === 'void'`, а сам портал — записи БЕЗ
 * `designFloorId`. На Пустоте маршрут всегда отдаёт дизайн-запись `void`
 * (`entryForZ`), поэтому портал не срабатывал НИ РАЗУ: игрок видел текстуру и
 * подсказку «Портал возврата: 0м», а центр его не принимал. Замерено прогоном.
 */
export function isVoidReturnPortalFloor(state: GameState): boolean {
  return currentFloorRunEntry(state).designFloorId === 'void';
}

/* ── Печать портала в мир ─────────────────────────────────────── */

/** Творец списан — тела на этаже больше нет, даже если мир пересобрали. */
function removeCreatorFromResolvedVoid(entities: Entity[], state: GameState): void {
  const portal = getVoidReturnPortalState(state);
  if (!portal?.active || portal.used || !isVoidReturnPortalFloor(state)) return;
  let writeIdx = 0;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.type === EntityType.MONSTER && e.monsterKind === MonsterKind.CREATOR) {
      continue;
    }
    entities[writeIdx++] = e;
  }
  entities.length = writeIdx;
}

export function restoreVoidReturnPortalForCurrentWorld(
  world: World, entities: Entity[], state: GameState,
): boolean {
  let portal = getVoidReturnPortalState(state);
  if (!portal && isVoidReturnPortalFloor(state) && creatorKillQuestSatisfied(state)) {
    const creator = entities.find(e => e.type === EntityType.MONSTER && e.monsterKind === MonsterKind.CREATOR);
    if (creator) {
      portal = {
        active: true,
        used: false,
        cell: world.idx(Math.floor(creator.x), Math.floor(creator.y)),
        openedAt: state.time,
        openedTick: state.tick,
        creatorId: creator.id,
      };
      (state as VoidReturnPortalHost).voidReturnPortal = portal;
    }
  }
  if (!portal?.active || portal.used || !isVoidReturnPortalFloor(state)) return false;
  const ci = portal.cell;
  world.cells[ci] = Cell.FLOOR;
  world.floorTex[ci] = Tex.PORTAL;
  world.wallTex[ci] = 0;
  world.markFloorTexDirty();
  removeCreatorFromResolvedVoid(entities, state);
  return true;
}

export function openVoidReturnPortalFromCreator(
  world: World, entities: Entity[], player: Entity, state: GameState,
  creator: Entity, enteredFromFloor?: number,
): void {
  const cell = world.idx(Math.floor(creator.x), Math.floor(creator.y));
  const entryFloor = enteredFromFloor ?? getVoidEntryFromFloor(state);
  const playerCell = world.idx(Math.floor(player.x), Math.floor(player.y));
  (state as VoidReturnPortalHost).voidReturnPortal = {
    active: true,
    used: false,
    cell,
    openedAt: state.time,
    openedTick: state.tick,
    creatorId: creator.id,
    playerMustLeaveCell: playerCell === cell,
    enteredFromFloor: entryFloor,
  };
  restoreVoidReturnPortalForCurrentWorld(world, entities, state);
  const x = cell % W;
  const y = (cell / W) | 0;
  const zoneId = world.zoneMap[cell];
  state.msgs.push(msg('Портал возврата закреплён: переход сработает только в его центре.', state.time, '#0ff'));
  // Предъявлять шип наверху некому и здесь тоже: дело закрывается на месте,
  // без разговора. Раньше строка обещала отдать его Жану Пустотнику — личности,
  // удалённой из игры целиком, — и обещание было невыполнимо.
  state.msgs.push(msg('Пустотный шип сдаётся здесь же: наверх он не проходит по описи.', state.time, '#8cf'));
  publishEvent(state, {
    type: 'floor_transition',
    z: -50,
    zoneId,
    x: x + 0.5,
    y: y + 0.5,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    targetId: creator.id,
    targetName: 'Портал возврата открыт',
    monsterKind: MonsterKind.CREATOR,
    severity: 5,
    privacy: 'local',
    tags: ['floor', 'floor_transition', 'void', 'return_portal', 'opened'],
    data: {
      portalCell: cell,
      portalX: x,
      portalY: y,
      creatorId: creator.id,
      enteredFromFloor: entryFloor,
    },
  });
}

/* ── Подсказки ────────────────────────────────────────────────── */

function maybeShowHint(world: World, player: Entity, state: GameState, playerCell: number): void {
  if (state.tick - lastHintTick < HINT_COOLDOWN_TICKS) return;
  const portal = getVoidReturnPortalState(state);
  if (portal?.active && !portal.used) {
    const px = (portal.cell % W) + 0.5;
    const py = ((portal.cell / W) | 0) + 0.5;
    const d2 = world.dist2(player.x, player.y, px, py);
    if (d2 > HINT_RADIUS * HINT_RADIUS) return;
    const dist = Math.max(0, Math.round(Math.sqrt(d2)));
    const consequence = voidSpikeResolved(state)
      ? 'Последствие оставлено здесь.'
      : hasVoidSpike(player)
        ? 'Шип ещё у вас: он выйдет наверх вместе с вами.'
        : 'Центр вернёт в жилую зону.';
    state.msgs.push(msg(`Портал возврата: ${dist}м. ${consequence}`, state.time, '#0ff'));
    lastHintTick = state.tick;
    return;
  }
  if (world.floorTex[playerCell] === Tex.PORTAL) {
    state.msgs.push(msg('Эта текстура портала не является закреплённым возвратом.', state.time, '#888'));
    lastHintTick = state.tick;
  }
}

/* ── Вход в центр ─────────────────────────────────────────────── */

/**
 * Готов ли портал принять игрока прямо сейчас. Возвращает саму запись портала,
 * чтобы вызывающий не искал её повторно; `null` — остаёмся на этаже.
 */
export function readyVoidReturnPortal(
  world: World, player: Entity, state: GameState, playerCell: number,
): VoidReturnPortalState | null {
  const portal = getVoidReturnPortalState(state);
  if (!portal?.active || portal.used || !isVoidReturnPortalFloor(state)) {
    maybeShowHint(world, player, state, playerCell);
    return null;
  }
  if (playerCell !== portal.cell) {
    if (portal.playerMustLeaveCell) portal.playerMustLeaveCell = false;
    maybeShowHint(world, player, state, playerCell);
    return null;
  }
  if (portal.playerMustLeaveCell) {
    if (state.tick - lastHintTick >= LEAVE_HINT_COOLDOWN_TICKS) {
      state.msgs.push(msg('Портал раскрылся под ногами. Отойдите и войдите снова, когда будете готовы.', state.time, '#0ff'));
      lastHintTick = state.tick;
    }
    return null;
  }
  return portal;
}

/** Отметить портал использованным и снять всё, что уносится наверх. */
export function beginVoidReturn(
  state: GameState, player: Entity, portal: VoidReturnPortalState,
): VoidReturnDeparture {
  portal.used = true;
  portal.usedAt = state.time;
  portal.voidSpikeCarried = hasVoidSpike(player);
  portal.voidSpikeResolved = voidSpikeResolved(state);
  const carried = portal.voidSpikeCarried;
  const resolved = portal.voidSpikeResolved;
  return {
    fromFloor: state.currentZ,
    portalCell: portal.cell,
    openedAt: portal.openedAt,
    openedTick: portal.openedTick,
    creatorId: portal.creatorId,
    enteredFromFloor: portal.enteredFromFloor,
    voidSpikeCarried: carried,
    voidSpikeResolved: resolved,
    voidSpikeTag: resolved ? 'void_spike_left' : carried ? 'void_spike_carried' : 'void_spike_absent',
  };
}

export function announceVoidReturn(state: GameState, departure: VoidReturnDeparture): void {
  state.msgs.push(msg(
    departure.voidSpikeResolved
      ? 'Возврат принят. Последствие сдано на месте и осталось в Пустоте. Жилая зона принимает вас обратно.'
      : departure.voidSpikeCarried
        ? 'Возврат принят. Пустотный шип вернулся вместе с вами.'
        : 'Возврат принят. Пустота закрыла за вами центр. Жилая зона снова под ногами.',
    state.time,
    '#0f8',
  ));
}

export function publishVoidReturnArrival(
  world: World, player: Entity, state: GameState, departure: VoidReturnDeparture,
): void {
  publishEvent(state, {
    type: 'floor_transition',
    z: VOID_RETURN_TARGET_Z,
    zoneId: world.zoneMap[world.idx(Math.floor(player.x), Math.floor(player.y))],
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    targetName: 'Возврат в жилую зону',
    severity: 5,
    privacy: 'local',
    tags: ['floor', 'floor_transition', 'void', 'return_portal', 'used', 'freeplay', departure.voidSpikeTag],
    data: {
      fromFloor: departure.fromFloor,
      toFloor: VOID_RETURN_TARGET_Z,
      portalCell: departure.portalCell,
      openedAt: departure.openedAt,
      openedTick: departure.openedTick,
      creatorId: departure.creatorId,
      enteredFromFloor: departure.enteredFromFloor,
      voidSpikeCarried: departure.voidSpikeCarried,
      voidSpikeResolved: departure.voidSpikeResolved,
    },
  });
}

/* ── Швы ──────────────────────────────────────────────────────── */

/** Смена мира принадлежит `main.ts`; модуль только зовёт её в свой момент. */
export type VoidReturnTransition = (portal: VoidReturnPortalState) => void;

let transition: VoidReturnTransition | null = null;

export function setVoidReturnTransition(fn: VoidReturnTransition | null): void {
  transition = fn;
}

registerContentEntityDeathHook({
  id: 'void_return_portal',
  onDeath(ctx) {
    const { killed, state } = ctx;
    if (killed.type !== EntityType.MONSTER) return;
    if (killed.monsterKind !== MonsterKind.CREATOR || !ctx.killerIsPlayer) return;
    if (!isVoidReturnPortalFloor(state)) return;
    if (!onCreatorKilled(killed, ctx.world, state)) return;
    checkQuests(ctx.player, ctx.world, ctx.entities, state, state.msgs);
    openVoidReturnPortalFromCreator(ctx.world, ctx.entities, ctx.player, state, killed);
    return { worldChanged: true };
  },
});

registerContentRuntimeHook({
  id: 'void_return_portal',
  phases: ['floor_activity'],
  update(ctx) {
    if (ctx.state.tick % PORTAL_POLL_TICKS !== 0) return;
    if (!isVoidReturnPortalFloor(ctx.state)) return;
    const playerCell = ctx.world.idx(Math.floor(ctx.player.x), Math.floor(ctx.player.y));
    const portal = readyVoidReturnPortal(ctx.world, ctx.player, ctx.state, playerCell);
    if (portal) transition?.(portal);
  },
});
