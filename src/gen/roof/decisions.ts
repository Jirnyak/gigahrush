/* -- Design z: Крыша / доступ к развилкам погоды ------------------
 *
 * Пять развилок крыши были написаны целиком — с русскими строками журнала,
 * тегами слухов и последствиями для качества сигнала, — но дойти до них
 * было нельзя: `createRoofWeatherState` жил в объекте генерации, попадал
 * в `roofDebugLines` и навсегда оставался в нулях. Модуль даёт каждой
 * клетку в мире, приглашение по `E` и отладочную дверь.
 *
 * Якорь стоит в той авторской комнате, ради которой развилка и писалась:
 * мачта — в оборванной сигнальной мачте, сводка — в пустой метеобудке,
 * линия — в пустом снайперском гнезде, кадр — в углу повторного облака,
 * вода — на баковой площадке.
 *
 * Цена берётся с этажа, а не выдумывается: моток провода и предохранитель
 * лежат в ящике верхолаза в той же мачте. Бесплатной развилки тут нет —
 * обход замка обязан стоить ресурса, иначе замка не было.
 *
 * Сами функции решения приходят ПАРАМЕТРОМ из `index.ts`: реестр не вправе
 * импортировать генератор обратно, иначе пакет замкнёт цикл импортов,
 * который меряет `check:invariants`.
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
import { addItem, hasItem, removeItem } from '../../systems/inventory';
import {
  ROOF_DEBUG_ENTRY,
  ROOF_FUTURE_Z,
  ROOF_ROUTE_ID,
  type RoofWeatherAction,
  type RoofWeatherResult,
  type RoofWeatherState,
} from './meta';

/** Дальность до якоря и радиус взгляда — те же порядки, что у колокола
 *  спектральной часовни: развилка берётся вплотную, а не через плиту. */
const ROOF_DECISION_REACH = 2.4;
const ROOF_DECISION_LOOK = 1.5;

export interface RoofDecisionSpec {
  id: string;
  action: RoofWeatherAction;
  roomKey: string;
  /** Желаемое смещение якоря внутри комнаты; клетка проверяется на свободу. */
  dx: number;
  dy: number;
  feature: Feature;
  prompt: string;
  donePrompt: string;
  costItem?: { defId: string; count: number };
  rewardItem?: { defId: string; count: number };
  costHint: string;
}

export const ROOF_DECISION_SPECS: readonly RoofDecisionSpec[] = [
  {
    id: 'roof_repair_mast',
    action: 'repair_signal',
    roomKey: 'riggerMast',
    dx: 8,
    dy: 7,
    feature: Feature.MACHINE,
    prompt: ' починить сигнальную мачту',
    donePrompt: ' мачта уже даёт чистую частоту',
    costItem: { defId: 'wire_coil', count: 1 },
    costHint: 'Нужен моток провода: обрыв идёт по всей растяжке. В ящике верхолаза он есть.',
  },
  {
    id: 'roof_false_weather',
    action: 'false_weather_exposed',
    roomKey: 'meteorology',
    dx: 8,
    dy: 6,
    feature: Feature.SCREEN,
    prompt: ' раскрыть ложную сводку',
    donePrompt: ' сводка метеобудки уже разобрана',
    costItem: { defId: 'blank_form', count: 1 },
    costHint: 'Нужен чистый бланк: без него сводку не переписать, а на слово тут не верят.',
  },
  {
    id: 'roof_sniper_lane',
    action: 'sniper_lane_darkened',
    roomKey: 'sniperNest',
    dx: 7,
    dy: 5,
    feature: Feature.DESK,
    prompt: ' погасить снайперскую линию',
    donePrompt: ' линия под мачтами уже погашена',
    costItem: { defId: 'fuse', count: 1 },
    costHint: 'Нужен предохранитель: линия питается от щита гнезда. Ящик верхолаза держит один.',
  },
  {
    id: 'roof_cloud_frame',
    action: 'cloud_frame_printed',
    roomKey: 'cloudCamp',
    dx: 6,
    dy: 4,
    feature: Feature.SCREEN,
    prompt: ' распечатать облачный кадр',
    donePrompt: ' кадр повторного облака уже распечатан',
    rewardItem: { defId: 'overexposed_photo', count: 1 },
    costHint: 'Журнал Тихона держит кадр; печать делает из него улику.',
  },
  {
    id: 'roof_clean_water',
    action: 'clean_water_collected',
    roomKey: 'waterTanks',
    dx: 8,
    dy: 6,
    feature: Feature.APPARATUS,
    prompt: ' собрать чистую воду',
    donePrompt: ' сборник баковой площадки пуст',
    rewardItem: { defId: 'filtered_water', count: 2 },
    costHint: 'После верхнего самосбора бак ещё держит чистую воду.',
  },
];

export interface RoofDecisionAnchor extends RoofDecisionSpec {
  cell: number;
  x: number;
  y: number;
}

/** Функции решения и публикатор события приходят из `index.ts` вместе с
 *  состоянием: так реестр развилок остаётся листом графа импортов. */
export interface RoofDecisionBinding {
  run(weather: RoofWeatherState, action: RoofWeatherAction): RoofWeatherResult;
  publish(game: GameState, weather: RoofWeatherState, result: RoofWeatherResult, room?: Room): unknown;
}

interface RoofDecisionState {
  weather: RoofWeatherState;
  anchors: RoofDecisionAnchor[];
  binding: RoofDecisionBinding;
}

const roofDecisionsByWorld = new WeakMap<World, RoofDecisionState>();

export function roofWeatherFor(world: World): RoofWeatherState | undefined {
  return roofDecisionsByWorld.get(world)?.weather;
}

export function roofDecisionAnchors(world: World): readonly RoofDecisionAnchor[] {
  return roofDecisionsByWorld.get(world)?.anchors ?? [];
}

/** Свободная клетка под якорь: сначала заказанное смещение, потом обход
 *  комнаты. Уже стоящий декор и контейнеры не трогаются. */
function anchorCell(world: World, room: Room, dx: number, dy: number): number {
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

/** Ставит якоря развилок и связывает их с состоянием погоды этажа.
 *  Зовётся генератором ПОСЛЕ декора и контейнеров, иначе якорь займёт
 *  клетку, которую комната ещё собиралась застроить. */
export function placeRoofDecisionAnchors(
  world: World,
  rooms: Record<string, Room>,
  weather: RoofWeatherState,
  binding: RoofDecisionBinding,
): number {
  const anchors: RoofDecisionAnchor[] = [];
  for (const spec of ROOF_DECISION_SPECS) {
    const room = rooms[spec.roomKey];
    if (!room) continue;
    const cell = anchorCell(world, room, spec.dx, spec.dy);
    if (cell < 0) continue;
    world.features[cell] = spec.feature;
    anchors.push({ ...spec, cell, x: (cell % W) + 0.5, y: ((cell / W) | 0) + 0.5 });
  }
  if (anchors.length > 0) world.markFeaturesDirty(false);
  roofDecisionsByWorld.set(world, { weather, anchors, binding });
  return anchors.length;
}

export function roofDecisionDone(weather: RoofWeatherState, action: RoofWeatherAction): boolean {
  switch (action) {
    case 'repair_signal': return weather.antennaRepaired;
    case 'false_weather_exposed':
    case 'false_weather_forged': return weather.falseWeatherExposed || weather.falseWeatherForged;
    case 'sniper_lane_darkened': return weather.sniperLaneDarkened;
    case 'cloud_frame_printed': return weather.cloudFramePrinted;
    case 'clean_water_collected': return weather.cleanWaterCollected;
  }
}

function anchorAtLook(world: World, player: Entity, lookX: number, lookY: number): RoofDecisionAnchor | undefined {
  const store = roofDecisionsByWorld.get(world);
  if (!store || store.anchors.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  let best: RoofDecisionAnchor | undefined;
  let bestD2 = Infinity;
  for (const anchor of store.anchors) {
    if (world.dist2(player.x, player.y, anchor.x, anchor.y) > ROOF_DECISION_REACH * ROOF_DECISION_REACH) continue;
    const d2 = world.dist2(lx, ly, anchor.x, anchor.y);
    if (d2 > ROOF_DECISION_LOOK * ROOF_DECISION_LOOK || d2 >= bestD2) continue;
    best = anchor;
    bestD2 = d2;
  }
  return best;
}

/** Выполняет развилку: списывает цену, зовёт авторскую функцию решения,
 *  печатает её русскую строку журнала и публикует слух. `false` означает,
 *  что цена не оплачена — игрок видит подсказку, а не молчаливый отказ. */
export function applyRoofDecision(
  world: World,
  game: GameState,
  player: Entity,
  anchor: RoofDecisionAnchor,
  skipCost = false,
): boolean {
  const store = roofDecisionsByWorld.get(world);
  if (!store) return false;
  const weather = store.weather;
  if (roofDecisionDone(weather, anchor.action)) {
    game.msgs.push(msg(anchor.donePrompt.trim(), game.time, '#888'));
    return false;
  }
  if (!skipCost && anchor.costItem) {
    if (!hasItem(player, anchor.costItem.defId)) {
      game.msgs.push(msg(anchor.costHint, game.time, '#c96'));
      return false;
    }
    removeItem(player, anchor.costItem.defId, anchor.costItem.count);
  }

  const result = store.binding.run(weather, anchor.action);
  if (anchor.rewardItem) addItem(player, anchor.rewardItem.defId, anchor.rewardItem.count);
  game.msgs.push(msg(result.logLine, game.time, '#9cf'));
  store.binding.publish(game, weather, result, world.rooms[world.roomMap[anchor.cell]]);
  return true;
}

registerContentInteractionHook({
  id: 'roof_weather_decisions',
  target(ctx) {
    /* Сторож высоты обязателен ПЕРВОЙ строкой: крюк зовётся из
       `findInteractionTarget` каждый кадр, а на чужом этаже якорей нет. */
    if (ctx.state.currentZ !== ROOF_FUTURE_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    const weather = roofDecisionsByWorld.get(ctx.world)!.weather;
    return {
      id: 745_000 + (anchor.cell % 1000),
      targetId: anchor.id,
      x: anchor.x,
      y: anchor.y,
      priority: 74,
      prompt: roofDecisionDone(weather, anchor.action) ? anchor.donePrompt : anchor.prompt,
    };
  },
  use(ctx) {
    if (ctx.state.currentZ !== ROOF_FUTURE_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    applyRoofDecision(ctx.world, ctx.state, ctx.player, anchor);
    return { handled: true, worldChanged: false };
  },
});

registerDebugCommand({
  id: 'roof_weather_decisions',
  group: 'route',
  label: 'Крыша: развилки погоды',
  sort: -ROOF_FUTURE_Z,
  run(ctx) {
    const store = roofDecisionsByWorld.get(ctx.world);
    if (!store) {
      ctx.say(`[${ROOF_ROUTE_ID}] состояние погоды не найдено: это не крыша`, '#c66');
      return;
    }
    ctx.say(`[${ROOF_ROUTE_ID}] сигнал=${store.weather.signalQuality}/5 якорей=${store.anchors.length}`, '#9cf');
    /* Авторский маршрут дыма был написан в `ROOF_DEBUG_ENTRY` и не имел
       потребителя; отладочная дверь — его законное место. */
    ctx.say(`  маршрут: ${ROOF_DEBUG_ENTRY.smokePath}`, '#cc9');
    for (const anchor of store.anchors) {
      const done = roofDecisionDone(store.weather, anchor.action);
      ctx.say(`  ${anchor.id} @${Math.floor(anchor.x)},${Math.floor(anchor.y)} ${done ? 'закрыто' : 'открыто'}`, done ? '#888' : '#9f7');
      if (!done) applyRoofDecision(ctx.world, ctx.state, ctx.player, anchor, true);
    }
  },
});
