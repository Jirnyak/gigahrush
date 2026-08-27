/* -- Design z: Черный рынок 88 - metadata & types -- */

import { designNpcFloorKey } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('black_market_88');

export const BLACK_MARKET_88_ROUTE_ID = 'black_market_88' as const;
export const BLACK_MARKET_88_DISPLAY_NAME = 'Черный рынок 88';
export const BLACK_MARKET_88_FUTURE_Z = -10;
/* Здесь стояло `BLACK_MARKET_88_CONTAINER_FLOOR = 100` — вторая константа на ту
 * же высоту, из выжженной шкалы, и уезжала она в `z` ящиков рынка. Канон −10
 * лежал строкой выше, и его же сверяет с маршрутом `tests/black-market-88.test.ts`. */

export type Market88LaneId = 'survival' | 'weapons' | 'medicine' | 'documents' | 'access';
export type Market88AccessKind = 'password' | 'maintenance_hatch' | 'ministry_document';
export type Market88Settlement = 'rubles' | 'item' | 'contract' | 'document' | 'faction';
