/* ── Именованные комнаты Базы Ликвидаторов ────────────────────────
 *
 * Этаж несёт свою таблицу сам: смысл авторской комнаты локален, и глобального
 * реестра в проекте нет (`rooms.md`, `src/gen/named_rooms.ts`). Здесь только те
 * комнаты, на которые ссылается контент; кварталы, бараки и башни периметра
 * процедурны и объявлять их число значило бы врать.
 *
 * Тип комнаты здесь — не подпись, а ПОВЕДЕНИЕ. Ядро актора выбирает комнату по
 * `room.type` через таблицу аффордансов (`src/data/room_affordances.ts`), теги в
 * этом выборе не участвуют вовсе. Практическое следствие для гарнизона: обход
 * (`patrol`) объявлен у CORRIDOR 24, HQ 20, COMMON 12 и больше нигде, поэтому
 * пост и разводная линейка объявлены КОРИДОРАМИ — иначе часовому на них незачем
 * ходить. Каптёрка и погреб — STORAGE, потому что `store` живёт там.
 */

import { RoomType } from '../../core/types';
import type { NamedRoomTable } from '../named_rooms';

/** Псевдоним арены. Он же — якорь сцены боя (`arena_duel.ts`). */
export const LIQUIDATOR_BASE_ARENA_ANCHOR = 'liquidatorbase_arena';

/* Слой «военный распорядок» (`order.ts`). */
export const LIQ_PARADE = 'liquidatorbase_parade';
export const LIQ_MUSTER = 'liquidatorbase_muster';
export const LIQ_BARRACKS = 'liquidatorbase_barracks';
export const LIQ_ARMORY = 'liquidatorbase_armory';
export const LIQ_INFIRMARY = 'liquidatorbase_infirmary';
export const LIQ_BRIG = 'liquidatorbase_brig';
export const LIQ_RANGE = 'liquidatorbase_range';
export const LIQ_WAR_ROOM = 'liquidatorbase_war_room';
export const LIQ_GUARDHOUSE = 'liquidatorbase_guardhouse';

/* Слой «арена как экономика» (`arena_quarter.ts`). */
export const LIQ_RANK_BOX = 'liquidatorbase_rank_box';
export const LIQ_BETTING_ROW = 'liquidatorbase_betting_row';
export const LIQ_TOTE = 'liquidatorbase_tote';
export const LIQ_FIGHTER_BARRACKS = 'liquidatorbase_fighter_barracks';
export const LIQ_BONESETTER = 'liquidatorbase_bonesetter';
export const LIQ_PITS = 'liquidatorbase_pits';

/* Слой «передний край» (`frontline.ts`). */
export const LIQ_GATE_POST = 'liquidatorbase_gate_post';
export const LIQ_DECON = 'liquidatorbase_decon';
export const LIQ_QUARANTINE = 'liquidatorbase_quarantine';
export const LIQ_MEMORIAL = 'liquidatorbase_memorial';
export const LIQ_TROPHY_HALL = 'liquidatorbase_trophy_hall';
export const LIQ_TROPHY_STORE = 'liquidatorbase_trophy_store';

/* Слой «снабжение Блинкова» (`supply.ts`). */
export const LIQ_LOADING = 'liquidatorbase_loading';
export const LIQ_SUPPLY = 'liquidatorbase_supply';
export const LIQ_AMMO_ROOM = 'liquidatorbase_ammo_room';
export const LIQ_FUEL_YARD = 'liquidatorbase_fuel_yard';
export const LIQ_WORKSHOP = 'liquidatorbase_workshop';
export const LIQ_SALVAGE = 'liquidatorbase_salvage';

export const LIQUIDATOR_BASE_NAMED_ROOMS = {
  [LIQUIDATOR_BASE_ARENA_ANCHOR]: {
    type: RoomType.COMMON,
    name: 'Арена Базы',
    tags: ['scene', 'liquidator', 'sand'],
  },

  // ── Военный распорядок ─────────────────────────────────────────
  [LIQ_PARADE]: { type: RoomType.COMMON, name: 'Плац', tags: ['liquidator', 'order', 'parade'] },
  [LIQ_MUSTER]: { type: RoomType.CORRIDOR, name: 'Разводная линейка', tags: ['liquidator', 'order', 'muster'] },
  [LIQ_BARRACKS]: { type: RoomType.LIVING, name: 'Казарма первой смены', tags: ['liquidator', 'order', 'shift'] },
  [LIQ_ARMORY]: { type: RoomType.STORAGE, name: 'Оружейная гарнизона', tags: ['liquidator', 'order', 'weapons'] },
  [LIQ_INFIRMARY]: { type: RoomType.MEDICAL, name: 'Лазарет гарнизона', tags: ['liquidator', 'order', 'medicine'] },
  [LIQ_BRIG]: { type: RoomType.LIVING, name: 'Гауптвахта', tags: ['liquidator', 'order', 'brig'] },
  [LIQ_RANGE]: { type: RoomType.CORRIDOR, name: 'Стрельбище гарнизона', tags: ['liquidator', 'order', 'range'] },
  [LIQ_WAR_ROOM]: { type: RoomType.HQ, name: 'Штабная с картой шахты', tags: ['liquidator', 'order', 'war_room'] },
  [LIQ_GUARDHOUSE]: { type: RoomType.CORRIDOR, name: 'Караулка развода', tags: ['liquidator', 'order', 'post'] },

  // ── Арена как экономика ────────────────────────────────────────
  [LIQ_RANK_BOX]: { type: RoomType.COMMON, name: 'Ложа по чину', tags: ['liquidator', 'arena_quarter', 'rank'] },
  [LIQ_BETTING_ROW]: { type: RoomType.CORRIDOR, name: 'Ставочный ряд', tags: ['liquidator', 'arena_quarter'] },
  [LIQ_TOTE]: { type: RoomType.MARKET, name: 'Тотализатор', tags: ['liquidator', 'arena_quarter', 'bets'] },
  [LIQ_FIGHTER_BARRACKS]: { type: RoomType.LIVING, name: 'Барак бойцов', tags: ['liquidator', 'arena_quarter'] },
  [LIQ_BONESETTER]: { type: RoomType.MEDICAL, name: 'Костоправ при песке', tags: ['liquidator', 'arena_quarter'] },
  [LIQ_PITS]: { type: RoomType.LIVING, name: 'Ямы для пленных', tags: ['liquidator', 'arena_quarter', 'prison'] },

  // ── Передний край ──────────────────────────────────────────────
  [LIQ_GATE_POST]: { type: RoomType.CORRIDOR, name: 'Пост южных ворот', tags: ['liquidator', 'frontline', 'post'] },
  [LIQ_DECON]: { type: RoomType.BATHROOM, name: 'Шлюз дезактивации', tags: ['liquidator', 'frontline', 'decon'] },
  [LIQ_QUARANTINE]: { type: RoomType.MEDICAL, name: 'Карантин вернувшихся', tags: ['liquidator', 'frontline'] },
  [LIQ_MEMORIAL]: { type: RoomType.COMMON, name: 'Стена памяти', tags: ['liquidator', 'frontline', 'memorial'] },
  [LIQ_TROPHY_HALL]: { type: RoomType.COMMON, name: 'Трофейная стена', tags: ['liquidator', 'frontline', 'trophy'] },
  [LIQ_TROPHY_STORE]: { type: RoomType.STORAGE, name: 'Склад трофеев снизу', tags: ['liquidator', 'frontline', 'trophy'] },

  // ── Снабжение Блинкова ─────────────────────────────────────────
  [LIQ_LOADING]: { type: RoomType.CORRIDOR, name: 'Погрузочная линейка', tags: ['liquidator', 'supply'] },
  [LIQ_SUPPLY]: { type: RoomType.STORAGE, name: 'Каптёрка старшины', tags: ['liquidator', 'supply', 'counter'] },
  [LIQ_AMMO_ROOM]: { type: RoomType.STORAGE, name: 'Патронный погреб', tags: ['liquidator', 'supply', 'ammo'] },
  [LIQ_FUEL_YARD]: { type: RoomType.STORAGE, name: 'Топливный двор', tags: ['liquidator', 'supply', 'fuel'] },
  [LIQ_WORKSHOP]: { type: RoomType.PRODUCTION, name: 'Оружейная мастерская', tags: ['liquidator', 'supply', 'workshop'] },
  [LIQ_SALVAGE]: { type: RoomType.PRODUCTION, name: 'Сортировка трофеев', tags: ['liquidator', 'supply', 'salvage'] },
} as const satisfies NamedRoomTable;
