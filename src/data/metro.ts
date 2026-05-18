/* ── Metro Error Line route definitions ──────────────────────── */

import { FloorLevel } from '../core/types';

export const METRO_STATION_ROOM_NAME = 'Станция ошибочной линии: платформа 19';
export const METRO_DEPOT_ROOM_NAME = 'Депо без рельсов: карман маршрута';
export const METRO_ERROR_ROOM_NAME = 'Слепая пересадка: чужой вестибюль';

export type MetroDestination =
  | { kind: 'floor'; floor: FloorLevel; label: string }
  | { kind: 'local'; roomName: string; label: string };

export interface MetroRouteDef {
  id: string;
  stationRoomName: string;
  panelSlot: number;
  label: string;
  requiredItem?: string;
  wrongStopChance: number;
  cooldownSec: number;
  destination: MetroDestination;
  wrongStops: readonly MetroDestination[];
  rumorIds: readonly string[];
}

const TO_LIVING: MetroDestination = { kind: 'floor', floor: FloorLevel.LIVING, label: 'Жилая зона' };
const TO_HELL: MetroDestination = { kind: 'floor', floor: FloorLevel.HELL, label: 'Красная нижняя' };
const TO_DEPOT: MetroDestination = { kind: 'local', roomName: METRO_DEPOT_ROOM_NAME, label: 'Депо без рельсов' };
const TO_ERROR: MetroDestination = { kind: 'local', roomName: METRO_ERROR_ROOM_NAME, label: 'Слепая пересадка' };

export const METRO_ROUTES: readonly MetroRouteDef[] = [
  {
    id: 'metro_living_loop',
    stationRoomName: METRO_STATION_ROOM_NAME,
    panelSlot: 0,
    label: 'Жилая петля',
    requiredItem: 'metro_ticket',
    wrongStopChance: 0.18,
    cooldownSec: 18,
    destination: TO_LIVING,
    wrongStops: [TO_ERROR, TO_HELL],
    rumorIds: ['floor_metro_error_line', 'floor_metro_wrong_voice'],
  },
  {
    id: 'metro_red_lower',
    stationRoomName: METRO_STATION_ROOM_NAME,
    panelSlot: 1,
    label: 'Красная нижняя',
    requiredItem: 'metro_ticket',
    wrongStopChance: 0.34,
    cooldownSec: 24,
    destination: TO_HELL,
    wrongStops: [TO_ERROR, TO_LIVING],
    rumorIds: ['floor_metro_red_line', 'floor_metro_wrong_voice'],
  },
  {
    id: 'metro_railess_depot',
    stationRoomName: METRO_STATION_ROOM_NAME,
    panelSlot: 2,
    label: 'Депо без рельсов',
    requiredItem: 'metro_ticket',
    wrongStopChance: 0.12,
    cooldownSec: 16,
    destination: TO_DEPOT,
    wrongStops: [TO_ERROR],
    rumorIds: ['floor_metro_depot'],
  },
  {
    id: 'metro_blind_transfer',
    stationRoomName: METRO_STATION_ROOM_NAME,
    panelSlot: 3,
    label: 'Слепая пересадка',
    requiredItem: 'metro_ticket',
    wrongStopChance: 0.42,
    cooldownSec: 28,
    destination: TO_ERROR,
    wrongStops: [TO_LIVING, TO_HELL],
    rumorIds: ['floor_metro_wrong_voice'],
  },
];

export function metroRouteForPanel(stationRoomName: string, panelSlot: number): MetroRouteDef | undefined {
  return METRO_ROUTES.find(r => r.stationRoomName === stationRoomName && r.panelSlot === panelSlot);
}
