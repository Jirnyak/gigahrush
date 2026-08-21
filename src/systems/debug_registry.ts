/* ── Реестр отладки: команды и панели ─────────────────────────────
 *
 * Единственное место, где заведён отладочный контракт. Модуль намеренно
 * лист: он знает про `World`, `GameState` и данные этажей — и больше ни про
 * кого. Систему подключает не он, а сама система: рядом со своим кодом она
 * зовёт `registerDebugCommand` и попадает в меню.
 *
 * Раньше команда была описана в четырёх параллельных местах — union-тип,
 * массив ярлыков, массив порядка и `case <номер>` в switch, где номер был
 * ПОЗИЦИЕЙ в массиве ярлыков. Вставка команды в середину молча сдвигала
 * все следующие ветки. Теперь запись одна и номера нет.
 *
 * Порядок в меню — свойство данных, а не порядка импортов:
 *   группа берётся из `DEBUG_GROUPS`, внутри группы сортировка по `sort`
 *   (у этажей это высота), при равенстве — по ярлыку. Поэтому состав
 *   импортов не может переставить пункты местами.
 */

import { type Entity, type GameState, msg } from '../core/types';
import { World } from '../core/world';
import { type DesignFloorId } from '../data/design_floors';
import { type FloorAnomalyId } from '../data/procedural_floors';

/** Порядок групп в меню. Единственный упорядоченный список во всей отладке:
 *  команды в нём не перечисляются, только разделы. */
export const DEBUG_GROUPS = [
  { id: 'cheat', title: 'ЧИТЫ И ДОСТУП' },
  { id: 'tools', title: 'ИНСТРУМЕНТЫ, РЕДАКТОР, СЦЕНЫ' },
  { id: 'spawn', title: 'СПАВН' },
  { id: 'teleport', title: 'ЭТАЖИ' },
  { id: 'anomaly', title: 'АНОМАЛЬНЫЕ ЭТАЖИ' },
  { id: 'samosbor', title: 'САМОСБОР' },
  { id: 'world', title: 'МИР, ФРАКЦИИ, СОБЫТИЯ' },
  { id: 'economy', title: 'ЭКОНОМИКА И ЗАДАНИЯ' },
  { id: 'route', title: 'МАРШРУТ И ЛИФТЫ' },
  { id: 'verify', title: 'ПРОВЕРКИ МАРШРУТА' },
] as const;

export type DebugGroupId = typeof DEBUG_GROUPS[number]['id'];

const GROUP_ORDER = new Map<DebugGroupId, number>(DEBUG_GROUPS.map((g, i) => [g.id, i]));

/** Всё, что команда вправе трогать. Вывод идёт только через `say`: строка
 *  уходит в стеносводку, другого отладочного канала нет и заводить не нужно. */
export interface DebugCtx {
  world: World;
  player: Entity;
  entities: Entity[];
  state: GameState;
  nextEntityId: { v: number };
  say(line: string, color?: string): void;
}

/** Смена этажа исполняется вызывающей стороной: реестр не умеет и не должен
 *  уметь перестраивать мир, он только называет цель. */
export type DebugAction =
  | { type: 'teleport_random_procedural_floor' }
  | { type: 'teleport_procedural_anomaly'; anomalyId: FloorAnomalyId }
  | { type: 'teleport_design_floor'; id: DesignFloorId; themeTags: readonly string[]; z: number; label: string; color: string }
  | { type: 'refresh_world_data' };

export interface DebugCommandDef {
  id: string;
  group: DebugGroupId;
  label: string;
  /** Ключ сортировки внутри группы; меньше — выше. У этажей это минус высота,
   *  чтобы +50 стоял над -50. Без него порядок алфавитный. */
  sort?: number;
  run(ctx: DebugCtx): DebugAction | void;
}

/** Страница левого столбца, ставшая отдельным экраном. Панель обязана быть
 *  дешёвой: её строки считаются каждый кадр, пока страница открыта. */
export interface DebugPanelDef {
  id: string;
  title: string;
  /** Порядок страниц; меньше — раньше. */
  sort?: number;
  lines(ctx: DebugPanelCtx): readonly DebugPanelLine[];
}

export interface DebugPanelCtx {
  world: World;
  entities: Entity[];
  state: GameState;
}

export interface DebugPanelLine {
  text: string;
  color?: string;
}

const COMMANDS = new Map<string, DebugCommandDef>();
const PANELS = new Map<string, DebugPanelDef>();
let commandCache: readonly DebugCommandDef[] | null = null;
let panelCache: readonly DebugPanelDef[] | null = null;

export function registerDebugCommand(def: DebugCommandDef): void {
  if (COMMANDS.has(def.id)) throw new Error(`дубль отладочной команды: ${def.id}`);
  COMMANDS.set(def.id, def);
  commandCache = null;
}

export function registerDebugPanel(def: DebugPanelDef): void {
  if (PANELS.has(def.id)) throw new Error(`дубль отладочной панели: ${def.id}`);
  PANELS.set(def.id, def);
  panelCache = null;
}

/** Плоский список команд в порядке показа: группы по `DEBUG_GROUPS`, внутри
 *  группы по `sort`, при равенстве по ярлыку. Заголовки сюда не попадают —
 *  индекс в этом списке и есть номер команды для smoke и внешних вызовов. */
export function debugCommands(): readonly DebugCommandDef[] {
  if (commandCache) return commandCache;
  commandCache = [...COMMANDS.values()].sort((a, b) => (
    (GROUP_ORDER.get(a.group) ?? 99) - (GROUP_ORDER.get(b.group) ?? 99)
    || (a.sort ?? 0) - (b.sort ?? 0)
    || a.label.localeCompare(b.label, 'ru')
  ));
  return commandCache;
}

export function debugPanels(): readonly DebugPanelDef[] {
  if (panelCache) return panelCache;
  panelCache = [...PANELS.values()].sort((a, b) => (
    (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title, 'ru')
  ));
  return panelCache;
}

export function debugCommandIndex(id: string): number {
  return debugCommands().findIndex(def => def.id === id);
}

export function makeDebugCtx(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): DebugCtx {
  return {
    world,
    player,
    entities,
    state,
    nextEntityId,
    say: (line, color = '#ff0') => { state.msgs.push(msg(line, state.time, color)); },
  };
}

export function runDebugCommand(index: number, ctx: DebugCtx): DebugAction | null {
  const def = debugCommands()[index];
  if (!def) return null;
  return def.run(ctx) ?? null;
}
