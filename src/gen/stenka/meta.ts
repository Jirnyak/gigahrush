/* ── Стенка на стенку: константы карты ───────────────────────── */

import type { Room } from '../../core/types';
import { World } from '../../core/world';

export const STENKA_ROUTE_ID = 'stenka';
export const STENKA_Z = -44;

/** Арена — квадрат внутри тора; всё снаружи остаётся сплошной стеной. */
export const ARENA_MIN = 96;
export const ARENA_MAX = 928;

/** Полоса линии. Уже — крипы толкутся, шире — теряется чувство коридора. */
export const LANE_WIDTH = 9;
/** Отросток в лес: заметно уже линии, чтобы глаз отличал тупик от пути. */
export const CAMP_LINK_WIDTH = 4;

export const BASE_SIZE = 96;
export const BASE_A = { x: 176, y: 848 };  // ликвидаторы, низ-лево
export const BASE_B = { x: 848, y: 176 };  // дикие, верх-право

/** Углы, через которые идут боковые линии. */
export const CORNER_TOP = { x: 176, y: 176 };
export const CORNER_BOT = { x: 848, y: 848 };

export type LaneId = 'top' | 'mid' | 'bot';
export const LANE_IDS: readonly LaneId[] = ['top', 'mid', 'bot'];

/** Доли длины линии: где стоят гнёзда, башни и целевая комната марша. */
export const NEST_T = 0.12;
export const TARGET_T = 0.88;
export const TOWER_TS: readonly number[] = [0.26, 0.42, 0.58, 0.74];

export interface StenkaLane {
  id: LaneId;
  /** Ломаная линии: от базы A к базе B. */
  points: readonly { x: number; y: number }[];
  /** Длина в клетках, чтобы доли считались по факту, а не по глазу. */
  length: number;
}

export interface StenkaRooms {
  baseA: Room;
  baseB: Room;
  /** Комнаты-цели марша: по одной на конце каждой линии с каждой стороны. */
  frontA: Record<LaneId, Room>;
  frontB: Record<LaneId, Room>;
  camps: Room[];
  /** Клетка логова каждого лагеря — В ТОЛЩЕ скалы за карманом, не на полу. */
  campDens: { x: number; y: number }[];
}

export interface StenkaMetrics {
  routeId: string;
  z: number;
  laneCells: number;
  campCount: number;
  denCount: number;
  towerCount: number;
  nestCount: number;
}

export const STENKA_METRICS = new WeakMap<World, StenkaMetrics>();
