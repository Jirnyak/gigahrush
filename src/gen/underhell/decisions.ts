/* -- Design z: Подад / доступ к развилкам ритуала ------------------
 *
 * Четыре развилки подада написаны целиком — три платы поста, судьба
 * свидетеля, сожжение долга и слом идола-якоря, — с русскими строками
 * события, откатами и открытием разреза к Пустоте. Дойти до них было
 * нельзя: `payUnderhellThreshold`, `resolveUnderhellWitness`,
 * `burnUnderhellDebt` и `breakUnderhellVoidAnchor` не звал никто, а
 * `ritualState` уезжал в объект генерации и терялся. Модуль даёт каждой
 * клетку в авторской комнате, приглашение по `E` и отладочную дверь.
 *
 * Разрез к Пустоте по-прежнему открывается только своим условием
 * (`canOpenUnderhellVoidGate`: плата внесена И якорь сломан) — модуль
 * доступа не вправе его смягчать. Он лишь даёт руками сделать то, что
 * авторская функция уже умела.
 *
 * Функции решения приходят ПАРАМЕТРОМ из генератора: реестр не вправе
 * импортировать генератор обратно, иначе пакет замкнёт цикл импортов.
 */

import {
  Cell,
  Feature,
  W,
  msg,
  type Entity,
  type GameState,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { registerContentInteractionHook } from '../../systems/content_hooks';
import { registerDebugCommand } from '../../systems/debug_registry';
import {
  UNDERHELL_DEBUG_ENTRY,
  UNDERHELL_ROUTE_ID,
  UNDERHELL_THRESHOLD_COSTS,
  UNDERHELL_Z,
  type UnderhellRitualState,
  type UnderhellThresholdCostId,
} from './meta';

const UNDERHELL_DECISION_REACH = 2.4;
const UNDERHELL_DECISION_LOOK = 1.5;

export type UnderhellDecisionKind =
  | { kind: 'threshold'; costId: UnderhellThresholdCostId }
  | { kind: 'witness_rescue' }
  | { kind: 'debt_burn' }
  | { kind: 'void_anchor' };

export interface UnderhellDecisionAnchor {
  id: string;
  decision: UnderhellDecisionKind;
  cell: number;
  x: number;
  y: number;
  prompt: string;
  donePrompt: string;
  failHint: string;
}

/** Авторские функции приходят из генератора, чтобы реестр остался листом. */
export interface UnderhellDecisionBinding {
  payThreshold(
    state: GameState,
    player: Entity,
    ritual: UnderhellRitualState,
    costId: UnderhellThresholdCostId,
    world?: World,
  ): boolean;
  resolveWitness(
    state: GameState,
    ritual: UnderhellRitualState,
    outcome: 'rescued' | 'silenced',
    actor?: Entity,
    world?: World,
  ): void;
  burnDebt(state: GameState, player: Entity, ritual: UnderhellRitualState, world?: World): boolean;
  breakVoidAnchor(state: GameState, ritual: UnderhellRitualState, actor?: Entity, world?: World): boolean;
  snapshot(flags: number): { thresholdPaid: boolean; witnessState: string; debtBurned: boolean; voidGateState: string };
}

interface UnderhellDecisionState {
  ritual: UnderhellRitualState;
  anchors: UnderhellDecisionAnchor[];
  binding: UnderhellDecisionBinding;
}

const underhellDecisionsByWorld = new WeakMap<World, UnderhellDecisionState>();

export function underhellDecisionAnchors(world: World): readonly UnderhellDecisionAnchor[] {
  return underhellDecisionsByWorld.get(world)?.anchors ?? [];
}

export function underhellRitualFor(world: World): UnderhellRitualState | undefined {
  return underhellDecisionsByWorld.get(world)?.ritual;
}

/** Свободная клетка под якорь внутри комнаты; декор и контейнеры не трогаются. */
function anchorCell(world: World, room: Room | undefined, dx: number, dy: number): number {
  if (!room) return -1;
  const tryCell = (x: number, y: number): number => {
    if (x <= room.x || y <= room.y || x >= room.x + room.w - 1 || y >= room.y + room.h - 1) return -1;
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR) return -1;
    if (world.features[ci] !== Feature.NONE || world.containerMap.has(ci)) return -1;
    return ci;
  };
  const wanted = tryCell(room.x + dx, room.y + dy);
  if (wanted >= 0) return wanted;
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      const ci = tryCell(x, y);
      if (ci >= 0) return ci;
    }
  }
  return -1;
}

function pushAnchor(
  world: World,
  anchors: UnderhellDecisionAnchor[],
  cell: number,
  feature: Feature,
  anchor: Omit<UnderhellDecisionAnchor, 'cell' | 'x' | 'y'>,
): void {
  if (cell < 0) return;
  world.features[cell] = feature;
  anchors.push({ ...anchor, cell, x: (cell % W) + 0.5, y: ((cell / W) | 0) + 0.5 });
}

/** Ставит якоря ритуала. Зовётся генератором ПОСЛЕ финализации: клетки
 *  комнат к этому моменту окончательны, а якорь ищет свободное место. */
export function placeUnderhellDecisionAnchors(
  world: World,
  ritual: UnderhellRitualState,
  binding: UnderhellDecisionBinding,
): number {
  const anchors: UnderhellDecisionAnchor[] = [];
  const threshold = world.rooms[ritual.thresholdRoomId];

  /* Три платы поста стоят рядом в одной палате: развилка должна читаться
     как выбор цены, а не как три разных места. */
  UNDERHELL_THRESHOLD_COSTS.forEach((cost, i) => {
    pushAnchor(world, anchors, anchorCell(world, threshold, 7 + i * 8, 6), Feature.CANDLE, {
      id: `underhell_threshold_${cost.id}`,
      decision: { kind: 'threshold', costId: cost.id },
      prompt: ` внести плату: ${cost.label}`,
      donePrompt: ' пост уже получил свою плату',
      failHint: `Плата не внесена: нужно ${cost.label.toLowerCase()}.`,
    });
  });

  for (let i = 0; i < ritual.witnessRoomIds.length; i++) {
    pushAnchor(world, anchors, anchorCell(world, world.rooms[ritual.witnessRoomIds[i]], 5, 4), Feature.SHELF, {
      id: `underhell_witness_${i}`,
      decision: { kind: 'witness_rescue' },
      prompt: ' открыть свидетельскую клетку',
      donePrompt: ' судьба свидетеля уже решена',
      failHint: 'Клетка не поддалась.',
    });
  }

  /* Печь долга и идол-якорь стоят на своих авторских клетках, а не на
     новом месте: `debtWellCell` и `voidGateCell` записаны генератором. */
  pushAnchor(world, anchors, anchorCell(world, world.rooms[ritual.debtRoomId], 10, 7), Feature.STOVE, {
    id: 'underhell_debt_burn',
    decision: { kind: 'debt_burn' },
    prompt: ' сжечь долговой лист',
    donePrompt: ' долг уже сожжён',
    failHint: 'Нужен поддельный лист печатей: пустую бумагу печь не примет.',
  });

  const chapel = world.rooms.find(room => room?.name === 'Палата якоря');
  pushAnchor(world, anchors, anchorCell(world, chapel, 13, 9), Feature.APPARATUS, {
    id: 'underhell_void_anchor',
    decision: { kind: 'void_anchor' },
    prompt: ' сломать идол-якорь',
    donePrompt: ' якорь уже сломан',
    failHint: 'Якорь не поддался.',
  });

  if (anchors.length > 0) world.markFeaturesDirty(false);
  underhellDecisionsByWorld.set(world, { ritual, anchors, binding });
  return anchors.length;
}

function anchorDone(store: UnderhellDecisionState, anchor: UnderhellDecisionAnchor): boolean {
  const snap = store.binding.snapshot(store.ritual.flags);
  switch (anchor.decision.kind) {
    case 'threshold': return snap.thresholdPaid;
    case 'witness_rescue': return snap.witnessState !== 'sealed';
    case 'debt_burn': return snap.debtBurned;
    case 'void_anchor': return snap.voidGateState !== 'sealed';
  }
}

function anchorAtLook(world: World, player: Entity, lookX: number, lookY: number): UnderhellDecisionAnchor | undefined {
  const store = underhellDecisionsByWorld.get(world);
  if (!store || store.anchors.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  let best: UnderhellDecisionAnchor | undefined;
  let bestD2 = Infinity;
  for (const anchor of store.anchors) {
    if (world.dist2(player.x, player.y, anchor.x, anchor.y) > UNDERHELL_DECISION_REACH * UNDERHELL_DECISION_REACH) continue;
    const d2 = world.dist2(lx, ly, anchor.x, anchor.y);
    if (d2 > UNDERHELL_DECISION_LOOK * UNDERHELL_DECISION_LOOK || d2 >= bestD2) continue;
    best = anchor;
    bestD2 = d2;
  }
  return best;
}

/** Выполняет развилку. `false` — цена не оплачена или ход уже сделан;
 *  игрок в обоих случаях видит строку, а не молчаливый отказ. */
export function applyUnderhellDecision(
  world: World,
  game: GameState,
  player: Entity,
  anchor: UnderhellDecisionAnchor,
): boolean {
  const store = underhellDecisionsByWorld.get(world);
  if (!store) return false;
  if (anchorDone(store, anchor)) {
    game.msgs.push(msg(anchor.donePrompt.trim(), game.time, '#888'));
    return false;
  }
  const { binding, ritual } = store;
  let ok = false;
  switch (anchor.decision.kind) {
    case 'threshold':
      ok = binding.payThreshold(game, player, ritual, anchor.decision.costId, world);
      break;
    case 'witness_rescue':
      binding.resolveWitness(game, ritual, 'rescued', player, world);
      ok = true;
      break;
    case 'debt_burn':
      ok = binding.burnDebt(game, player, ritual, world);
      break;
    case 'void_anchor':
      binding.breakVoidAnchor(game, ritual, player, world);
      ok = true;
      break;
  }
  if (!ok) game.msgs.push(msg(anchor.failHint, game.time, '#c96'));
  return ok;
}

registerContentInteractionHook({
  id: 'underhell_ritual_decisions',
  target(ctx) {
    /* Сторож высоты ПЕРВОЙ строкой: крюк зовётся каждый кадр. */
    if (ctx.state.currentZ !== UNDERHELL_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    const store = underhellDecisionsByWorld.get(ctx.world)!;
    return {
      id: 746_000 + (anchor.cell % 1000),
      targetId: anchor.id,
      x: anchor.x,
      y: anchor.y,
      priority: 74,
      prompt: anchorDone(store, anchor) ? anchor.donePrompt : anchor.prompt,
    };
  },
  use(ctx) {
    if (ctx.state.currentZ !== UNDERHELL_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    applyUnderhellDecision(ctx.world, ctx.state, ctx.player, anchor);
    return { handled: true, worldChanged: true };
  },
});

registerDebugCommand({
  id: 'underhell_ritual_decisions',
  group: 'route',
  label: 'Подад: развилки ритуала',
  sort: -UNDERHELL_Z,
  run(ctx) {
    const store = underhellDecisionsByWorld.get(ctx.world);
    if (!store) {
      ctx.say(`[${UNDERHELL_ROUTE_ID}] состояние ритуала не найдено: это не подад`, '#c66');
      return;
    }
    const snap = store.binding.snapshot(store.ritual.flags);
    ctx.say(
      `[${UNDERHELL_ROUTE_ID}] плата=${snap.thresholdPaid ? 'внесена' : 'нет'} свидетель=${snap.witnessState}`
      + ` долг=${snap.debtBurned ? 'сожжён' : 'висит'} разрез=${snap.voidGateState} якорей=${store.anchors.length}`,
      '#9cf',
    );
    /* Авторский маршрут дыма жил в `UNDERHELL_DEBUG_ENTRY` без потребителя. */
    ctx.say(`  ${UNDERHELL_DEBUG_ENTRY.label}: ${UNDERHELL_DEBUG_ENTRY.smokePath.join(' -> ')}`, '#cc9');
    for (const anchor of store.anchors) {
      ctx.say(`  ${anchor.id} @${Math.floor(anchor.x)},${Math.floor(anchor.y)}`, '#9f7');
    }
  },
});
