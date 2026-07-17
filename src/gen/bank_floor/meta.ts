export const BANK_ROOM_NAMES = {
  liftLobby: 'Лифтовый вестибюль банка Б-22',
  hall: 'Главный кассовый зал банка Б-22',
  teller: 'Кассовая линия банка Б-22',
  deposit: 'Депозитный ряд банка Б-22',
  credit: 'Кредитное окно банка Б-22',
  queue: 'Очередь должников банка Б-22',
  vault: 'Хранилище кассовых ячеек Б-22',
  bypass: 'Черный служебный обход банка Б-22',
  tellerLane: 'Кассовая змейка ожидания Б-22',
  debtorCircuit: 'Долговая петля Б-22',
  bribeQueue: 'Нулевая очередь подкупщиков Б-22',
  vaultShell: 'Наружная оболочка хранилища Б-22',
  bypassGate: 'Черный пост служебного обхода Б-22',
} as const;

export const BANK_HQ_ROOM_NAMES = {
  citizen: 'Герметическая комната гражданского баланса Б-22',
  liquidator: 'Герметический пост инкассаторов Б-22',
  cultist: 'Герметическая свечная долгового культа Б-22',
  scientist: 'Герметическая лаборатория счетчиков НИИ Б-22',
  wild: 'Герметическая ночная касса диких Б-22',
} as const;

import { designNpcFloorKey } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('bank_floor');

export const BANK_FLOOR_ROUTE_ID = 'bank_floor' as const;
export const BANK_FLOOR_Z = 26;
export const BANK_FLOOR_BASE_FLOOR = 30;

export const BANK_FLOOR_META = {
  routeId: BANK_FLOOR_ROUTE_ID,
  displayName: 'Банковский этаж',
  z: BANK_FLOOR_Z,
  // Bank B-22 lives in the Ministry band because money here is paperwork first:
  // accounts, stamped debt, audits and liquidator-backed vault rules.
  baseReason: 'ministry_bureaucratic_finance',
  debugEntry: 'generateBankFloorDesignFloor()',
} as const;

export interface BankFloorState {
  routeId: typeof BANK_FLOOR_ROUTE_ID;
  anchorZ: typeof BANK_FLOOR_Z;
  legalRooms: string[];
  riskRooms: string[];
  debtCircuitRooms: string[];
  vaultContainerIds: number[];
  depositContainerIds: number[];
  vaultRiskRadius: number;
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface BankFloorGeneration extends FloorGeneration {
  bankState: BankFloorState;
}

export type BankActionKind = 'deposit' | 'loan' | 'repay' | 'forgery' | 'vault_theft';

export const BANK_TAGS = ['banking', BANK_FLOOR_ROUTE_ID];
