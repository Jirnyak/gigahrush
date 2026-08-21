import { EntityType, Feature, W, type Entity, type GameState, type Quest } from '../core/types';
import type { World } from '../core/world';
import { isQuestTargetOnCurrentFloor, resolveQuestTargetRoom } from './contracts';
import { hasItem } from './inventory';
import { getPrimaryRouteObjective } from './route_cues';
import { TUTORIAL_START } from '../data/tutorial_start';
import { TutorialStep } from './tutorial';

/** On-screen guidance for whatever the player is supposed to reach right now.
 *
 *  Two sources, one presentation. While the tutorial runs it owns the guide as a
 *  linear chain — sink, toilet, key, locked door, Ольга Дмитриевна — with Ольга as
 *  the deliberate last stop: her talk lines already teach WASD/E/I, so the guide
 *  only has to deliver the player to her. Afterwards the active task from the
 *  quest screen takes over, pointing at its target on the current floor.
 *
 *  The tutorial stage is derived from world state, not from a new saved field:
 *  `tutorialStep` alone is not enough because it stays on TOILET through both the
 *  key and the door. Nothing here mutates state, so the sequence survives reloads
 *  and cannot desync from what the player has actually done. */

export type TutorialGuideKind = 'sink' | 'toilet' | 'key' | 'door' | 'npc';
export type GuideKind = TutorialGuideKind | 'quest';

export interface TutorialGuideTarget {
  kind: GuideKind;
  x: number;
  y: number;
  label: string;
}

/* Опознавательные знаки сиквенса — из общего договора, а не своей копией:
 * ставит их генератор, ищет их этот файл, и расходиться им нельзя. */
const { keyId: TUTORIAL_KEY_ID, tutorNpcPackageId: TUTOR_NPC_PACKAGE_ID,
        roomTag: TUTORIAL_ROOM_TAG, toiletUrge: TOILET_URGE } = TUTORIAL_START;
/** Static targets never move; re-resolving them every frame would be a world scan. */
const RESOLVE_INTERVAL_SEC = 0.5;
/** Quest text is a sentence; the on-screen slot is one line in a small iframe. */
const QUEST_LABEL_MAX = 30;

const LABELS: Record<TutorialGuideKind, string> = {
  sink: 'ПОПЕЙТЕ ИЗ РАКОВИНЫ',
  toilet: 'СХОДИТЕ В УБОРНУЮ',
  key: 'ПОДБЕРИТЕ КЛЮЧ',
  door: 'ОТКРОЙТЕ ДВЕРЬ КЛЮЧОМ',
  npc: 'ПОГОВОРИТЕ С ОЛЬГОЙ ДМИТРИЕВНОЙ',
};

interface GuideCache {
  world: World | null;
  kind: GuideKind | null;
  questId: number;
  resolvedAt: number;
  x: number;
  y: number;
  entity: Entity | null;
}

const EMPTY_CACHE: GuideCache = { world: null, kind: null, questId: -1, resolvedAt: -Infinity, x: 0, y: 0, entity: null };

let cache: GuideCache = EMPTY_CACHE;

export function resetTargetGuide(): void {
  cache = EMPTY_CACHE;
}

export function tutorialGuideStage(state: GameState, player: Entity): TutorialGuideKind | null {
  const step = state.tutorialStep;
  if (step === undefined) return null;

  if (state.tutorialMode) {
    if (step === TutorialStep.DRINK) return 'sink';
    const needs = player.needs;
    if (needs && (needs.pee > TOILET_URGE || needs.poo > TOILET_URGE)) return 'toilet';
    return hasItem(player, TUTORIAL_KEY_ID) ? 'door' : 'key';
  }

  // The tutorial flag drops the moment the locked door opens, but the handoff is
  // not finished until Ольга has actually handed out the first quest.
  if (step === TutorialStep.DONE) {
    return state.quests.length === 0 ? 'npc' : null;
  }
  return null;
}

function tutorialRoomFeature(world: World, feature: Feature): { x: number; y: number } | null {
  for (const room of world.rooms) {
    // Обход идёт каждый кадр из `drawHUD`, так что дыра в `world.rooms` тут
    // валит весь игровой цикл, а не одну подсказку. Плотность обещана
    // генерацией (`stampRoom`), но цена страховки — одно сравнение.
    if (!room?.tags?.includes(TUTORIAL_ROOM_TAG)) continue;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (world.features[world.idx(x, y)] === feature) return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return null;
}

function tutorialKeyDrop(entities: readonly Entity[]): Entity | null {
  for (const e of entities) {
    if (e.type !== EntityType.ITEM_DROP || !e.alive) continue;
    if (e.inventory?.some(item => item.defId === TUTORIAL_KEY_ID)) return e;
  }
  return null;
}

function tutorialKeyDoor(world: World): { x: number; y: number } | null {
  for (const [idx, door] of world.doors) {
    if (door.keyId !== TUTORIAL_KEY_ID) continue;
    return { x: (idx % W) + 0.5, y: Math.floor(idx / W) + 0.5 };
  }
  return null;
}

function tutorNpc(entities: readonly Entity[]): Entity | null {
  for (const e of entities) {
    if (!e.alive || e.type !== EntityType.NPC) continue;
    if ((e as { npcPackageId?: string }).npcPackageId === TUTOR_NPC_PACKAGE_ID) return e;
  }
  return null;
}

/** The task the guide follows: the one picked on the quest screen (`Q`), falling
 *  back to the same objective the HUD `ЦЕЛЬ` panel names, so the marker and the
 *  panel never disagree. */
function activeQuest(state: GameState): Quest | undefined {
  const picked = state.activeQuestId !== undefined
    ? state.quests.find(q => q.id === state.activeQuestId && !q.done && !q.failed)
    : undefined;
  return picked ?? getPrimaryRouteObjective(state);
}

function questLabel(quest: Quest): string {
  const raw = (quest.targetHint || quest.desc || 'задание').trim();
  const short = raw.length > QUEST_LABEL_MAX ? `${raw.slice(0, QUEST_LABEL_MAX - 1)}…` : raw;
  return short.toUpperCase();
}

function resolveQuest(world: World, state: GameState, entities: readonly Entity[], player: Entity, quest: Quest): GuideCache {
  const base: GuideCache = { world, kind: 'quest', questId: quest.id, resolvedAt: 0, x: 0, y: 0, entity: null };
  // Off-floor targets get no marker: the route panel already names the lift, and a
  // bracket pointing through a wall at another floor teaches the wrong thing.
  if (!isQuestTargetOnCurrentFloor(quest, state)) return { ...base, kind: null };

  if (quest.targetNpcId !== undefined) {
    for (const e of entities) {
      if (e.alive && e.type === EntityType.NPC && e.id === quest.targetNpcId) return { ...base, entity: e };
    }
  }
  const resolved = resolveQuestTargetRoom(world, quest, player);
  if (resolved?.container) return { ...base, x: resolved.container.x + 0.5, y: resolved.container.y + 0.5 };
  if (resolved?.room) {
    return { ...base, x: resolved.room.x + resolved.room.w / 2, y: resolved.room.y + resolved.room.h / 2 };
  }
  return { ...base, kind: null };
}

function resolve(kind: TutorialGuideKind, world: World, entities: readonly Entity[]): GuideCache {
  const base: GuideCache = { world, kind, questId: -1, resolvedAt: 0, x: 0, y: 0, entity: null };
  switch (kind) {
    case 'sink':
    case 'toilet': {
      const spot = tutorialRoomFeature(world, kind === 'sink' ? Feature.SINK : Feature.TOILET);
      return spot ? { ...base, x: spot.x, y: spot.y } : { ...base, kind: null };
    }
    case 'door': {
      const spot = tutorialKeyDoor(world);
      return spot ? { ...base, x: spot.x, y: spot.y } : { ...base, kind: null };
    }
    case 'key': {
      const drop = tutorialKeyDrop(entities);
      return drop ? { ...base, entity: drop } : { ...base, kind: null };
    }
    case 'npc': {
      const npc = tutorNpc(entities);
      return npc ? { ...base, entity: npc } : { ...base, kind: null };
    }
  }
}

/** Current guidance target, or null when there is nothing to point at: no tutorial
 *  stage left, no active task, or the target is not on this floor.
 *  `questGuide: false` keeps the quest marker off while still running the tutorial
 *  chain — the tutorial must not be silenced by a UI toggle. */
export function guideTarget(
  world: World,
  state: GameState,
  entities: readonly Entity[],
  player: Entity,
  options: { questGuide?: boolean } = {},
): TutorialGuideTarget | null {
  const tutorialKind = tutorialGuideStage(state, player);
  const quest = tutorialKind || options.questGuide === false ? undefined : activeQuest(state);
  const kind: GuideKind | null = tutorialKind ?? (quest ? 'quest' : null);
  if (!kind) return null;

  const questId = quest?.id ?? -1;
  const entityGone = cache.entity !== null && !cache.entity.alive;
  const stale = cache.world !== world
    || cache.kind !== kind
    || cache.questId !== questId
    || entityGone
    || state.time - cache.resolvedAt > RESOLVE_INTERVAL_SEC;
  if (stale) {
    const resolved = quest
      ? resolveQuest(world, state, entities, player, quest)
      : resolve(kind as TutorialGuideKind, world, entities);
    cache = { ...resolved, resolvedAt: state.time };
  }
  if (cache.kind !== kind) return null;

  const entity = cache.entity;
  return {
    kind,
    x: entity ? entity.x : cache.x,
    y: entity ? entity.y : cache.y,
    label: quest ? questLabel(quest) : LABELS[kind as TutorialGuideKind],
  };
}
