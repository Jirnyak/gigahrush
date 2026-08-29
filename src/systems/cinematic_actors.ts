import { type Entity, NpcRole } from '../core/types';
import { getEntityIndex, ENTITY_MASK_NPC } from './entity_index';
import { releaseActorFromRoom } from './room_leash';

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
    // Пост — место В СЦЕНЕ, а не то, откуда человека позвали: на нём его и
    // держит поводок, пока сцена его не отпустит.
    postX: targetX,
    postY: targetY,
    sceneId: sceneId,
  };

  npc.role = NpcRole.CINEMATIC_ACTOR;

  npc.x = targetX;
  npc.y = targetY;

  return true;
}

/**
 * Снять с поста. Вместе с ролью снимается и привязка к залу сцены
 * (`bindCastToStage`): пост держится комнатой, и отпустить человека, оставив
 * ему запрет выходить за порог, значило бы отпустить его на словах.
 *
 * Свой пост актёра при этом теряется: сцена его перезаписала, когда забирала
 * человека на площадку. Сегодня это никого не задевает — постов в проекте два
 * (Ольга и Баринов), и ни один не занят ни в одной сцене.
 */
export function releaseNpcFromScene(entities: Entity[], npcId: number): void {
  const npc = entities.find((e: Entity) => e.id === npcId);
  if (!npc || !npc.cinematicState) return;

  releaseActorFromRoom(npc);
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
