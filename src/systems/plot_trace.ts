/* ── След личности: дневник погибшего сюжетного NPC ──────────────
 *
 * Смерть авторского человека не имеет права тихо оборвать поручение. Она
 * оставляет вещь: дневник. Дневник в рюкзаке говорит за покойного — его шаг
 * выдаётся, его дело сдаётся, его разговор считается состоявшимся.
 *
 * Носитель состояния — сам предмет, поэтому в сейв ничего дополнительного не
 * едет: инвентарь уже сохраняется. Потерять дневник не значит запереть цепочку:
 * «дневника нет» — это условие его появления, а не потери, и цепочка кладёт его
 * обратно на место смерти (см. `ensurePlotDiaryOnDeathSpot` в `quests.ts`).
 */

import {
  Cell,
  EntityType,
  W,
  type Entity,
  type Item,
} from '../core/types';
import { World } from '../core/world';
import { getPlotNpcPackageByNumericId, plotNpcDisplayName } from '../data/npc_packages';
import { Spr } from '../entities/sprite_index';
import { canSpawnEntityType } from './entity_limits';

export const PLOT_DIARY_ITEM = 'npc_diary';

/** Радиус поиска свободной клетки, если под трупом успела вырасти стена. */
const DIARY_PLACEMENT_RADIUS = 4;

interface PlotDiaryNote {
  /** Персональное имя экземпляра, см. `itemInstanceName`. */
  title: string;
  /** Текст, который печатает «прочесть» — общий путь записок. */
  text: string;
  plotNpcId: number;
}

function plotDiaryNote(plotNpcId: number, name: string): PlotDiaryNote {
  return {
    title: `Дневник ${name}`,
    text: `Дневник: ${name}. Почерк ровный до середины, дальше обрыв. На последней странице: `
      + '«Дело за мной не закрыто. Кто найдёт эту тетрадь — тот и отвечает».',
    plotNpcId,
  };
}

/**
 * Дневник конкретной личности. Имя берётся из пакета, а не из сущности: тот же
 * дневник воплощается и без тела, и оба пути обязаны давать одну вещь.
 */
export function plotDiaryItem(plotNpcId: number, fallbackName?: string): Item | undefined {
  const displayName = plotNpcDisplayName(plotNpcId) ?? fallbackName;
  if (!displayName) return undefined;
  return { defId: PLOT_DIARY_ITEM, count: 1, data: plotDiaryNote(plotNpcId, displayName) };
}

/** Чей это дневник; `undefined` для любого другого предмета. */
export function plotDiaryOwnerId(item: Item | undefined): number | undefined {
  if (!item || item.defId !== PLOT_DIARY_ITEM) return undefined;
  const data = item.data as { plotNpcId?: unknown } | undefined;
  const id = data?.plotNpcId;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Положить дневник в инвентарь умирающего, до того как инвентарь высыпется
 * на пол. Отдельной сущности не заводим: обычный дроп смерти уже умеет всё,
 * включая слоты и защиту записок от вытеснения по FIFO.
 */
export function attachPlotDiary(entity: Entity): void {
  if (entity.type !== EntityType.NPC || entity.alifeId === undefined) return;
  if (getPlotNpcPackageByNumericId(entity.alifeId) === undefined) return;
  const diary = plotDiaryItem(entity.alifeId!, entity.name);
  if (!diary) return;
  if (!entity.inventory) entity.inventory = [];
  if (entity.inventory.some(slot => plotDiaryOwnerId(slot) === entity.alifeId)) return;
  // В начало: `dropEntityInventory` берёт слоты сущностей один раз и на длинном
  // инвентаре может не дотянуться до хвоста.
  entity.inventory.unshift(diary);
}

export function holdsPlotDiary(holder: { inventory?: Item[] } | undefined, plotNpcId: number): boolean {
  return (holder?.inventory ?? []).some(slot => plotDiaryOwnerId(slot) === plotNpcId && slot.count > 0);
}

/**
 * Дневник уже где-то на этаже: лежит дропом, спрятан в контейнере или унесён
 * другим NPC. Спрятать вещь и получить вторую — это не решение игрока, а ферма,
 * поэтому смотрим всё хранилище этажа, а не только пол.
 */
export function plotDiaryOnFloor(world: World, entities: readonly Entity[], plotNpcId: number): boolean {
  const holds = (inv: readonly Item[] | undefined) =>
    (inv ?? []).some(slot => plotDiaryOwnerId(slot) === plotNpcId);
  for (const e of entities) {
    if (!e.alive && e.type === EntityType.ITEM_DROP) continue;
    if (holds(e.inventory)) return true;
  }
  for (const container of world.containers) {
    if (holds(container.inventory)) return true;
  }
  return false;
}

function passable(world: World, x: number, y: number): boolean {
  const cell = world.cells[world.idx(x, y)];
  return cell === Cell.FLOOR || cell === Cell.WATER;
}

/**
 * Клетка смерти или ближайшая проходимая к ней: самосбор мог перестроить пол и
 * замуровать место. Запасной вариант обязателен — молча не поставить дневник
 * значит запереть цепочку, поэтому последним рубежом идут ноги игрока.
 */
function diaryPlacement(world: World, x: number, y: number, fallback: Entity): { x: number; y: number } {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let r = 0; r <= DIARY_PLACEMENT_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const px = (cx + dx) & (W - 1);
        const py = (cy + dy) & (W - 1);
        if (passable(world, px, py)) return { x: px + 0.5, y: py + 0.5 };
      }
    }
  }
  return { x: fallback.x, y: fallback.y };
}

/** Воплотить дневник на этаже. Возвращает `false`, если исчерпан бюджет дропов. */
export function spawnPlotDiary(
  plotNpcId: number, x: number, y: number,
  world: World, entities: Entity[], nextId: { v: number }, fallback: Entity,
): boolean {
  const diary = plotDiaryItem(plotNpcId);
  if (!diary) return false;
  if (!canSpawnEntityType(entities, EntityType.ITEM_DROP)) return false;
  const spot = diaryPlacement(world, x, y, fallback);
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: spot.x,
    y: spot.y,
    angle: 0, pitch: 0, alive: true, speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [diary],
  });
  return true;
}
