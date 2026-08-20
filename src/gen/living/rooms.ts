/* ── Именованные комнаты жилого этажа ─────────────────────────────
 *
 * Этаж несёт свою таблицу сам и ни на чей чужой список не смотрит: комната
 * принадлежит своему этажу. Здесь только те комнаты, на которые ссылается
 * контент — пакет NPC своим `spawnRoomAlias` или квест своим `targetRoomDefId`.
 * Жилые, кухни и кладовые сюда не попадают: они процедурны, их число зависит от
 * жребия, и объявлять его значило бы врать. Правила — `rooms.md`.
 */

import { RoomType } from '../../core/types';
import type { NamedRoomTable } from '../named_rooms';

export const LIVING_NAMED_ROOMS = {
  tutor_hall: {
    type: RoomType.COMMON,
    name: 'Актовый зал',
    tags: ['tutorial', 'briefing'],
  },
  armory: {
    type: RoomType.PRODUCTION,
    name: 'Оружейная',
    tags: ['tutorial', 'range', 'weapons'],
  },
  yakov_lab: {
    type: RoomType.MEDICAL,
    name: 'Лаборатория Якова Давидовича',
    tags: ['lab', 'science'],
  },
  prologue_hall: {
    type: RoomType.COMMON,
    name: 'Разборный зал',
    tags: ['scene', 'liquidator', 'aftermath'],
  },
} as const satisfies NamedRoomTable;
