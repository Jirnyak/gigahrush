/* ── Canonical runtime keys for route stops and floor instances ─ */

import { FloorLevel } from '../core/types';
import { designFloorAtZ, type DesignFloorId } from '../data/design_floors';
import { proceduralFloorKey, storyFloorAtZ } from '../data/procedural_floors';

export type FloorKeyKind = 'story' | 'design' | 'procedural' | 'floor_instance' | 'unknown';

const STORY_KEY_IDS: Record<FloorLevel, string> = {
  [FloorLevel.MINISTRY]: 'ministry',
  [FloorLevel.KVARTIRY]: 'kvartiry',
  [FloorLevel.LIVING]: 'living',
  [FloorLevel.MAINTENANCE]: 'maintenance',
  [FloorLevel.HELL]: 'hell',
  [FloorLevel.VOID]: 'void',
};

export interface FloorKeyEntryLike {
  z?: number;
  baseFloor: FloorLevel;
  storyFloor?: FloorLevel;
  designFloorId?: DesignFloorId | string;
  spec?: { key: string };
}

export function cleanFloorKey(input: unknown): string {
  return typeof input === 'string'
    ? input.trim().replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96)
    : '';
}

export function floorKeyForStory(floor: FloorLevel): string {
  return `story:${STORY_KEY_IDS[floor] ?? String(floor)}`;
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
  if (key.startsWith('story:')) return 'story';
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
  const story = storyFloorAtZ(z);
  if (story !== undefined) return floorKeyForStory(story);
  const design = designFloorAtZ(z);
  if (design) return floorKeyForDesign(design.id);
  return floorKeyForProcedural(proceduralFloorKey(z));
}

export function floorKeyForEntry(entry: FloorKeyEntryLike): string {
  if (entry.storyFloor !== undefined) return floorKeyForStory(entry.storyFloor);
  if (entry.designFloorId) return floorKeyForDesign(entry.designFloorId);
  if (entry.spec) return floorKeyForProcedural(entry.spec.key);
  if (typeof entry.z === 'number' && Number.isFinite(entry.z)) return floorKeyForZ(Math.trunc(entry.z));
  return floorKeyForStory(entry.baseFloor);
}
