import { type Entity, NpcRole } from '../core/types';
import { getEntityIndex, ENTITY_MASK_NPC } from './entity_index';

export function selectCinematicExtras(
  count: number,
  nearX: number,
  nearY: number,
  radius: number,
): Entity[] {
  if (count <= 0) return [];
  const queryLimit = count * 3;
  const raw: Entity[] = [];
  getEntityIndex().queryRadiusCapped(nearX, nearY, radius, raw, ENTITY_MASK_NPC, queryLimit);

  const extras: Entity[] = [];
  for (const e of raw) {
    if (e.alive && e.role !== NpcRole.CINEMATIC_ACTOR) {
      extras.push(e);
      if (extras.length >= count) {
        break;
      }
    }
  }
  return extras;
}

export function extractNpcForScene(
  entities: Entity[],
  npcId: number,
  sceneId: string,
  targetX: number,
  targetY: number,
): boolean {
  const npc = entities.find((e: Entity) => e.id === npcId);
  if (!npc) return false;

  npc.cinematicState = {
    originalRole: npc.role || NpcRole.WANDERER,
    originalX: npc.x,
    originalY: npc.y,
    sceneId: sceneId,
  };

  npc.role = NpcRole.CINEMATIC_ACTOR;

  npc.x = targetX;
  npc.y = targetY;

  return true;
}

export function releaseNpcFromScene(entities: Entity[], npcId: number): void {
  const npc = entities.find((e: Entity) => e.id === npcId);
  if (!npc || !npc.cinematicState) return;

  npc.role = npc.cinematicState.originalRole;
  npc.cinematicState = undefined;
}

export function releaseAllSceneActors(entities: Entity[], sceneId: string): void {
  for (const npc of entities) {
    if (npc.cinematicState?.sceneId === sceneId) {
      releaseNpcFromScene(entities, npc.id);
    }
  }
}
