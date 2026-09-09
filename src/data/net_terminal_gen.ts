/* ── НЕТ-ТЕРМИНАЛ ГЕН definitions ────────────────────────────── */

import { Feature, ItemType, Tex, type ItemDef } from '../core/types';
import { ITEMS } from './items';

export const NET_TERMINAL_GEN_ITEM_ID = 'net_terminal_gen_flesh';
export const NET_TERMINAL_GEN_ITEM_NAME = 'Странный кусок плоти';
export const NET_TERMINAL_GEN_PICKUP_MESSAGE = 'НЕТ-ГЕН найден. Терминалы откроют редактор карты.';
export const NET_TERMINAL_GEN_DENIED_TEXT = 'НЕТ-ТЕРМИНАЛ ГЕН НЕ ОБНАРУЖЕН';
export const NET_TERMINAL_GEN_OPEN_TEXT = 'НЕТ-ТЕРМИНАЛ ГЕН';

/**
 * Сколько НЕТ-ГЕН-терминалов на обычном этаже.
 *
 * Было ДВЕ константы с одним значением (`MIN` и `MAX`, обе 16) и вес-таблица
 * `0: 76%, 1: 21%, 2: 3%` рядом. Таблица не работала НИ РАЗУ: потребитель брал
 * `Math.max(min(max, MIN), min(max, взвешенное))`, то есть `Math.max(16, 0..2)`
 * — ровно 16 на каждом из пятидесяти этажей без своего профиля.
 *
 * Мёртвой признана таблица, а не граница: замок
 * `tests/net-terminal-economy.test.ts` называет шестнадцать ЗАМЫСЛОМ прямо в
 * своём заголовке. Если редкость НЕТ-ГЕНа когда-нибудь вернут — это решение о
 * балансе, и принимать его подменой константы нельзя.
 */
export const NET_TERMINAL_GEN_NORMAL_TERMINALS = 16;
export const NET_TERMINAL_GEN_DEBUG_MAX_TERMINALS = 8;

export const NET_TERMINAL_GEN_FLESH_ITEM: ItemDef = {
  id: NET_TERMINAL_GEN_ITEM_ID,
  name: NET_TERMINAL_GEN_ITEM_NAME,
  type: ItemType.MISC,
  desc: 'Ключ НЕТ-ТЕРМИНАЛА ГЕН. Тёплый кусок, терминалы признают его как допуск.',
  spawnRooms: [],
  spawnW: 0,
  value: 0,
  tags: ['net_terminal_gen', 'key_item', 'strange_flesh'],
  stack: 1,
};

export interface NetTerminalGenTerminalDef {
  id: string;
  label: string;
  weight: number;
  feature: Feature.SCREEN | Feature.APPARATUS;
  wallTex: Tex;
  glow: string;
  hackDifficulty?: number;
  hackCooldownS?: number;
}

const SCREEN_FRAMES = 4;

export const NET_TERMINAL_GEN_TERMINALS: readonly NetTerminalGenTerminalDef[] = [
  {
    id: 'net_gen_blue_screen',
    label: 'НЕТ-ТЕРМИНАЛ',
    weight: 52,
    feature: Feature.SCREEN,
    wallTex: (Tex.SCREEN_BASE + 2 * SCREEN_FRAMES) as Tex,
    glow: '#6cf',
  },
  {
    id: 'net_gen_meat_console',
    label: 'НЕТ-ТЕРМИНАЛ ГЕН',
    weight: 18,
    feature: Feature.APPARATUS,
    wallTex: (Tex.SCREEN_BASE + 7 * SCREEN_FRAMES) as Tex,
    glow: '#f6a',
  },
  {
    id: 'net_gen_dead_crt',
    label: 'НЕТ-ТЕРМИНАЛ',
    weight: 30,
    feature: Feature.SCREEN,
    wallTex: (Tex.SCREEN_BASE + 5 * SCREEN_FRAMES) as Tex,
    glow: '#8f8',
  },
];

export const SILICON_NET_WELL_TERMINAL_DEF: NetTerminalGenTerminalDef = {
  id: 'silicon_net_well_console',
  label: 'НЕТ-КОЛОДЕЦ',
  weight: 1,
  feature: Feature.SCREEN,
  wallTex: (Tex.SCREEN_BASE + 6 * SCREEN_FRAMES) as Tex,
  glow: '#63f6ff',
  hackDifficulty: 4,
  hackCooldownS: 90,
};

export interface NetTerminalGenFloorProfile {
  floorKey: string;
  minTerminals: number;
  maxTerminals: number;
  terminalDef: NetTerminalGenTerminalDef;
}

export const NET_TERMINAL_GEN_FLOOR_PROFILES: readonly NetTerminalGenFloorProfile[] = [
  {
    floorKey: 'design:silicon_net_well',
    minTerminals: 7,
    maxTerminals: 9,
    terminalDef: SILICON_NET_WELL_TERMINAL_DEF,
  },
];



export const NET_TERMINAL_GEN_PALETTE = {
  denied: '#f44',
  open: '#6cf',
  flesh: '#f8a',
  debug: '#ccf',
} as const;

export function registerNetTerminalGenItem(items: Record<string, ItemDef> = ITEMS): void {
  if (!items[NET_TERMINAL_GEN_ITEM_ID]) items[NET_TERMINAL_GEN_ITEM_ID] = NET_TERMINAL_GEN_FLESH_ITEM;
}

registerNetTerminalGenItem();
