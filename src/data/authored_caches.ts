import { ContainerKind, RoomType } from '../core/types';
import { ITEMS, ITEM_TAGS, getStack } from './items';

/**
 * Именованные схроны процедурных этажей.
 *
 * Дом предмета объявляет сам предмет — тегом, равным `id` схрона. Генератор
 * ничего не знает про конкретные стволы: он смотрит на контекст этажа
 * (глубина, опасность, геометрия, большинство) и собирает содержимое из всех
 * предметов, заявивших этот дом. Новое оружие получает свой тайник одной
 * строкой в `items.ts`, без правок генератора.
 *
 * Раньше на месте этого реестра лежали четыре рукописные функции в
 * `procedural_floor.ts` с захардкоженными списками, а один схрон вдобавок
 * гейтился жребием `lootBiasIds` — то есть авторская сцена существовала,
 * только если случайная пятёрка вытянула её предмет.
 */
export interface AuthoredCacheDef {
  /** Тег-дом: предмет с этим тегом попадает в схрон. */
  id: string;
  name: string;
  kind: ContainerKind;
  /** Условия этажа. Пустое поле — условия нет. */
  minDepth?: number;
  minDanger?: number;
  geometryIds?: readonly string[];
  majorityIds?: readonly string[];
  /** Где ставить: тип комнаты или префикс имени (авторские островки). */
  roomTypes?: readonly RoomType[];
  roomNamePrefix?: string;
  /** Сколько таких схронов на этаже. */
  copies?: number;
  /** Дополнительные теги контейнера поверх `id`. */
  tags?: readonly string[];
}

export const AUTHORED_CACHES: readonly AuthoredCacheDef[] = [
  {
    id: 'deep_engineer_stash',
    name: 'Инженерный тайник 6О15-УТТХ',
    kind: ContainerKind.WEAPON_CRATE,
    minDepth: 30,
    minDanger: 4,
    geometryIds: ['workshops', 'service_spines'],
    majorityIds: ['liquidators'],
    roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE],
    tags: ['engineer', 'breach', 'napalm', 'fuel'],
  },
  {
    id: 'deep_recon_stash',
    name: 'Глубинный разведтайник Лосяша',
    kind: ContainerKind.SECRET_STASH,
    minDepth: 45,
    minDanger: 5,
    geometryIds: ['sump_causeways'],
    roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.HQ],
    tags: ['anti_elite'],
  },
  {
    id: 'deep_liquidator_reward',
    name: 'Глубинный ликвидаторский ящик «Гранит»-4у',
    kind: ContainerKind.WEAPON_CRATE,
    minDepth: 45,
    minDanger: 5,
    majorityIds: ['liquidators'],
    roomTypes: [RoomType.HQ, RoomType.STORAGE, RoomType.PRODUCTION],
  },
  {
    id: 'sump_island_stash',
    name: 'Тайник сухого острова',
    kind: ContainerKind.SECRET_STASH,
    geometryIds: ['sump_causeways'],
    roomNamePrefix: 'Сухой остров черной воды',
    copies: 2,
    tags: ['blackwater_crossing', 'contaminated_route', 'repair_cache'],
  },
];

/** Контекст этажа, от которого зависит существование схрона. */
export interface AuthoredCacheFloorContext {
  depth: number;
  danger: number;
  geometryId: string;
  majorityId: string;
}

export function authoredCacheMatchesFloor(def: AuthoredCacheDef, ctx: AuthoredCacheFloorContext): boolean {
  if (def.minDepth !== undefined && ctx.depth < def.minDepth) return false;
  if (def.minDanger !== undefined && ctx.danger < def.minDanger) return false;
  if (def.geometryIds && !def.geometryIds.includes(ctx.geometryId)) return false;
  if (def.majorityIds && !def.majorityIds.includes(ctx.majorityId)) return false;
  return true;
}

export function authoredCacheById(id: string): AuthoredCacheDef | undefined {
  return AUTHORED_CACHES.find(def => def.id === id);
}

/** Предметы, объявившие этот дом. Тяжёлый ствол идёт первым — по ценности. */
export function authoredCacheItemIds(cacheId: string): string[] {
  return Object.keys(ITEMS)
    .filter(itemId => ITEM_TAGS[itemId]?.includes(cacheId) || ITEMS[itemId]?.tags?.includes(cacheId))
    .sort((a, b) => (ITEMS[b]?.value ?? 0) - (ITEMS[a]?.value ?? 0) || a.localeCompare(b));
}

/**
 * Содержимое схрона. Количество — одно выражение на всё: чем опаснее этаж, тем
 * больше расходников, но не выше стака предмета. На опасности 5 это ровно те
 * числа, что раньше стояли в коде списками (три пачки болтов, три напалма).
 */
export function authoredCacheContents(cacheId: string, danger: number): { defId: string; count: number }[] {
  return authoredCacheItemIds(cacheId).map(defId => {
    const def = ITEMS[defId]!;
    return { defId, count: Math.max(1, Math.min(getStack(def), danger - 2)) };
  });
}
