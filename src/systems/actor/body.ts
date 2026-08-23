import { AIGoal, Faction, ItemType, type Entity } from '../../core/types';
import type { World } from '../../core/world';
import { findMeatChunkCell, removeVisualSlotCode } from '../../world/visual_cell_slots';
import { stampUrineTraceCadenced } from '../urination';
import { ITEMS } from '../../data/items';
import { consumeInventorySlot } from '../inventory';

/**
 * Локальный шаг тела: закрыть нужду тем, что уже в руках.
 *
 * Это первое, что обязан попробовать телесный драйв, и до сих пор этого не умел
 * никто: голодный с консервой в кармане шёл через весь этаж на кухню, потому
 * что «поесть» в прежнем слое означало ровно «дойти до комнаты с едой». Носить
 * паёк и не съесть его — не характер, а дыра.
 *
 * Идёт НЕ через `useItem`: тот всегда пишет игроку в лог («Экипировано: …»),
 * потому что писался под руки игрока. Здесь берётся сам эффект предмета —
 * `def.use(e)` — и слот уменьшается. Эффект общий с игроком, витрина разная.
 */

/** Что за нужду закрывает предмет этого типа. */
function itemClosesType(type: ItemType, want: ItemType): boolean {
  return type === want;
}

/**
 * Съесть/выпить/применить первое подходящее из инвентаря. Возвращает true,
 * если что-то реально применили.
 *
 * Перебор идёт по СВОЕМУ инвентарю — это карман актора, а не коллекция мира, и
 * запрета на его обход нет: в нём единицы слотов, и он у актора один.
 */
export function consumeCarried(e: Entity, want: ItemType): boolean {
  const inv = e.inventory;
  if (!inv || inv.length === 0) return false;
  for (let i = 0; i < inv.length; i++) {
    const slot = inv[i];
    if (!slot || slot.count <= 0) continue;
    const def = ITEMS[slot.defId];
    if (!def || !def.use || !itemClosesType(def.type, want)) continue;
    def.use(e);
    consumeInventorySlot(e, i, 1);
    return true;
  }
  return false;
}

/** Есть ли в карманах то, чем закрыть эту нужду. Дешёвая проверка для счёта. */
export function carriesFor(e: Entity, want: ItemType): boolean {
  const inv = e.inventory;
  if (!inv || inv.length === 0) return false;
  for (let i = 0; i < inv.length; i++) {
    const slot = inv[i];
    if (!slot || slot.count <= 0) continue;
    const def = ITEMS[slot.defId];
    if (def && def.use && itemClosesType(def.type, want)) return true;
  }
  return false;
}

/* ── Что закрывается НА МЕСТЕ, без комнаты ────────────────────────
 *
 * Оба случая ниже — не украшение, а перенесённые механики: они жили внутри
 * обработчиков прежнего слоя и умерли бы вместе с ними. Форма общая: «можно ли
 * закрыть нужду прямо здесь», и вызывается она раньше всякой дороги.
 */

/** Радиус, в котором зверь замечает кусок мяса. Как было в прежнем слое. */
const MEAT_SNIFF_RADIUS = 16;
/** Код куска мяса в слотах клетки. */
const MEAT_SLOT_CODE = 34;
/** Сколько сытости даёт кусок. */
const MEAT_FOOD = 35;

/**
 * Сожрать кусок мяса с пола. Дикие и культисты едят падаль, не спрашивая
 * кухню; остальным это несвойственно.
 */
export function eatMeatChunk(world: World, e: Entity): boolean {
  const n = e.needs;
  if (!n || n.food >= 15) return false;
  if (e.faction !== Faction.WILD && e.faction !== Faction.CULTIST) return false;
  const chunk = findMeatChunkCell(world, e.x, e.y, MEAT_SNIFF_RADIUS);
  // Дотянуться надо своей рукой: за куском через комнату идёт уже общий шаг
  // «дойти до еды», и дублировать его здесь незачем.
  if (!chunk || world.dist2(e.x, e.y, chunk.x, chunk.y) > 1.35 * 1.35) return false;
  removeVisualSlotCode(world, world.idx(chunk.x, chunk.y), MEAT_SLOT_CODE);
  n.food = Math.min(100, n.food + MEAT_FOOD);
  return true;
}

/**
 * Облегчиться там, где стоишь.
 *
 * Намеренный редкий хардкод фракции, как и было: дикие — тот design-эксперимент,
 * в котором принадлежность видна через публичное мочеиспускание вместо
 * уборной. Остальные ищут комнату.
 */
export function relieveInPlace(world: World, e: Entity, now: number): boolean {
  const n = e.needs;
  if (!n || e.faction !== Faction.WILD || n.pee <= 15) return false;
  stampUrineTraceCadenced(world, e, now, {
    pressure: n.pee / 100,
    streamLength: 0.95,
    intervalSeconds: 0.16,
    streamSteps: n.pee > 60 ? 18 : 14,
    width: 0.05,
    dropCount: 1,
  });
  n.pee = Math.max(0, n.pee - NPC_TOILET_PEE_RATE);
  if (e.ai) e.ai.goal = AIGoal.IDLE;
  return true;
}

/** Скорость облегчения, как в прежнем слое. */
const NPC_TOILET_PEE_RATE = 20;

export { ItemType };
