import { FloorLevel } from '../core/types';
import { RESOURCES } from './resources';

export interface ResourceStock {
  stock: number;
  target: number;
  lastDelta: number;
}

export interface EconomyFloorState {
  floor: FloorLevel;
  resources: Record<string, ResourceStock>;
  lastTickAt: number;
}

export interface EconomyState {
  floors: Partial<Record<FloorLevel, EconomyFloorState>>;
  priceVersion: number;
}

export function createEconomyState(): EconomyState {
  return { floors: {}, priceVersion: 1 };
}

export function createEconomyFloorState(floor: FloorLevel): EconomyFloorState {
  const resources: Record<string, ResourceStock> = {};
  for (const r of RESOURCES) resources[r.id] = { stock: r.baseStock, target: r.baseStock, lastDelta: 0 };
  return { floor, resources, lastTickAt: 0 };
}

export function normalizeEconomyState(value: unknown): EconomyState {
  const src = (value && typeof value === 'object') ? value as Partial<EconomyState> : {};
  const out = createEconomyState();
  out.priceVersion = src.priceVersion ?? 1;
  if (src.floors) {
    for (const k of Object.keys(src.floors)) {
      const floor = Number(k) as FloorLevel;
      const existing = src.floors[floor];
      const normalized = createEconomyFloorState(floor);
      if (existing?.resources) {
        for (const r of RESOURCES) {
          const v = existing.resources[r.id];
          if (v) normalized.resources[r.id] = {
            stock: Number.isFinite(v.stock) ? v.stock : r.baseStock,
            target: Number.isFinite(v.target) ? v.target : r.baseStock,
            lastDelta: Number.isFinite(v.lastDelta) ? v.lastDelta : 0,
          };
        }
      }
      normalized.lastTickAt = existing?.lastTickAt ?? 0;
      out.floors[floor] = normalized;
    }
  }
  return out;
}
