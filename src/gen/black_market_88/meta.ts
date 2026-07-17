/* -- Design z: Черный рынок 88 - metadata & types -- */

import { designNpcFloorKey } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('black_market_88');

export const BLACK_MARKET_88_ROUTE_ID = 'black_market_88' as const;
export const BLACK_MARKET_88_DISPLAY_NAME = 'Черный рынок 88';
export const BLACK_MARKET_88_FUTURE_Z = -10;
export const BLACK_MARKET_88_CONTAINER_FLOOR = 100;

export type Market88LaneId = 'survival' | 'weapons' | 'medicine' | 'documents' | 'access';
export type Market88AccessKind = 'password' | 'maintenance_hatch' | 'ministry_document';
export type Market88Settlement = 'rubles' | 'item' | 'contract' | 'document' | 'faction';
