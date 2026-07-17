import { } from '../core/types';
import {
  designFloorAtZ,
  designFloorById,
  type DesignFloorId,
} from './design_floors';
import {
  floorRunZAllowsNpcs,
  PROCEDURAL_FLOOR_ZS,
  proceduralFloorKey,
} from './procedural_floors';
import {
  floorInstanceAllowsNpcs,
  floorInstanceById,
} from './floor_instances';

export type FloorKeyKind = 'design' | 'procedural' | 'floor_instance' | 'unknown';



export interface FloorKeyResolveContext {
  proceduralSpecs?: Readonly<Record<string, { z?: number; themeTags?: readonly string[] }>>;
  extraKnownKeys?: readonly string[] | ReadonlySet<string>;
}

export function cleanFloorKey(input: unknown): string {
  if (typeof input === 'number') return String(input);
  return typeof input === 'string'
    ? input.trim().replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96)
    : '';
}


export function floorKeyForDesign(id: string): string {
  return `design:${cleanFloorKey(id)}`;
}

export function floorKeyForProcedural(key: string): string {
  return `procedural:${cleanFloorKey(key)}`;
}

export function floorKeyForFloorInstance(id: string): string {
  return `floor_instance:${cleanFloorKey(id)}`;
}

export function floorKeyKind(keyInput: string): FloorKeyKind {
  const key = cleanFloorKey(keyInput);
  if (key.startsWith('design:')) return 'design';
  if (key.startsWith('procedural:')) return 'procedural';
  if (key.startsWith('floor_instance:')) return 'floor_instance';
  return 'unknown';
}

export function floorKeyRouteId(keyInput: string): string {
  const key = cleanFloorKey(keyInput);
  const idx = key.indexOf(':');
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export function floorKeyForZ(z: number): string {
  const design = designFloorAtZ(z);
  if (design) return floorKeyForDesign(design.id);
  return floorKeyForProcedural(proceduralFloorKey(z));
}

const PROCEDURAL_ROUTE_ID_TO_Z = new Map<string, number>(
  PROCEDURAL_FLOOR_ZS.map(z => [proceduralFloorKey(z), z])
);

function proceduralZForRouteId(routeId: string, context?: FloorKeyResolveContext): number | undefined {
  const specZ = context?.proceduralSpecs?.[routeId]?.z;
  if (typeof specZ === 'number' && Number.isFinite(specZ)) return Math.trunc(specZ);
  return PROCEDURAL_ROUTE_ID_TO_Z.get(routeId);
}

function extraKeyKnown(key: string, extraKnownKeys: FloorKeyResolveContext['extraKnownKeys']): boolean {
  if (!extraKnownKeys) return false;
  if ('has' in extraKnownKeys) return extraKnownKeys.has(key);
  return extraKnownKeys.includes(key);
}

export function floorKeyZ(keyInput: string, context?: FloorKeyResolveContext): number | undefined {
  const key = cleanFloorKey(keyInput);
  const kind = floorKeyKind(key);
  if (kind === 'design') return designFloorById(floorKeyRouteId(key))?.z;
  if (kind === 'procedural') return proceduralZForRouteId(floorKeyRouteId(key), context);
  return undefined;
}

export function floorKeyBaseFloor(keyInput: string, context?: FloorKeyResolveContext): readonly string[] | undefined {
  const key = cleanFloorKey(keyInput);
  const kind = floorKeyKind(key);
  if (kind === 'design') return designFloorById(floorKeyRouteId(key))?.themeTags;
  if (kind === 'procedural') return context?.proceduralSpecs?.[floorKeyRouteId(key)]?.themeTags;
  if (kind === 'floor_instance') return floorInstanceById(floorKeyRouteId(key))?.themeTags;
  return undefined;
}

export function floorKeyKnown(keyInput: string, context?: FloorKeyResolveContext): boolean {
  const key = cleanFloorKey(keyInput);
  const kind = floorKeyKind(key);
  if (kind === 'design') return designFloorById(floorKeyRouteId(key)) !== undefined;
  if (kind === 'procedural') return proceduralZForRouteId(floorKeyRouteId(key), context) !== undefined || extraKeyKnown(key, context?.extraKnownKeys);
  if (kind === 'floor_instance') return floorInstanceById(floorKeyRouteId(key)) !== undefined || extraKeyKnown(key, context?.extraKnownKeys);
  return false;
}

export function floorKeyAllowsNpcs(keyInput: string, context?: FloorKeyResolveContext): boolean | undefined {
  const key = cleanFloorKey(keyInput);
  if (floorKeyKind(key) === 'floor_instance') return floorInstanceAllowsNpcs(floorKeyRouteId(key));
  const z = floorKeyZ(keyInput, context);
  return z === undefined ? undefined : floorRunZAllowsNpcs(z);
}

export type { DesignFloorId };
