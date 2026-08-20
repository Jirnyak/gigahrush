/* ── Сцены этажа ──────────────────────────────────────────────────
 *
 * Сцена — это объявление, а не код: этаж перечисляет актёров и такты, а общий
 * проигрыватель их отыгрывает. Своего боя, своей смерти и своего расселения у
 * сцены нет — она только ставит людей, даёт им слово и наводит камеру. Всё
 * остальное делают те же системы, что и без зрителя: AI дерётся сам, A-Life
 * помнит убитых, отношение фракций решает, кто в кого стреляет.
 *
 * Отсюда главное правило: такт сцены не вправе назначать исход. `defect` меняет
 * фракцию — дальше как сложится; `awaitDeath` ЖДЁТ смерти, а не устраивает её.
 * Сцена, которая дописывает результат боя, — это уже ролик, а не событие мира.
 *
 * Камера приходит инъекцией (`bindSceneCamera`): рантайм-камера живёт во входной
 * точке, и тянуть её сюда импортом значило бы завести ребро systems → main.
 */

import {
  AIGoal,
  EntityType,
  Faction,
  NpcRole,
  Occupation,
  msg,
  type Entity,
  type GameState,
} from '../core/types';
import { type World } from '../core/world';
import { rng } from '../core/rand';
import { freshNeeds, randomName } from '../data/names';
import { getMaxHp, randomRPG } from './rpg';
import { generateNpcLoadout } from './procedural_loot';
import { entitySpawnSlots } from './entity_limits';
import { rebuildEntityIndexAfterSpawnCleanup } from './entity_index';
import { setNpcPlayerRelation } from './npc_relations';
import { isPlayerEntity } from './player_actor';
import { extractNpcForScene, releaseAllSceneActors, releaseNpcFromScene } from './cinematic_actors';
import {
  captureAlifeFloorState,
  currentAlifeFloorKey,
  materializeAlifeArrival,
  moveAlifeNpcRecord,
  rewriteAlifeNpcIdentityFromEntity,
  sampleAlifeFloorRecordIds,
} from './alife';
import { findAlifeArrivalAnchor } from './alife_migration';
import { publishEvent, registerWorldEventObserver } from './events';
import { registerContentRuntimeHook, type ContentRuntimeContext } from './content_hooks';
import {
  aimCinematicCamera,
  CAMERA_STANDING_HEIGHT,
  cinematicCameraArrived,
  routeCinematicCamera,
  startCinematicCamera,
  type RuntimeCamera,
} from './camera';

/**
 * Комната-якорь по объявленному псевдониму. Тот же точный поиск по `defId`, что
 * у именованных комнат этажа, но искать его импортом в `gen/` нельзя: генераторы
 * стоят НАД системами, и ребро отсюда туда развернуло бы слой.
 */
function sceneAnchorRoom(world: World, alias: string) {
  for (const room of world.rooms) {
    if (room?.defId === alias) return room;
  }
  return undefined;
}

/* ── Объявление ──────────────────────────────────────────────── */

/** Точка кадра: смещение от якоря сцены в клетках либо центр масс роли. */
export type SceneSpot = { ox: number; oy: number } | { role: string };

export type SceneTrigger =
  /** Первый приход на этаж за прогон. */
  | { kind: 'first_visit' }
  /** Публикация события мира с этим типом (и, если задан, тегом). */
  | { kind: 'event'; eventType: string; tag?: string }
  /** Только по явному запросу — сюжетным шагом или отладкой. */
  | { kind: 'manual' };

export interface SceneActorDef {
  /** Метка внутри сцены; такты ссылаются на актёров по ней. */
  role: string;
  /** Авторский житель этажа по id пакета NPC: он уже здесь, сцена его лишь зовёт. */
  packageId?: string;
  /** Массовка: сколько человек воплотить. Игнорируется при `packageId`. */
  count?: number;
  faction?: Faction;
  occupation?: Occupation;
  level?: number;
  /** Место относительно якоря сцены, в клетках. */
  ox: number;
  oy: number;
  /** Разброс массовки вокруг места. */
  spread?: number;
  /**
   * `spawn` — новые люди прямо в кадре; `alife` — уже живущие на этаже, взятые
   * из пула. Второе не создаёт личностей и потому годится для подмоги.
   */
  source?: 'spawn' | 'alife';
  /** Воплотить не на старте сцены, а тактом `materialize`. */
  deferred?: boolean;
}

export type SceneBeat =
  /** Пролёт камеры. `wait` держит такт, пока камера не дойдёт. */
  | { kind: 'fly'; to: SceneSpot; look?: SceneSpot; speed?: number; height?: number; wait?: boolean }
  /** Облёт вокруг точки заданное время. */
  | { kind: 'orbit'; around: SceneSpot; radius: number; speed: number; height?: number; seconds: number }
  /** Реплика в бабл над головой. Без `seconds` длительность берётся из длины строки. */
  | { kind: 'say'; role: string; text: string; color?: string; seconds?: number }
  | { kind: 'pause'; seconds: number }
  /** Ждать, пока роль вымрет. `timeout` — верхняя граница ожидания, не гарантия исхода. */
  | { kind: 'awaitDeath'; role: string; timeout: number }
  /** Смена фракции на ходу: предательство есть смена стороны, а не скрипт убийства. */
  | { kind: 'defect'; roles: readonly string[]; faction: Faction; playerRelation?: number }
  /** Воплотить отложенных актёров роли. */
  | { kind: 'materialize'; role: string }
  /**
   * Отпустить актёров в живой мир. До этого такта они декорация: цикл AI
   * пропускает всех с ролью CINEMATIC_ACTOR целиком (`ai/index.ts`), и пока
   * роль на них — они не сканируют, не ходят и не стреляют. Без этого такта
   * никакой «бой по обычным правилам» невозможен.
   */
  | { kind: 'release'; roles?: readonly string[] }
  /** Увести живых с этажа без записи смерти. */
  | { kind: 'depart'; roles: readonly string[]; toFloorKey: string }
  | { kind: 'log'; text: string; color?: string };

export interface FloorSceneDef {
  id: string;
  /** Ключ этажа-хозяина, `design:living` и подобные. */
  floorKey: string;
  trigger: SceneTrigger;
  /** Псевдоним именованной комнаты — якорь сцены. */
  anchorRoomAlias: string;
  actors: readonly SceneActorDef[];
  beats: readonly SceneBeat[];
  /** Жёсткий потолок проигрывания. Не страховка сюжета — предохранитель камеры. */
  maxSeconds: number;
}

const scenes: FloorSceneDef[] = [];

export function registerFloorScene(def: FloorSceneDef): void {
  const index = scenes.findIndex(existing => existing.id === def.id);
  if (index >= 0) scenes[index] = def;
  else scenes.push(def);
}

export function floorSceneById(id: string): FloorSceneDef | undefined {
  return scenes.find(scene => scene.id === id);
}

/* ── Что уже сыграно ─────────────────────────────────────────── */

/* Обратный пролёт: быстрее показного, но всё же полёт, а не подмена кадра.
 * Потолок нужен на случай, если дороги обратно нет — зритель не должен ждать вечно. */
const SCENE_RETURN_FLY_SPEED = 26;
const SCENE_RETURN_TIMEOUT_S = 12;

const MAX_PLAYED_SCENES = 32;
const playedScenes = new Set<string>();
/** Этажи, на которых игрок уже был: `first_visit` иначе играет при каждом возврате. */
const visitedFloorKeys = new Set<string>();
const MAX_VISITED_FLOOR_KEYS = 64;

export function floorScenesForSave(): string[] {
  return [...playedScenes];
}

export function restoreFloorScenesFromSave(raw: unknown): void {
  playedScenes.clear();
  if (!Array.isArray(raw)) return;
  for (const id of raw) {
    if (typeof id !== 'string' || !id) continue;
    if (playedScenes.size >= MAX_PLAYED_SCENES) break;
    playedScenes.add(id.slice(0, 64));
  }
}

export function resetFloorScenes(state?: GameState, entities?: Entity[]): void {
  // Забыть сыгранное мало: играющую сцену надо ещё и закрыть, иначе замок и
  // роли актёров переживут сброс и останутся висеть без проигрывателя.
  abortFloorScene(state, entities);
  playedScenes.clear();
  visitedFloorKeys.clear();
  pendingSceneId = null;
}

/* ── Камера ──────────────────────────────────────────────────── */

let sceneCamera: RuntimeCamera | null = null;

/** Входная точка отдаёт сцене свою рантайм-камеру. Без неё сцены просто не играют. */
export function bindSceneCamera(camera: RuntimeCamera): void {
  sceneCamera = camera;
}

/* ── Проигрыватель ───────────────────────────────────────────── */

interface ActiveScene {
  def: FloorSceneDef;
  anchorX: number;
  anchorY: number;
  /** Роль → id сущностей. Мёртвые из списка не вычёркиваются: сцена должна знать, кого потеряла. */
  cast: Map<string, number[]>;
  beatIndex: number;
  beatTime: number;
  beatStarted: boolean;
  elapsed: number;
  /** Секунды, потраченные на обратный пролёт к игроку; -1 пока такты не кончились. */
  returning: number;
}

let active: ActiveScene | null = null;
let pendingSceneId: string | null = null;

export function isFloorSceneActive(): boolean {
  return active !== null;
}

export function activeFloorSceneId(): string | null {
  return active?.def.id ?? null;
}

/** Запросить сцену вручную: сюжетным шагом, отладкой или триггером события. */
export function requestFloorScene(id: string): boolean {
  if (active || playedScenes.has(id)) return false;
  if (!floorSceneById(id)) return false;
  pendingSceneId = id;
  return true;
}

registerWorldEventObserver((_state, event) => {
  if (active || pendingSceneId) return;
  for (const scene of scenes) {
    if (scene.trigger.kind !== 'event') continue;
    if (playedScenes.has(scene.id)) continue;
    if (scene.trigger.eventType !== event.type) continue;
    if (scene.trigger.tag && !event.tags?.includes(scene.trigger.tag)) continue;
    pendingSceneId = scene.id;
    return;
  }
});

registerContentRuntimeHook({
  id: 'floor_scenes',
  phases: ['floor_activity'],
  update: ctx => updateFloorScenes(ctx),
});

function updateFloorScenes(ctx: ContentRuntimeContext): boolean {
  if (!sceneCamera) return false;
  if (active) return advanceScene(ctx, active);

  const floorKey = currentAlifeFloorKey(ctx.state);

  // Запрос ждёт своего этажа. Снимать его на чужом значило бы терять и сам
  // запрос, и — вместе с засчитанным визитом — пролог этажа, куда приехали.
  const pending = pendingSceneId ? floorSceneById(pendingSceneId) : undefined;
  if (!pending || playedScenes.has(pending.id)) pendingSceneId = null;

  const candidate = pending && pending.floorKey === floorKey && !playedScenes.has(pending.id)
    ? pending
    : (!visitedFloorKeys.has(floorKey)
        ? scenes.find(scene =>
            scene.trigger.kind === 'first_visit'
            && scene.floorKey === floorKey
            && !playedScenes.has(scene.id))
        : undefined);
  if (!candidate) {
    markFloorVisited(floorKey);
    return false;
  }

  // Визит засчитывается только вместе с поднявшейся сценой. Пометить этаж раньше
  // значило бы: не нашлась комната-якорь на первом кадре — и пролог потерян молча.
  const started = startScene(ctx, candidate);
  if (!started) return false;
  if (candidate === pending) pendingSceneId = null;
  markFloorVisited(floorKey);
  return true;
}

function markFloorVisited(floorKey: string): void {
  if (visitedFloorKeys.size < MAX_VISITED_FLOOR_KEYS) visitedFloorKeys.add(floorKey);
}

function startScene(ctx: ContentRuntimeContext, def: FloorSceneDef): boolean {
  const anchor = sceneAnchorRoom(ctx.world, def.anchorRoomAlias);
  if (!anchor) return false;

  const anchorX = anchor.x + anchor.w / 2;
  const anchorY = anchor.y + anchor.h / 2;
  const cast = new Map<string, number[]>();

  // Клетки, уже занятые актёрами этой сцены: сотня человек без общего учёта
  // встала бы штабелем в одну точку.
  const occupied = new Set<number>();
  for (const actor of def.actors) {
    if (actor.deferred) continue;
    cast.set(actor.role, castActor(ctx, def, actor, anchorX, anchorY, occupied));
  }
  rebuildEntityIndexAfterSpawnCleanup(ctx.entities);

  active = { def, anchorX, anchorY, cast, beatIndex: 0, beatTime: 0, beatStarted: false, elapsed: 0, returning: -1 };
  if (playedScenes.size < MAX_PLAYED_SCENES) playedScenes.add(def.id);
  ctx.state.sceneLock = true;

  startCinematicCamera(sceneCamera!, ctx.player.x, ctx.player.y, [], {
    lookAt: { x: anchorX, y: anchorY },
    hold: true,
    // Кадр начинается там же и так же, как смотрел игрок: иначе первый же кадр
    // сцены — рывок взгляда с нулевого угла, читающийся как телепорт.
    angle: ctx.player.angle,
  });
  routeCinematicCamera(sceneCamera!, ctx.world, anchorX, anchorY);

  publishEvent(ctx.state, {
    type: 'scene_started',
    severity: 2,
    privacy: 'public',
    tags: ['scene', def.id],
  });
  return true;
}

/* ── Расстановка актёров ─────────────────────────────────────── */

function castActor(
  ctx: ContentRuntimeContext,
  def: FloorSceneDef,
  actor: SceneActorDef,
  anchorX: number,
  anchorY: number,
  occupied: Set<number>,
): number[] {
  const x = anchorX + actor.ox;
  const y = anchorY + actor.oy;

  // Авторский житель уже ходит по этажу: сцена зовёт его, а не создаёт заново.
  if (actor.packageId) {
    const existing = ctx.entities.find(e =>
      e.alive
      && e.type === EntityType.NPC
      && (e as Entity & { npcPackageId?: string }).npcPackageId === actor.packageId);
    if (!existing) return [];
    extractNpcForScene(ctx.entities, existing.id, def.id, x, y);
    return [existing.id];
  }

  const count = Math.max(0, actor.count ?? 0);
  if (count === 0) return [];
  return actor.source === 'alife'
    ? materializeFromAlife(ctx, def, actor, x, y, count, occupied)
    : spawnSceneCrowd(ctx, def, actor, x, y, count, occupied);
}

function spawnSceneCrowd(
  ctx: ContentRuntimeContext,
  def: FloorSceneDef,
  actor: SceneActorDef,
  x: number,
  y: number,
  count: number,
  occupied: Set<number>,
): number[] {
  const slots = entitySpawnSlots(ctx.entities, EntityType.NPC, count);
  const faction = actor.faction ?? Faction.CITIZEN;
  const occupation = actor.occupation ?? Occupation.TRAVELER;
  const spread = actor.spread ?? 2;
  const ids: number[] = [];

  for (let i = 0; i < slots; i++) {
    const spot = freeSpotNear(ctx.world, x, y, spread, i, occupied);
    if (!spot) continue;
    const rpg = randomRPG(actor.level ?? 1);
    const maxHp = getMaxHp(rpg);
    const named = randomName(faction);
    const loadout = generateNpcLoadout(faction, rpg.level, 3, rng(), [rng(), rng()]);
    const entity: Entity = {
      id: ctx.nextEntityId.v++,
      type: EntityType.NPC,
      x: spot.x,
      y: spot.y,
      angle: rng() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: 1.25,
      sprite: occupation,
      name: named.name,
      firstName: named.firstName,
      lastName: named.lastName,
      isFemale: named.female,
      needs: freshNeeds(),
      hp: maxHp,
      maxHp,
      money: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: loadout.inventory ?? [],
      weapon: loadout.weapon,
      tool: loadout.tool,
      faction,
      occupation,
      questId: -1,
      rpg,
      role: NpcRole.CINEMATIC_ACTOR,
      cinematicState: { originalRole: NpcRole.WANDERER, originalX: spot.x, originalY: spot.y, sceneId: def.id },
    } as Entity;
    ctx.entities.push(entity);
    ids.push(entity.id);
  }
  return ids;
}

function materializeFromAlife(
  ctx: ContentRuntimeContext,
  def: FloorSceneDef,
  actor: SceneActorDef,
  x: number,
  y: number,
  count: number,
  occupied: Set<number>,
): number[] {
  const floorKey = currentAlifeFloorKey(ctx.state);
  const ids: number[] = [];
  const taken = new Set<number>();
  const spread = actor.spread ?? 3;

  // Выборка отдаёт не больше горсти за раз, поэтому черпаем порциями с разной солью.
  for (let round = 0; round < 4 && ids.length < count; round++) {
    const sampled = sampleAlifeFloorRecordIds(ctx.state, floorKey, count - ids.length, round + 1, {
      faction: actor.faction,
      excludeIds: taken,
    });
    if (!sampled.length) break;
    for (const alifeId of sampled) {
      if (ids.length >= count) break;
      taken.add(alifeId);
      const spot = freeSpotNear(ctx.world, x, y, spread, ids.length, occupied)
        ?? findAlifeArrivalAnchor(ctx.world, x, y, alifeId);
      if (!spot) continue;
      const entity = materializeAlifeArrival(
        ctx.state, ctx.world, ctx.entities, ctx.nextEntityId, alifeId,
        { x: spot.x, y: spot.y }, floorKey,
      );
      if (!entity) continue;
      // Роль запоминается ДО подмены: человек из пула пришёл со своей, и стереть
      // её в WANDERER значило бы, что сцена возвращает не того, кого забрала.
      const originalRole = entity.role || NpcRole.WANDERER;
      entity.role = NpcRole.CINEMATIC_ACTOR;
      entity.cinematicState = {
        originalRole,
        originalX: entity.x,
        originalY: entity.y,
        sceneId: def.id,
      };
      ids.push(entity.id);
    }
  }
  return ids;
}

/**
 * Свободная клетка по расходящейся спирали: массовка не должна стоять ни в стене,
 * ни друг в друге. Занятое запоминается, поэтому толпа растекается по залу.
 */
function freeSpotNear(
  world: World,
  x: number,
  y: number,
  spread: number,
  index: number,
  occupied: Set<number>,
): { x: number; y: number } | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const reach = Math.max(1, Math.ceil(spread));
  for (let radius = 0; radius <= reach; radius++) {
    const ring = Math.max(8, radius * 8);
    for (let attempt = 0; attempt < ring; attempt++) {
      const angle = ((index + attempt) / ring) * Math.PI * 2;
      const px = world.wrap(cx + Math.round(Math.cos(angle) * radius));
      const py = world.wrap(cy + Math.round(Math.sin(angle) * radius));
      const ci = world.idx(px, py);
      if (occupied.has(ci) || world.solid(px, py)) continue;
      occupied.add(ci);
      return { x: px + 0.5, y: py + 0.5 };
    }
  }
  return null;
}

/* ── Такты ───────────────────────────────────────────────────── */

function advanceScene(ctx: ContentRuntimeContext, scene: ActiveScene): boolean {
  scene.elapsed += ctx.dt;

  // Такты кончились (или вышло время) — камера ЛЕТИТ обратно к игроку и только
  // потом отдаёт ему управление. Раньше здесь просто переключался режим, и
  // возвращение читалось как телепорт.
  if (scene.returning >= 0) {
    scene.returning += ctx.dt;
    aimCinematicCamera(sceneCamera!, { lookAt: { x: ctx.player.x, y: ctx.player.y }, orbit: null, hold: true });
    if (scene.returning >= SCENE_RETURN_TIMEOUT_S || cinematicCameraArrived(sceneCamera!)) {
      endScene(ctx, scene);
      return true;
    }
    return false;
  }
  if (scene.elapsed >= scene.def.maxSeconds || scene.beatIndex >= scene.def.beats.length) {
    scene.returning = 0;
    aimCinematicCamera(sceneCamera!, {
      lookAt: { x: ctx.player.x, y: ctx.player.y },
      orbit: null,
      height: CAMERA_STANDING_HEIGHT,
      flySpeed: SCENE_RETURN_FLY_SPEED,
      hold: true,
    });
    routeCinematicCamera(sceneCamera!, ctx.world, ctx.player.x, ctx.player.y);
    return false;
  }

  const beat = scene.def.beats[scene.beatIndex];
  if (!scene.beatStarted) {
    scene.beatStarted = true;
    scene.beatTime = beatDuration(beat);
    enterBeat(ctx, scene, beat);
  }

  scene.beatTime -= ctx.dt;
  if (!beatFinished(ctx, scene, beat)) return false;

  scene.beatIndex++;
  scene.beatStarted = false;
  return false;
}

function beatDuration(beat: SceneBeat): number {
  switch (beat.kind) {
    // Та же зависимость длительности от длины строки, что у обычных барков:
    // короткая фраза не должна висеть, длинная — не должна не дочитываться.
    case 'say': return beat.seconds ?? Math.min(6, Math.max(2.5, beat.text.length * 0.12));
    case 'pause': return beat.seconds;
    case 'orbit': return beat.seconds;
    case 'awaitDeath': return beat.timeout;
    case 'fly': return beat.wait === false ? 0 : Number.POSITIVE_INFINITY;
    default: return 0;
  }
}

function beatFinished(ctx: ContentRuntimeContext, scene: ActiveScene, beat: SceneBeat): boolean {
  if (beat.kind === 'fly' && beat.wait !== false) {
    return cinematicCameraArrived(sceneCamera!);
  }
  if (beat.kind === 'awaitDeath') {
    return scene.beatTime <= 0 || roleIsGone(ctx, scene, beat.role);
  }
  return scene.beatTime <= 0;
}

function enterBeat(ctx: ContentRuntimeContext, scene: ActiveScene, beat: SceneBeat): void {
  switch (beat.kind) {
    case 'fly': {
      const to = resolveSpot(ctx, scene, beat.to);
      const look = beat.look ? resolveSpot(ctx, scene, beat.look) : to;
      routeCinematicCamera(sceneCamera!, ctx.world, to.x, to.y);
      aimCinematicCamera(sceneCamera!, {
        lookAt: look,
        orbit: null,
        height: beat.height,
        flySpeed: beat.speed,
        hold: true,
      });
      return;
    }
    case 'orbit': {
      const around = resolveSpot(ctx, scene, beat.around);
      aimCinematicCamera(sceneCamera!, {
        lookAt: around,
        orbit: { radius: beat.radius, speed: beat.speed },
        height: beat.height,
        hold: true,
      });
      return;
    }
    case 'say': {
      const speaker = firstLivingOfRole(ctx, scene, beat.role);
      if (!speaker) return;
      speaker.activeBark = {
        text: beat.text,
        until: ctx.state.time + beatDuration(beat),
        color: beat.color ?? '#dfe6e0',
        skipTranslate: true,
      };
      ctx.state.msgs.push(msg(`${speaker.name ?? '???'}: ${beat.text}`, ctx.state.time, beat.color ?? '#dfe6e0'));
      return;
    }
    case 'defect': {
      applyDefection(ctx, scene, beat.roles, beat.faction, beat.playerRelation);
      return;
    }
    case 'materialize': {
      const actor = scene.def.actors.find(a => a.role === beat.role);
      if (!actor) return;
      const ids = castActor(ctx, scene.def, actor, scene.anchorX, scene.anchorY, new Set<number>());
      scene.cast.set(beat.role, [...(scene.cast.get(beat.role) ?? []), ...ids]);
      rebuildEntityIndexAfterSpawnCleanup(ctx.entities);
      return;
    }
    case 'release': {
      releaseRoles(ctx, scene, beat.roles);
      return;
    }
    case 'depart': {
      departRoles(ctx, scene, beat.roles, beat.toFloorKey);
      return;
    }
    case 'log': {
      ctx.state.msgs.push(msg(beat.text, ctx.state.time, beat.color ?? '#9ab'));
      return;
    }
    case 'pause':
    case 'awaitDeath':
      return;
  }
}

/**
 * Предательство — смена стороны. Дальше стрелять или не стрелять решает та же
 * матрица отношений, что и всегда, поэтому кэш боевой цели надо сбросить: иначе
 * перебежчик будет добивать уже своих по памяти прошлого кадра.
 */
function applyDefection(
  ctx: ContentRuntimeContext,
  scene: ActiveScene,
  roles: readonly string[],
  faction: Faction,
  playerRelation?: number,
): void {
  for (const role of roles) {
    for (const entity of entitiesOfRole(ctx, scene, role)) {
      entity.faction = faction;
      if (entity.ai) {
        entity.ai.combatTargetId = undefined;
        entity.ai.combatScanCd = 0;
      }
      if (playerRelation !== undefined) setNpcPlayerRelation(entity, playerRelation);
      if (entity.alifeId !== undefined) rewriteAlifeNpcIdentityFromEntity(ctx.state, entity);
    }
  }
  publishEvent(ctx.state, {
    type: 'faction_relation_changed',
    severity: 4,
    privacy: 'public',
    tags: ['scene', scene.def.id, 'defection'],
  });
}

/**
 * Снять со сцены поводок. Роль CINEMATIC_ACTOR — это пауза для одного человека,
 * и держать её на том, кто должен драться, значит выключить ему бой целиком.
 * Без списка ролей отпускаются все, кого сцена держит.
 */
function releaseRoles(ctx: ContentRuntimeContext, scene: ActiveScene, roles?: readonly string[]): void {
  if (!roles) {
    releaseAllSceneActors(ctx.entities, scene.def.id);
    return;
  }
  for (const role of roles) {
    for (const entity of entitiesOfRole(ctx, scene, role)) releaseNpcFromScene(ctx.entities, entity.id);
  }
}

/**
 * Уход, а не смерть. Состояние складывается обратно в A-Life, запись переезжает
 * на другой этаж, сущность вынимается из массива. Ставить `alive = false` тут
 * нельзя: уборщик мёртвых записал бы этих людей погибшими навсегда.
 */
function departRoles(
  ctx: ContentRuntimeContext,
  scene: ActiveScene,
  roles: readonly string[],
  toFloorKey: string,
): void {
  const leaving = new Set<number>();
  for (const role of roles) {
    for (const entity of entitiesOfRole(ctx, scene, role)) {
      // Игроком может оказаться кто угодно из каста: после смерти путь
      // продолжается чужим телом. Вырезать его из массива — вынуть игрока из мира.
      if (isPlayerEntity(entity)) continue;
      leaving.add(entity.id);
    }
  }
  if (!leaving.size) return;

  for (let i = ctx.entities.length - 1; i >= 0; i--) {
    const entity = ctx.entities[i];
    if (!leaving.has(entity.id)) continue;
    // Роль снимается ДО записи в A-Life: иначе человек уезжает на другой этаж
    // помеченным актёром сцены, которой там нет, и остаётся вне цикла AI навсегда.
    releaseNpcFromScene(ctx.entities, entity.id);
    captureAlifeFloorState(ctx.state, [entity]);
    if (entity.alifeId !== undefined) moveAlifeNpcRecord(ctx.state, entity.alifeId, toFloorKey);
    ctx.entities.splice(i, 1);
  }
  rebuildEntityIndexAfterSpawnCleanup(ctx.entities);
}

function endScene(ctx: ContentRuntimeContext, scene: ActiveScene): void {
  releaseAllSceneActors(ctx.entities, scene.def.id);
  ctx.state.sceneLock = false;
  if (sceneCamera) sceneCamera.mode = 'player';
  publishEvent(ctx.state, {
    type: 'scene_ended',
    severity: 2,
    privacy: 'public',
    tags: ['scene', scene.def.id],
  });
  active = null;
}

/**
 * Оборвать сцену снаружи: смерть, переход этажа, загрузка сейва, отладочный
 * сброс. Кадр досматривать некому, но мир обязан остаться целым — замок снят,
 * актёры отпущены со своими ролями, камера снова у игрока. Без этого сцена,
 * прерванная любым из этих путей, оставляла бы управление запертым навсегда.
 */
export function abortFloorScene(state?: GameState, entities?: Entity[]): void {
  const scene = active;
  active = null;
  if (state) state.sceneLock = false;
  if (!scene) return;
  if (entities) releaseAllSceneActors(entities, scene.def.id);
  if (sceneCamera) sceneCamera.mode = 'player';
}

/* ── Разрешение ссылок ───────────────────────────────────────── */

function entitiesOfRole(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): Entity[] {
  const ids = scene.cast.get(role);
  if (!ids || !ids.length) return [];
  const found: Entity[] = [];
  for (const entity of ctx.entities) {
    if (entity.alive && ids.includes(entity.id)) found.push(entity);
  }
  return found;
}

function firstLivingOfRole(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): Entity | undefined {
  return entitiesOfRole(ctx, scene, role)[0];
}

function roleIsGone(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): boolean {
  return entitiesOfRole(ctx, scene, role).length === 0;
}

/** Центр масс роли: кадр держится за людей, а не за координату, которую они уже покинули. */
function resolveSpot(ctx: ContentRuntimeContext, scene: ActiveScene, spot: SceneSpot): { x: number; y: number } {
  if ('role' in spot) {
    const members = entitiesOfRole(ctx, scene, spot.role);
    if (members.length) {
      let sx = 0;
      let sy = 0;
      for (const member of members) {
        sx += member.x;
        sy += member.y;
      }
      return { x: sx / members.length, y: sy / members.length };
    }
    return { x: scene.anchorX, y: scene.anchorY };
  }
  return { x: scene.anchorX + spot.ox, y: scene.anchorY + spot.oy };
}
