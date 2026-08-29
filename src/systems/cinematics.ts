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
  MonsterKind,
  NpcRole,
  Occupation,
  msg,
  type Entity,
  type GameState,
} from '../core/types';
import { MONSTERS } from '../entities/monster';
import { monsterSpr } from '../entities/sprite_index';
import { type World } from '../core/world';
import { rng } from '../core/rand';
import { freshNeeds, randomName } from '../data/names';
import { getMaxHp, randomRPG } from './rpg';
import { generateNpcLoadout } from './procedural_loot';
import { entitySpawnSlots } from './entity_limits';
import { ENTITY_MASK_ACTOR, ensureEntityIndex, rebuildEntityIndexAfterSpawnCleanup } from './entity_index';
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
  setAlifeNpcFactionOverride,
} from './alife';
import { findAlifeArrivalAnchor, findLiftDepartureAnchor } from './alife_migration';
import { bfsPath } from './ai/pathfinding';
import { setActorOrder } from './ai/goto_order';
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
import { bindActorToRoom, bindActorToSpot, releaseActorFromRoom } from './room_leash';

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

/**
 * Точка кадра: смещение от якоря сцены, центр масс роли либо тот, кто говорил
 * последним.
 *
 * Центр масс годится для толпы, но не для реплики: у роли в двадцать шесть человек
 * он не совпадает ни с кем, и бабл говорящего уходит за край кадра. `speaker`
 * держит ось на самом человеке.
 */
export type SceneSpot = { ox: number; oy: number } | { role: string } | { speaker: true };

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
  /**
   * Кто это. Без поля — люди; с ним — монстры этого вида, из общего реестра
   * `MONSTERS`. Сцена не заводит своих тварей и не описывает их поведение:
   * поставленный монстр дерётся ровно как любой другой на этаже.
   */
  monster?: MonsterKind;
  /** Разброс массовки вокруг места. */
  spread?: number;
  /**
   * Чем роль вооружена. Без поля — по фракционному профилю, как у любого
   * жителя этажа (`generateNpcLoadout`).
   *
   * Нужно там, где оружие — условие СЦЕНЫ, а не имущество человека: на песок
   * арены выходят с тем, что дали, и обоим дают одно и то же. Профиль фракции
   * этого не выражает и выразить не должен — культисту он выдаёт пси-сгусток
   * вместо ствола ВСЕГДА, и объявленный дуэлянтом пленный выходил драться с
   * пустыми руками (`senses.armed` читает слот оружия, а не пси-инструмент).
   *
   * Патронов сцена не выдаёт, и это не упущение: магазин NPC пополняется сам
   * (`ai/combat.ts`, ветка перезарядки), из инвентаря ничего не расходуется.
   *
   * Только для массовки, которую сцена создаёт сама. У человека из пула
   * (`source: 'alife'`) и у авторского жителя своё имущество, и переписывать
   * его сцена не вправе: он переживёт кадр и уйдёт с ним дальше жить.
   */
  weapon?: string;
  /**
   * Поставить не вокруг точки, а КОЛЬЦОМ на таком радиусе от неё. Для наплыва со
   * всех сторон: `spread` задаёт максимум поиска места и потому всегда сажает
   * первых у самого центра, а кольцо разносит их по окружности.
   */
  ring?: number;
  /**
   * На сколько кучек разбить массовку. Без него число выводится из плотности:
   * ровный веер спирали читается как строй по линейке, а толпа стоит группами.
   */
  clusters?: number;
  /**
   * `spawn` — новые люди прямо в кадре; `alife` — уже живущие на этаже, взятые
   * из пула. Второе не создаёт личностей и потому годится для подмоги.
   */
  source?: 'spawn' | 'alife';
  /** Воплотить не на старте сцены, а тактом `materialize`. */
  deferred?: boolean;
  /**
   * Свой поводок ОТПУЩЕННОЙ роли, короче или длиннее общего
   * (`FloorSceneDef.leash`).
   *
   * Общий поводок держит толпу в пределах места действия, и он заведомо шире
   * комнаты. Тому, на ком стоит кадр, этого мало: командир с поводком в комнату
   * шириной уходит из кадра совершенно законно. Короткий поводок держит его в
   * середине — не запрещая драться, а возвращая обратно.
   */
  leash?: number;
  /**
   * Свой радиус ПОСТА: держать роль у её места в строю, а не в зале.
   *
   * По умолчанию пост держится комнатой-якорем (`bindCastToStage`): человек
   * ходит по залу, говорит и остаётся в кадре, ни с кем не споря. Радиус нужен
   * там, где само расстояние и есть содержание кадра, — двое враждебных на
   * одном песке разойдутся по краям только по объявленному числу.
   *
   * Отдельным полем, а не тем же `leash`, потому что это ДРУГОЙ смысл, и жили
   * они на одном поле напрасно: поводок дуэлянта на песке обязан быть коротким
   * до сигнала и широким после него. Одно число не бывает и тем и другим.
   */
  post?: number;
}

export type SceneBeat =
  /**
   * Пролёт камеры. `wait` держит такт, пока камера не дойдёт.
   *
   * Без `look` кадр смотрит ПО КУРСУ и поворачивает вместе с ломаной — так читается
   * дорога. С `look` курс и взгляд разъезжаются: камера летит по маршруту, не
   * отпуская актёров, и на длинной дороге это выглядит полётом боком.
   */
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
   * Отпустить актёров в живой мир. До этого такта их держит ПОСТ, а не
   * выключенный AI: цикл AI прогоняет актёра сцены наравне со всеми
   * (`ai/index.ts` — ветка `role === CINEMATIC_ACTOR → continue` снята
   * намеренно, она делала вторую, несимулируемую породу людей), а с места его
   * не пускает поводок места (`bindCastToStage`): дорога за порог зала или за
   * радиус поста ему просто не назначается. То есть актёр на посту живёт,
   * говорит и отвечает на удар, но своей волей места не покидает. `release`
   * снимает роль вместе с постом и ставит взамен поводок МЕСТА ДЕЙСТВИЯ, если
   * сцена его объявила.
   */
  | { kind: 'release'; roles?: readonly string[] }
  /** Увести живых с этажа без записи смерти. Мгновенно — годится вне кадра. */
  | { kind: 'depart'; roles: readonly string[]; toFloorKey: string }
  /**
   * Уйти своими ногами: к ближайшему лифту, и лишь там — с этажа. Такт не ждёт
   * прихода, поэтому сцена вправе закрыться сразу после реплики.
   *
   * С этажа никого не снимают, ПОКА СЦЕНА ИДЁТ, и ещё выдержку после её конца:
   * камера успевает вернуться к игроку, и только потом ушедшие развоплощаются
   * вдалеке. Уйти в кадре — то же, что не уйти.
   */
  | { kind: 'walkOut'; roles: readonly string[]; toFloorKey: string }
  /**
   * Отправить роли своими ногами в точку сцены. Ни телепорта, ни новой механики:
   * та же цель `GOTO`, которой ходят все, и то же ведение, что у `walkOut`, —
   * бой и нужды сбивают курс, и его возвращают каждый кадр.
   *
   * Нужен, когда кадр должен застать человека В ОПРЕДЕЛЁННОМ МЕСТЕ: отпущенный в
   * живой мир актёр забивается в угол, и облёт вокруг него упирается в стену.
   *
   * Это ВЕЙПОЙНТ, а не поводок: цель поставлена — и человек свободен. Держать его
   * на точке нельзя, иначе, дойдя, он в неё утыкается и стоит вместо того, чтобы
   * жить дальше. `wait` лишь придерживает такт, давая время дойти.
   */
  | { kind: 'moveTo'; roles: readonly string[]; to: SceneSpot; wait?: number };

/* Такта «строка в журнал» здесь нет намеренно. Сцену смотрят, а не читают:
 * стеносводка во время кадра закрыта, и написанное в неё не увидит никто. Всё,
 * что сцена хочет сказать, она говорит баблом над головой — то есть `say`. */

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
  /**
   * Насколько далеко от якоря актёрам позволено уйти, пока сцена идёт. Ушедшего
   * дальше тянет обратно — не цепью, а целью: обычный `GOTO`, который бой и нужды
   * вправе перебить.
   *
   * Нужен там, где кадр держится за людей. Отпущенные в живой мир разбегаются по
   * этажу — кто за едой, кто в бой, — и облёт вокруг говорящего оказывается
   * облётом вокруг пустого места, а сам говорящий уже в соседней трубе.
   */
  leash?: number;
  /**
   * Расчистить место действия перед расстановкой: посторонние акторы внутри
   * этого радиуса от якоря отходят наружу.
   *
   * Не всякой сцене это нужно, поэтому и не по умолчанию. Нужно там, где кадр
   * держится на том, КТО стоит в середине: случайный жилец, оказавшийся на
   * песке арены, — это не зевака, а третий боец, враждебный одному из двоих по
   * той же матрице отношений. Замерено на Базе (сид 20881): на песке стоял
   * посторонний ликвидатор, и дуэль двоих превращалась в травлю пленного.
   *
   * Отход — перестановка на свободную клетку за радиусом, а не удаление и не
   * приказ уйти. Приказ проигрывает гонку с камерой (человек идёт клетку в
   * секунду, кадр доезжает за десять), а на самой перестановке смотреть ещё
   * некому: сцена поднимается, когда игрок только вошёл на этаж.
   */
  clearRadius?: number;
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
  // Запрос сцены принадлежит ПРОГОНУ, а не игре: загруженный прогон о нём не
  // знает, и переживший загрузку запрос поднял бы чужую сцену на первом же
  // подходящем этаже. В сейв запросы не едут — только сыгранное.
  pendingSceneId = null;
  deferredSceneId = null;
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
  deferredSceneId = null;
}

/* ── Камера ──────────────────────────────────────────────────── */

let sceneCamera: RuntimeCamera | null = null;
/**
 * Кадр отпущен игроку по его же решению. Сцена при этом ЖИВА и доигрывает свои
 * такты, но камера ей больше не принадлежит — как и ввод, HUD и неуязвимость.
 *
 * Флаг один на весь проигрыватель нарочно: «наша ли камера» спрашивают восемь
 * мест, и восемь разрозненных проверок разъехались бы на первой же правке.
 */
let sceneFrameReleased = false;
/**
 * Взведено ли требование кадра. Кнопку, ЗАЖАТУЮ ДО начала сцены, пропуском
 * считать нельзя: то же действие держат ради фонаря, и пролог этажа пропадал бы
 * молча у всякого, кто вошёл в дверь с включённым светом. Взводит отпускание.
 */
let sceneReleaseArmed = false;

/** Входная точка отдаёт сцене свою рантайм-камеру. Без неё сцены просто не играют. */
export function bindSceneCamera(camera: RuntimeCamera): void {
  sceneCamera = camera;
}

/**
 * Камера, ПОКА ОНА СЦЕНЫ. После того как игрок забрал кадр себе, здесь null, и
 * все камерные такты становятся пустыми: отпущенная сцена ведёт людей и реплики,
 * а кадр — уже не её дело.
 */
function sceneOwnedCamera(): RuntimeCamera | null {
  return sceneFrameReleased ? null : sceneCamera;
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
  /** Кто сказал последнюю реплику. По нему наводится точка кадра `speaker`. */
  lastSpeakerId?: number;
  /* Клетки, уже занятые кастом этой сцены.
   *
   * Набор ведётся ОДИН на всю расстановку: `startScene` так и делал, а
   * отложенный такт `materialize` заводил свежий и потому не знал, где стоит
   * первый каст. Вторая волна (подкрепление, второй заход обороны) вставала в
   * тех, кто уже на месте: поиск свободной клетки смотрит на стены, но не на
   * соседа. Тот же запрет записан в самом `startScene` — «сотня человек без
   * общего учёта встала бы штабелем в одну точку». */
  occupied: Set<number>;
  /** Комната-якорь: ею же держится каст, поставленный внутри неё (`bindCastToStage`). */
  anchorRoomId: number;
  /** Поднятую верёвку снимают с отпущенных один раз, а не каждый кадр. */
  leashLiftApplied: boolean;
  /**
   * Верёвка поднята: ОТПУЩЕННЫХ место действия больше не держит.
   *
   * Поводок нужен ровно до тех пор, пока актёру есть что делать в кадре. Пока
   * дело не решено, он честно не даёт разбежаться; как только решено — держать
   * человека на радиусе значит превращать его в столб. Кто и когда решает, что
   * дело кончено, знает только сам пакет этажа: у одного это смерть бойца, у
   * другого — приход подкрепления, и проигрывателю знать об этом нечего
   * (`liftSceneLeash`).
   *
   * Стоящих НА ПОСТУ это не касается вовсе: пост — замена выключенному AI, и он
   * держится до конца сцены. Зрителей на трибуне не отпускает никто.
   */
  leashLifted: boolean;
  /**
   * За кем сейчас следит кадр. Свойство СЦЕНЫ, а не такта: реплика, пауза и
   * ожидание смерти длятся секундами, и всё это время человек ходит. Прицел,
   * взятый один раз тактом пролёта, к концу его фразы смотрит в пустое место,
   * где тот стоял.
   *
   * Не задано — кадр смотрит по курсу, и следить не за кем.
   */
  focus?: SceneSpot;
}

let active: ActiveScene | null = null;
let pendingSceneId: string | null = null;
/**
 * Второй запрос, пришедший пока первый ещё ждёт своей комнаты или своего этажа.
 *
 * Слот ровно ОДИН, и это не полумера. Событие в шине не повторяется: пропущенное
 * наблюдателем не вернуть ниоткуда, поэтому «два подряд» обязано пережить хотя бы
 * друг друга. А очередь произвольной длины — машинерия под задачу, которой нет:
 * событийная сцена привязана к своему этажу, и трёх сразу на одном этаже не
 * бывает. Переполнение теперь честное — `queueScene` возвращает `false`, а не
 * молчит.
 */
let deferredSceneId: string | null = null;

/**
 * Поставить сцену в очередь запросов. Слотов два: первый ждёт своего этажа,
 * второй ждёт первого. Одна и та же сцена оба слота занять не может.
 */
function queueScene(id: string): boolean {
  if (id === pendingSceneId || id === deferredSceneId || active?.def.id === id) return false;
  if (!pendingSceneId) { pendingSceneId = id; return true; }
  if (!deferredSceneId) { deferredSceneId = id; return true; }
  return false;
}

/** Снять текущий запрос и поднять на его место отложенный. */
function shiftPendingScene(): void {
  pendingSceneId = deferredSceneId;
  deferredSceneId = null;
}

export function isFloorSceneActive(): boolean {
  return active !== null;
}

export function activeFloorSceneId(): string | null {
  return active?.def.id ?? null;
}

const NO_SCENE_ACTORS: readonly number[] = [];

/**
 * Состав роли идущей сцены. Пусто, если сцена не играет или играет другая.
 *
 * Наружу отдаются id, а не сущности: спрашивает это пакет этажа, у которого на
 * руках свой кадр со своим индексом, и второй проход по массиву ему не нужен.
 * Мёртвые из состава не вычёркиваются — сцена обязана знать, кого потеряла, —
 * поэтому «жив ли» спрашивающий решает сам.
 */
export function floorSceneRoleIds(sceneId: string, role: string): readonly number[] {
  if (!active || active.def.id !== sceneId) return NO_SCENE_ACTORS;
  return active.cast.get(role) ?? NO_SCENE_ACTORS;
}

/**
 * Поднять поводок места действия: с этой секунды он не держит ОТПУЩЕННЫХ.
 *
 * Общий глагол, а не услуга одному этажу. Поводок сцены — не декорация и не
 * страховка на всякий случай: он стоит ровно столько, сколько актёру есть что
 * делать в кадре. Дело кончилось — верёвку снимают, иначе живой человек
 * упирается в невидимую стену и стоит столбом до конца сцены (замерено на арене
 * Базы: победитель дуэли простоял на радиусе двадцать две секунды из шестидесяти
 * и пошёл только на закрытии сцены).
 *
 * Когда именно дело кончено, проигрывателю знать неоткуда, и угадывать он не
 * вправе: у дуэли это смерть одного из двоих, у обороны — отбитая волна, у
 * смотра — прошедшая мимо колонна. Решает пакет этажа и зовёт это сам.
 *
 * Возвращает, сработало ли: сцена не та, не идёт или верёвка уже поднята — `false`.
 */
export function liftSceneLeash(sceneId: string): boolean {
  if (!active || active.def.id !== sceneId || active.leashLifted) return false;
  active.leashLifted = true;
  return true;
}

/** Запросить сцену вручную: сюжетным шагом, отладкой или триггером события. */
export function requestFloorScene(id: string): boolean {
  if (active || playedScenes.has(id)) return false;
  if (!floorSceneById(id)) return false;
  return queueScene(id);
}

registerWorldEventObserver((_state, event) => {
  // Занятый первый слот — не повод терять событие: пока свободен второй, оно
  // ложится туда. Прежний выход на `active || pendingSceneId` выбрасывал такое
  // событие молча, и взять его снова было неоткуда — шина событий не повторяет
  // прошлое. Стреляло бы это ровно тогда, когда событийных сцен станет больше
  // одной на прогон.
  if (pendingSceneId && deferredSceneId) return;
  for (const scene of scenes) {
    if (scene.trigger.kind !== 'event') continue;
    if (playedScenes.has(scene.id)) continue;
    if (scene.trigger.eventType !== event.type) continue;
    if (scene.trigger.tag && !event.tags?.includes(scene.trigger.tag)) continue;
    if (queueScene(scene.id)) return;
  }
});

registerContentRuntimeHook({
  id: 'floor_scenes',
  phases: ['floor_activity'],
  update: ctx => updateFloorScenes(ctx),
});

function updateFloorScenes(ctx: ContentRuntimeContext): boolean {
  // Уходящие к лифту переживают свою сцену: их ведут и после того, как кадр
  // вернулся к игроку, иначе «ушёл» снова означало бы «исчез».
  updateSceneErrands(ctx);
  if (!sceneCamera) return false;
  if (active) return advanceScene(ctx, active);

  const floorKey = currentAlifeFloorKey(ctx.state);

  // Запрос ждёт своего этажа. Снимать его на чужом значило бы терять и сам
  // запрос, и — вместе с засчитанным визитом — пролог этажа, куда приехали.
  // Отыгранный или неизвестный запрос снимается, и на его место сразу встаёт
  // отложенный: иначе второе событие ждало бы вечно за мёртвым первым. Цикл
  // ограничен двумя слотами — `shiftPendingScene` обнуляет второй.
  while (pendingSceneId && (!floorSceneById(pendingSceneId) || playedScenes.has(pendingSceneId))) {
    shiftPendingScene();
  }
  if (deferredSceneId && (!floorSceneById(deferredSceneId) || playedScenes.has(deferredSceneId))) {
    deferredSceneId = null;
  }

  // Своего этажа ждёт КАЖДЫЙ слот сам по себе: первый может ждать министерства,
  // пока игрок стоит на аду, где ждёт второй. Порядок слотов — приоритет, а не
  // очередь на исполнение, иначе отложенный запрос запирался бы первым.
  const pending = [pendingSceneId, deferredSceneId]
    .map(id => (id ? floorSceneById(id) : undefined))
    .find(scene => scene?.floorKey === floorKey);

  const candidate = pending
    ?? (!visitedFloorKeys.has(floorKey)
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
  if (candidate === pending) {
    if (candidate.id === pendingSceneId) shiftPendingScene();
    else deferredSceneId = null;
  }
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
  // Расчистка идёт ДО расстановки: иначе каст встаёт вперемешку с теми, кого
  // сцена сейчас отсюда уберёт, и половина мест на площадке уже занята.
  if (def.clearRadius !== undefined) clearSceneStage(ctx, anchorX, anchorY, def.clearRadius, occupied);
  for (const actor of def.actors) {
    if (actor.deferred) continue;
    cast.set(actor.role, castActor(ctx, def, actor, anchorX, anchorY, occupied));
  }
  rebuildEntityIndexAfterSpawnCleanup(ctx.entities);
  for (const actor of def.actors) bindCastToStage(ctx, def, anchor.id, actor, cast.get(actor.role) ?? []);

  active = {
    def, anchorX, anchorY, cast,
    beatIndex: 0, beatTime: 0, beatStarted: false, elapsed: 0, returning: -1,
    occupied, anchorRoomId: anchor.id, leashLifted: false, leashLiftApplied: false,
  };
  if (playedScenes.size < MAX_PLAYED_SCENES) playedScenes.add(def.id);
  ctx.state.sceneLock = true;
  sceneFrameReleased = false;
  sceneReleaseArmed = false;

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

/**
 * Убрать посторонних с места действия. Разбор — в `FloorSceneDef.clearRadius`.
 *
 * Один запрос к индексу на подъёме сцены, без единого прохода по кадрам:
 * расчистка — это часть расстановки, а не система.
 */
function clearSceneStage(
  ctx: ContentRuntimeContext,
  anchorX: number,
  anchorY: number,
  radius: number,
  occupied: Set<number>,
): void {
  const found: Entity[] = [];
  ensureEntityIndex(ctx.entities).queryRadius(anchorX, anchorY, radius, found, ENTITY_MASK_ACTOR);
  let index = 0;
  for (const entity of found) {
    if (!entity.alive || entity.cinematicState !== undefined || isPlayerEntity(entity)) continue;
    /* Наружу — по своему же азимуту: человек отходит с площадки по кратчайшей,
     * а не сгоняется в одну кучу с противоположного края. Клетка ищется тем же
     * поиском и с тем же учётом занятого, что у каста, поэтому в стену и в
     * соседа никто не встанет. Места не нашлось — человек остаётся где стоял:
     * лучше лишний в кадре, чем актёр в бетоне. */
    const dx = ctx.world.delta(entity.x, anchorX);
    const dy = ctx.world.delta(entity.y, anchorY);
    const away = Math.hypot(dx, dy) || 1;
    const out = radius + 2;
    const spot = freeSpotNear(
      ctx.world,
      anchorX - (dx / away) * out,
      anchorY - (dy / away) * out,
      out - radius + 2,
      index++,
      occupied,
    );
    if (!spot) continue;
    entity.x = spot.x;
    entity.y = spot.y;
  }
}

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
    /* Говорящий ставится по СВОБОДНОЙ клетке, как и массовка.
     *
     * Здесь стоял сырой `anchor + offset` без единой проверки: массовка идёт
     * через `actorSpot` → `freeSpotNear` и в стену не попадает, а именно актёр
     * с репликами — попадал. Комната-якорь переменного размера, в центре комнат
     * стоит обстановка, и промах означал говорящего в бетоне: пост держит его
     * там, выйти он не может, а орбита камеры вокруг
     * говорящего упирается в стену. `cutscene.md` §8 обещает обратное дословно —
     * «никто не окажется в стене или внутри соседа», — и для `packageId` это
     * было неправдой. Клетка помечается занятой: иначе следующий актёр встанет
     * в того же. */
    const spot = freeSpotNear(ctx.world, x, y, 2, 0, occupied) ?? navigableNear(ctx.world, x, y);
    const px = spot?.x ?? x;
    const py = spot?.y ?? y;
    occupied.add(ctx.world.idx(Math.floor(px), Math.floor(py)));
    extractNpcForScene(ctx.entities, existing.id, def.id, px, py);
    return [existing.id];
  }

  const count = Math.max(0, actor.count ?? 0);
  if (count === 0) return [];
  if (actor.monster !== undefined) return spawnSceneMonsters(ctx, def, actor, x, y, count, occupied);
  return actor.source === 'alife'
    ? materializeFromAlife(ctx, def, actor, x, y, count, occupied)
    : spawnSceneCrowd(ctx, def, actor, x, y, count, occupied);
}

/**
 * Привязать поставленный каст к его месту.
 *
 * ПОСТ — ЭТО МЕСТО, А НЕ НИТЬ, и разница здесь не в длине поводка, а в том,
 * спорит сцена с волей актёра или снимает вопрос. Нить правила ТЕЛО и оставляла
 * желание нетронутым: человек, чьё утилити выбрало цель за двадцать клеток, шёл
 * к ней, на радиусе получал приказ домой, доходил до клетки поста — приказ по
 * своему закону гас (`goto_order.ts`, «приказ конечен»), — и то же желание вело
 * его наружу снова. Замерено на прологе (сид 61061,
 * `tmp/prologue_jitter_probe.ts`): предельный цикл периодом ровно секунда и
 * амплитудой в клетку, полсотни человек шли КАЖДЫЙ кадр и за двадцать пять
 * секунд наматывали по 57 клеток при смещении в одну. Со стороны — дрожь строя.
 * У отпущенных та же нить давала ту же дрожь на своём радиусе, только злее:
 * ноги шли на работу, нить тянула к якорю, оба шага случались в одном кадре, и
 * человек стоял на месте, дрожа тринадцать раз в секунду.
 *
 * Поводок места (`room_leash.ts`) держит за другое: он не пускает НАЗНАЧИТЬ
 * дорогу наружу. Спорить становится не о чем — маршрута наружу просто не
 * существует, — а человек остаётся живым: ходит, говорит, отвечает на удар. Тот
 * же шов, что у авторских постов Ольги и Баринова.
 *
 * Форму выбирает сама расстановка, и своего решения у проигрывателя тут нет:
 *
 *   `post` объявлен      → круг этого радиуса вокруг места в строю;
 *   пост внутри якоря    → комната-якоря: человек живёт в зале;
 *   пост снаружи якоря   → круг `SCENE_POST_LEASH` (кольцевые волны, роли за
 *                          краем зала — комнатой их не выразить).
 *
 * Объявленный `post` содержателен: на арене Базы дуэлянты стоят по краям песка
 * с зазором, выведенным из длины арматуры, а зал их обоих пускает друг к другу,
 * и размен начинался бы до сигнала.
 *
 * Срок — потолок самой сцены (игровая минута идёт за реальную секунду), и это
 * страховка, а не механизм: привязку снимают `release` (ставя взамен поводок
 * места действия), поручение, конец сцены и обрыв.
 */
function bindCastToStage(
  ctx: ContentRuntimeContext,
  def: FloorSceneDef,
  anchorRoomId: number,
  actor: SceneActorDef,
  ids: number[],
): void {
  if (!ids.length) return;
  const until = ctx.state.clock.totalMinutes + def.maxSeconds;
  const byId = ensureEntityIndex(ctx.entities).byId;
  for (const id of ids) {
    const entity = byId.get(id);
    const post = entity?.cinematicState;
    if (!entity || !post) continue;
    const cell = ctx.world.idx(Math.floor(post.postX), Math.floor(post.postY));
    if (actor.post === undefined && ctx.world.roomMap[cell] === anchorRoomId && anchorRoomId >= 0) {
      bindActorToRoom(entity, anchorRoomId, until);
      continue;
    }
    bindActorToSpot(entity, post.postX, post.postY, actor.post ?? SCENE_POST_LEASH, until);
  }
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
  const groups = clusterCenters(x, y, spread, actor.clusters, slots);
  const ids: number[] = [];

  for (let i = 0; i < slots; i++) {
    const spot = actorSpot(ctx.world, actor, groups, x, y, i, occupied);
    if (!spot) continue;
    const rpg = randomRPG(actor.level ?? 1);
    const maxHp = getMaxHp(rpg);
    const named = randomName(faction);
    const loadout = generateNpcLoadout(faction, rpg.level, 3, rng(), [rng(), rng()]);
    /* Объявленное оружие вытесняет выпавшее — и в слоте, и в карманах: с трупа
     * обязано упасть то, чем он дрался, а не то, что ему выкатил профиль
     * фракции. Пси-инструмент при этом остаётся: он в другой руке и в другом
     * слоте, и отнимать его сцене незачем. */
    const rolled = loadout.inventory ?? [];
    const inventory = actor.weapon === undefined
      ? rolled
      : [...rolled.filter(item => item.defId !== loadout.weapon), { defId: actor.weapon, count: 1 }];
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
      inventory,
      weapon: actor.weapon ?? loadout.weapon,
      tool: loadout.tool,
      faction,
      occupation,
      questId: -1,
      rpg,
      role: NpcRole.CINEMATIC_ACTOR,
      cinematicState: { originalRole: NpcRole.WANDERER, postX: spot.x, postY: spot.y, sceneId: def.id },
    } as Entity;
    ctx.entities.push(entity);
    ids.push(entity.id);
  }
  return ids;
}

/**
 * Твари в кадре. Собираются из общего реестра `MONSTERS` теми же слагаемыми, что
 * и население этажа: определение вида даёт скорость, здоровье и спрайт, уровень —
 * разброс статов. Своего поведения у них нет и быть не должно — отпущенный тактом
 * `release` монстр дерётся ровно как любой другой на этаже.
 */
function spawnSceneMonsters(
  ctx: ContentRuntimeContext,
  def: FloorSceneDef,
  actor: SceneActorDef,
  x: number,
  y: number,
  count: number,
  occupied: Set<number>,
): number[] {
  const kind = actor.monster!;
  const monsterDef = MONSTERS[kind];
  if (!monsterDef) return [];
  const slots = entitySpawnSlots(ctx.entities, EntityType.MONSTER, count);
  const groups = clusterCenters(x, y, actor.spread ?? 3, actor.clusters, slots);
  const ids: number[] = [];

  for (let i = 0; i < slots; i++) {
    const spot = actorSpot(ctx.world, actor, groups, x, y, i, occupied);
    if (!spot) continue;
    const rpg = randomRPG(actor.level ?? 1);
    const hp = Math.round(monsterDef.hp * (0.75 + rpg.level * 0.13));
    const entity: Entity = {
      id: ctx.nextEntityId.v++,
      type: EntityType.MONSTER,
      x: spot.x,
      y: spot.y,
      angle: rng() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: monsterDef.speed,
      sprite: monsterSpr(kind),
      hp,
      maxHp: hp,
      monsterKind: kind,
      attackCd: 0,
      // Цель ведёт стаю к центру сцены: без неё первый кадр расходится веером.
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
      rpg,
      role: NpcRole.CINEMATIC_ACTOR,
      cinematicState: { originalRole: NpcRole.WANDERER, postX: spot.x, postY: spot.y, sceneId: def.id },
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
  const groups = clusterCenters(x, y, spread, actor.clusters, count);

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
      const spot = actorSpot(ctx.world, actor, groups, x, y, ids.length, occupied)
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
        postX: entity.x,
        postY: entity.y,
        sceneId: def.id,
      };
      ids.push(entity.id);
    }
  }
  return ids;
}

/**
 * Центры кучек. Ровная спираль от одной точки ставит людей подряд с одинаковым
 * шагом — это читается как строй по линейке, а не как собравшаяся толпа. Поэтому
 * массовка сперва делится на группы со своими смещёнными центрами.
 *
 * Число групп выводится из плотности: кучка занимает примерно свой разброс, и
 * отдельной ручки на это не нужно — авторский `clusters` только для случаев,
 * когда строй нужен именно ровный (`clusters: 1`).
 */
function clusterCenters(
  x: number,
  y: number,
  spread: number,
  clusters: number | undefined,
  count: number,
): { x: number; y: number }[] {
  const groups = Math.max(1, clusters ?? Math.round(count / Math.max(2, spread)));
  const centers: { x: number; y: number }[] = [];
  for (let g = 0; g < groups; g++) {
    // И угол, и вынос кучки — из RNG прогона, а не равным шагом: равный шаг
    // вернул бы ту же линейку, только из групп.
    const angle = rng() * Math.PI * 2;
    const radius = spread * (0.35 + rng() * 0.65);
    centers.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius });
  }
  return centers;
}

/**
 * Место одного участника. Две раскладки, и выбор между ними — целиком в объявлении:
 * с `ring` — кольцо на радиусе, иначе кучки вокруг точки.
 */
/** Сколько азимутов пробовать, ища связное место на кольце. */
const RING_ANGLE_ATTEMPTS = 8;
/** Докуда искать ходибельную опору вокруг точки. */
const NAVIGABLE_REFERENCE_REACH = 3;
const NAVIGABLE_PROBE_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Ближайшая клетка, по которой действительно ХОДЯТ. «Не стена» этого не значит:
 * клетку занимает обстановка, и дерево путей её не берёт. Проверяется тем же
 * деревом — есть ли шаг до соседа.
 */
function navigableNear(world: World, x: number, y: number): { x: number; y: number } | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let radius = 0; radius <= NAVIGABLE_REFERENCE_REACH; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const px = world.wrap(cx + dx);
        const py = world.wrap(cy + dy);
        for (const [ox, oy] of NAVIGABLE_PROBE_STEPS) {
          if (bfsPath(world, px, py, world.wrap(px + ox), world.wrap(py + oy)).length) {
            return { x: px, y: py };
          }
        }
      }
    }
  }
  return null;
}

function actorSpot(
  world: World,
  actor: SceneActorDef,
  groups: readonly { x: number; y: number }[],
  x: number,
  y: number,
  index: number,
  occupied: Set<number>,
): { x: number; y: number } | null {
  const spread = actor.spread ?? 2;
  if (actor.ring !== undefined) return ringSpot(world, x, y, actor.ring, spread, index, occupied);
  const center = groups[Math.floor(rng() * groups.length)] ?? { x, y };
  const tight = Math.max(1, Math.round(spread / 3));
  return freeSpotNear(world, center.x, center.y, tight, index, occupied)
    ?? freeSpotNear(world, x, y, spread, index, occupied);
}

/**
 * Место на кольце: случайный азимут и радиус около заданного, дальше обычный поиск
 * свободной клетки рядом. Радиус НЕ подгоняется под геометрию — не нашлось места
 * на этом азимуте, значит с этой стороны никто и не придёт. Это честнее, чем
 * стягивать наплыв к центру: кольцо на то и кольцо, что окружает.
 *
 * Место обязано быть СВЯЗАНО с центром. Свободная клетка ещё не значит достижимая:
 * этаж полон замурованных карманов, и посаженный в такой монстр не придёт ни к
 * кому и ни от кого не погибнет. Сцена, ждущая его смерти, тогда висит до
 * таймаута — так первая волна форпоста и не добивалась.
 */
function ringSpot(
  world: World,
  x: number,
  y: number,
  ring: number,
  spread: number,
  index: number,
  occupied: Set<number>,
): { x: number; y: number } | null {
  // Мерить связность НАПРЯМУЮ до центра нельзя: там обычно стоит обстановка —
  // у форпоста ровно в центре лампа, и путей до неё нет ни у кого, включая самого
  // майора. Опорой берётся ближайшая ХОДИБЕЛЬНАЯ клетка.
  const reference = navigableNear(world, x, y);
  let fallback: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < RING_ANGLE_ATTEMPTS; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.max(1, ring * (0.75 + rng() * 0.5));
    const spot = freeSpotNear(
      world,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      Math.max(2, spread),
      index,
      occupied,
    );
    if (!spot) continue;
    fallback = fallback ?? spot;
    if (!reference) return spot;
    if (bfsPath(world, Math.floor(spot.x), Math.floor(spot.y), reference.x, reference.y).length) return spot;
  }
  // Ни один азимут не дал связного места. Ставим куда нашлось: пустое кольцо
  // читается хуже, чем один невезучий, застрявший в кармане.
  return fallback;
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
  const camera = sceneOwnedCamera();

  // Такты кончились (или вышло время) — камера ЛЕТИТ обратно к игроку и только
  // потом отдаёт ему управление. Раньше здесь просто переключался режим, и
  // возвращение читалось как телепорт.
  if (scene.returning >= 0) {
    scene.returning += ctx.dt;
    if (camera) aimCinematicCamera(camera, { lookAt: null, orbit: null, hold: true });
    // Отпущенному кадру возвращаться некуда: камера у игрока с той секунды, как
    // он её забрал, и ждать её прилёта значило бы держать сцену до таймаута.
    if (!camera || scene.returning >= SCENE_RETURN_TIMEOUT_S || cinematicCameraArrived(camera)) {
      endScene(ctx, scene);
      return true;
    }
    return false;
  }
  if (scene.elapsed >= scene.def.maxSeconds || scene.beatIndex >= scene.def.beats.length) {
    scene.returning = 0;
    if (!camera) return false;
    // Домой кадр летит тоже по курсу: возврат, снятый задом наперёд с игроком в
    // прицеле, читается как утаскивание, а не как возвращение.
    aimCinematicCamera(camera, {
      lookAt: null,
      orbit: null,
      height: CAMERA_STANDING_HEIGHT,
      flySpeed: SCENE_RETURN_FLY_SPEED,
      hold: true,
    });
    routeCinematicCamera(camera, ctx.world, ctx.player.x, ctx.player.y);
    return false;
  }

  applyLiftedLeash(ctx, scene);

  const beat = scene.def.beats[scene.beatIndex];
  if (!scene.beatStarted) {
    scene.beatStarted = true;
    scene.beatTime = beatDuration(beat);
    enterBeat(ctx, scene, beat);
  }

  // Точка внимания ЖИВАЯ: она пересчитывается каждый кадр, пока такт идёт.
  // Взятая один раз, она остаётся там, где человек стоял в начале, — а он с тех
  // пор дерётся, отходит и уносит с собой свой бабл за край кадра.
  trackBeatFocus(ctx, scene);

  scene.beatTime -= ctx.dt;
  if (!beatFinished(ctx, scene, beat)) return false;

  scene.beatIndex++;
  scene.beatStarted = false;
  return false;
}

/**
 * Снять поводок места действия, когда сцена объявила дело конченым.
 *
 * Верёвку поднимает ПАКЕТ ЭТАЖА (`liftSceneLeash`), а снимает её отсюда
 * проигрыватель — один раз, а не каждый кадр: привязка живёт в поводке места
 * (`room_leash.ts`), и снимать её повторно нечего.
 *
 * Стоящих на посту это не касается: пост живёт до конца сцены.
 */
function applyLiftedLeash(ctx: ContentRuntimeContext, scene: ActiveScene): void {
  if (!scene.leashLifted || scene.leashLiftApplied) return;
  scene.leashLiftApplied = true;
  const byId = ensureEntityIndex(ctx.entities).byId;
  for (const ids of scene.cast.values()) {
    for (const id of ids) {
      const entity = byId.get(id);
      // На посту — не трогаем: верёвка места действия принадлежит отпущенным.
      if (entity && entity.cinematicState === undefined) releaseActorFromRoom(entity);
    }
  }
}

/** Снять поводок со всего каста: сцена кончилась или оборвана. */
function unleashWholeCast(entities: Entity[], scene: ActiveScene): void {
  const byId = ensureEntityIndex(entities).byId;
  for (const ids of scene.cast.values()) {
    for (const id of ids) {
      const entity = byId.get(id);
      if (entity) releaseActorFromRoom(entity);
    }
  }
}

/**
 * Держать кадр на движущемся субъекте — КАЖДЫЙ КАДР И НА ЛЮБОМ ТАКТЕ.
 *
 * Слежение раньше жило только в тактах камеры, а реплика, пауза и ожидание смерти
 * длятся секундами: за фразу человек уходит на несколько клеток, и кадр смотрел
 * туда, где он стоял в начале.
 *
 * Правится только ВЗГЛЯД: ни маршрут, ни радиус облёта, ни фаза не трогаются —
 * иначе каждый кадр начинал бы круг заново.
 */
function trackBeatFocus(ctx: ContentRuntimeContext, scene: ActiveScene): void {
  const camera = sceneOwnedCamera();
  if (!camera || !scene.focus) return;
  aimCinematicCamera(camera, { lookAt: resolveSpot(ctx, scene, scene.focus) });
}

function beatDuration(beat: SceneBeat): number {
  switch (beat.kind) {
    // Та же зависимость длительности от длины строки, что у обычных барков:
    // короткая фраза не должна висеть, длинная — не должна не дочитываться.
    case 'say': return beat.seconds ?? Math.min(6, Math.max(2.5, beat.text.length * 0.12));
    case 'pause': return beat.seconds;
    case 'orbit': return beat.seconds;
    case 'moveTo': return beat.wait ?? 0;
    case 'awaitDeath': return beat.timeout;
    case 'fly': return beat.wait === false ? 0 : Number.POSITIVE_INFINITY;
    default: return 0;
  }
}

function beatFinished(ctx: ContentRuntimeContext, scene: ActiveScene, beat: SceneBeat): boolean {
  if (beat.kind === 'fly' && beat.wait !== false) {
    // Отпущенный кадр никуда не летит, и ждать его прилёта нечем: такт закрывается
    // сразу, чтобы сцена дошла до своего конца, а не повисла до потолка.
    const camera = sceneOwnedCamera();
    return !camera || cinematicCameraArrived(camera);
  }
  if (beat.kind === 'awaitDeath') {
    return scene.beatTime <= 0 || roleIsGone(ctx, scene, beat.role);
  }
  return scene.beatTime <= 0;
}

function enterBeat(ctx: ContentRuntimeContext, scene: ActiveScene, beat: SceneBeat): void {
  switch (beat.kind) {
    case 'fly': {
      const camera = sceneOwnedCamera();
      if (!camera) return;
      const to = resolveSpot(ctx, scene, beat.to);
      routeCinematicCamera(camera, ctx.world, to.x, to.y);
      // Точка внимания живёт до следующего такта камеры: за кем начали следить,
      // за тем и следим, пока кадр не переведут.
      scene.focus = beat.look;
      aimCinematicCamera(camera, {
        lookAt: beat.look ? resolveSpot(ctx, scene, beat.look) : null,
        orbit: null,
        height: beat.height,
        flySpeed: beat.speed,
        hold: true,
      });
      return;
    }
    case 'orbit': {
      const camera = sceneOwnedCamera();
      if (!camera) return;
      scene.focus = beat.around;
      const around = resolveSpot(ctx, scene, beat.around);
      aimCinematicCamera(camera, {
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
      scene.lastSpeakerId = speaker.id;
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
      const ids = castActor(ctx, scene.def, actor, scene.anchorX, scene.anchorY, scene.occupied);
      scene.cast.set(beat.role, [...(scene.cast.get(beat.role) ?? []), ...ids]);
      rebuildEntityIndexAfterSpawnCleanup(ctx.entities);
      bindCastToStage(ctx, scene.def, scene.anchorRoomId, actor, ids);
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
    case 'walkOut': {
      sendRolesOnErrand(ctx, scene, beat.roles, liftErrandTarget, beat.toFloorKey);
      return;
    }
    case 'moveTo': {
      const spot = resolveSpot(ctx, scene, beat.to);
      // Цель приземляется на ХОДИБЕЛЬНУЮ клетку. Центр комнаты обычно занят
      // обстановкой — у форпоста там лампа, на которой стоит сам майор, — и
      // приказ идти в неё AI выполнить не может: человек мечется рядом и уходит.
      const walkable = navigableNear(ctx.world, spot.x, spot.y) ?? { x: spot.x, y: spot.y };
      const target = { x: walkable.x + 0.5, y: walkable.y + 0.5 };
      sendRolesOnErrand(ctx, scene, beat.roles, () => target);
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
      if (entity.alifeId !== undefined) {
        /* Смена стороны — постоянный факт, а не поза на время кадра. Записать её
         * одной обратной дорогой (запись ← сущность) мало: тело авторской
         * личности рождается из анкеты пакета ЗАНОВО на каждой генерации этажа,
         * и перебежчик возвращался бы своим при первом же выходе с этажа. Факт
         * кладётся событийным оверрайдом A-Life, который анкету перебивает и
         * уезжает в сейв. Массовке сцены переживать нечего: у созданных сценой
         * людей нет личности, и `alifeId` у них не бывает. */
        setAlifeNpcFactionOverride(ctx.state, entity.alifeId, faction);
        rewriteAlifeNpcIdentityFromEntity(ctx.state, entity);
      }
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
  for (const role of roles ?? [...scene.cast.keys()]) {
    for (const entity of entitiesOfRole(ctx, scene, role)) {
      releaseNpcFromScene(ctx.entities, entity.id);
      stageWallFor(ctx, scene, role, entity);
    }
  }
  // Кого сцена держала помимо каста (доставленный `packageId`, чья роль уже
  // снята) — тому роль снимает общий проход: он идёт по `cinematicState`.
  if (!roles) releaseAllSceneActors(ctx.entities, scene.def.id);
}

/**
 * Поводок МЕСТА ДЕЙСТВИЯ отпущенному: тем же кругом, что и пост.
 *
 * Пост снят — своего места у человека больше нет, но кадр ещё идёт, и
 * разбежавшийся по этажу каст оставил бы сцену без людей. Радиус берётся у роли
 * (`leash`) либо у сцены (`FloorSceneDef.leash`); не объявлен ни там, ни там —
 * человек свободен совсем.
 *
 * Круг, а не нить, ровно по той же причине, что и на посту: нить спорит с волей
 * каждый кадр и оставляет человека дрожать на радиусе. Целей, памяти об ударе и
 * скана поводок при этом не трогает вовсе — бой отпущенного не его дело.
 */
function stageWallFor(
  ctx: ContentRuntimeContext, scene: ActiveScene, role: string, entity: Entity,
): void {
  const radius = scene.def.actors.find(actor => actor.role === role)?.leash ?? scene.def.leash;
  if (radius === undefined || scene.leashLifted) {
    releaseActorFromRoom(entity);
    return;
  }
  bindActorToSpot(
    entity, scene.anchorX, scene.anchorY, radius,
    ctx.state.clock.totalMinutes + scene.def.maxSeconds,
  );
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

/* ── Поручения актёрам ───────────────────────────────────────────
 *
 * Одно и то же дело у двух тактов: `moveTo` ведёт человека в точку зала, `walkOut`
 * — к лифту и дальше с этажа. Разница ровно в одном поле: назван ли этаж, куда
 * уезжать. Всё прочее общее — снять поводок сцены, задать цель `GOTO`, возвращать
 * её каждый кадр, потому что бой и нужды курс сбивают.
 *
 * Список переживает сцену (кадр закрылся, а ноги идут), поэтому ограничен. */
const MAX_SCENE_ERRANDS = 32;
/**
 * Выдержка ПОСЛЕ конца сцены. Обратный пролёт камеры длится до
 * `SCENE_RETURN_TIMEOUT_S`, но снимать людей с этажа в кадре нельзя и на нём:
 * зритель видит, как они пропадают. Отсчёт начинается, когда сцена уже закрыта и
 * управление у игрока, поэтому выдержке хватает нескольких секунд.
 */
const SCENE_WALK_OUT_GRACE_S = 6;
/**
 * Поводок стоящего на посту. Короткий: строй обязан читаться строем, а не
 * толпой. Актёр при этом жив — переминается, огрызается, отвечает на удар, —
 * просто не уходит с места.
 */
const SCENE_POST_LEASH = 1.5;

interface SceneErrand {
  entityId: number;
  ax: number;
  ay: number;
  /** Куда уезжать. Список ведёт ТОЛЬКО уходящих: дойти до точки — вейпойнт, а не поручение. */
  toFloorKey: string;
  /** Когда снимать с этажа. Ставится по концу сцены, до неё — не определено. */
  leaveAt?: number;
}

/* Состояние прогона, не сейва: id сущностей после загрузки чужие, и вести по ним
 * некого. Загрузка список чистит, недоведённые просто остаются жить на этаже. */
const errands: SceneErrand[] = [];

/**
 * Ближайший лифт как цель поручения. Нет лифта — нет и ухода: человек просто
 * остаётся жить на этаже. Якорь прибытия тут не годится, он откатывается на
 * соседнюю клетку, и «ушёл» снова стало бы «исчез через шаг».
 */
function liftErrandTarget(
  ctx: ContentRuntimeContext,
  entity: Entity,
): { x: number; y: number } | null {
  return findLiftDepartureAnchor(ctx.world, entity.x, entity.y, entity.id);
}

/**
 * Отправить роли по делу. Роль сцены снимается сразу: не потому, что она
 * выключает AI — цикл AI актёра прогоняет, — а потому, что пока роль на нём,
 * поводок поста возвращает его в строй каждым кадром и до цели поручения он не
 * дойдёт никогда.
 */
function sendRolesOnErrand(
  ctx: ContentRuntimeContext,
  scene: ActiveScene,
  roles: readonly string[],
  target: (ctx: ContentRuntimeContext, entity: Entity) => { x: number; y: number } | null,
  toFloorKey?: string,
): void {
  for (const role of roles) {
    for (const entity of entitiesOfRole(ctx, scene, role)) {
      if (isPlayerEntity(entity)) continue;
      if (errands.length >= MAX_SCENE_ERRANDS) return;
      const spot = target(ctx, entity);
      if (!spot) continue;
      releaseNpcFromScene(ctx.entities, entity.id);
      aimAtSpot(entity, spot.x, spot.y);
      // Без этажа назначения это ВЕЙПОЙНТ: цель поставлена, и человек свободен.
      // Вести его дальше значило бы держать на точке — дойдя, он утыкался бы в
      // неё и стоял, вместо того чтобы жить дальше. Ведут только уходящих с
      // этажа: тем дойти обязательно, иначе они не уедут никогда.
      if (toFloorKey === undefined) continue;
      const existing = errands.find(item => item.entityId === entity.id);
      if (existing) {
        // Новое поручение отменяет прежнее: последнее слово за сценой.
        existing.ax = spot.x;
        existing.ay = spot.y;
        existing.toFloorKey = toFloorKey;
        existing.leaveAt = undefined;
        continue;
      }
      errands.push({ entityId: entity.id, toFloorKey, ax: spot.x, ay: spot.y });
    }
  }
}

/**
 * Отдать приказ «иди в точку» ЯВНЫМ входом в канал (`setActorOrder`), а не
 * сырой записью курса. Исполняет приказ `tickGotoOrder` (`ai/goto_order.ts`) —
 * там же разбор канала и замер.
 *
 * Сырая запись здесь была не равнозначна явной: усыновление сырого курса
 * работает строго «когда записи ещё нет», иначе бегство твари подменяло бы
 * приказ. Из-за этого сцена не могла ПЕРЕНАЦЕЛИТЬ занятого актёра: и такт
 * `moveTo`, и `walkOut`, и возврат по поводку писали новую точку в пустоту, а
 * человек продолжал идти по первому адресу. Замерено
 * (`tmp/order_retarget_probe.ts`): актёр под приказом, которому на двадцатом
 * кадре дали новую точку, сырой записью уходил на СТАРУЮ (кадр 75) и на новой
 * не оказывался ни разу за 400 кадров; явной — приходил на новую (кадр 141).
 *
 * Сцена — последнее слово: у неё приказ всегда НОВЫЙ вместо старого, потому
 * что и такт, и поводок выражают волю самой сцены, а не подсказку.
 *
 * Маршрут ОБНУЛЯЕТСЯ: приказ отменяет прежнюю дорогу, а новую строит уже
 * исполнитель. Поэтому звать это каждый кадр нельзя — человеку, которому
 * стирают маршрут шестьдесят раз в секунду, шага не сделать.
 */
function aimAtSpot(entity: Entity, ax: number, ay: number): void {
  entity.isTraveler = true;
  entity.ai = entity.ai ?? { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 };
  setActorOrder(entity, ax, ay);
}

/**
 * Довести поручения. Ноги идут сразу, а с этажа человек снимается только если
 * поручение было про уход, сцена уже закрыта и выдержка после неё вышла:
 * состояние складывается в A-Life, запись переезжает, сущность выходит из
 * массива. Раньше уход считался по приходу к лифту, и на длинном обратном пролёте
 * камеры Стрелок успевал дойти и пропасть ещё в кадре.
 */
function updateSceneErrands(ctx: ContentRuntimeContext): void {
  if (!errands.length) return;
  let removed = false;
  // Ведомого берём из индекса, а не перебором массива на каждого и каждый кадр.
  // Место в массиве считается один раз и только на самом снятии с этажа.
  const byId = ensureEntityIndex(ctx.entities).byId;
  for (let i = errands.length - 1; i >= 0; i--) {
    const item = errands[i];
    const entity = byId.get(item.entityId);
    if (!entity || !entity.alive) {
      errands.splice(i, 1);
      continue;
    }
    /* Бой и нужды сбивают курс: пока ведём — ВОЗВРАЩАЕМ прежнюю цель, а не
     * ставим новую. Отсюда и условие «курса в точку нет вовсе»: перенацеливать
     * ведомого вправе только сама сцена, и делает она это `sendRolesOnErrand`,
     * который и точку поручения перепишет, и приказ отдаст. Стоящий приказ в
     * другое место эта строка поэтому не трогает: иначе поручение спорило бы
     * тут каждый кадр с чужой волей и всегда побеждало. */
    if (entity.ai && entity.ai.goal !== AIGoal.GOTO) aimAtSpot(entity, item.ax, item.ay);

    if (active) {
      // Сцена ещё идёт: отсчёт не начат, и снять с этажа некого.
      item.leaveAt = undefined;
      continue;
    }
    if (item.leaveAt === undefined) item.leaveAt = ctx.state.time + SCENE_WALK_OUT_GRACE_S;
    // Выдержка одна на всех и не сокращается приходом к лифту: дошёл он или нет,
    // пропасть он вправе только вдалеке от вернувшегося кадра.
    if (ctx.state.time < item.leaveAt) continue;

    captureAlifeFloorState(ctx.state, [entity]);
    if (entity.alifeId !== undefined) moveAlifeNpcRecord(ctx.state, entity.alifeId, item.toFloorKey);
    const index = ctx.entities.indexOf(entity);
    if (index >= 0) ctx.entities.splice(index, 1);
    errands.splice(i, 1);
    removed = true;
  }
  if (removed) rebuildEntityIndexAfterSpawnCleanup(ctx.entities);
}

function endScene(ctx: ContentRuntimeContext, scene: ActiveScene): void {
  unleashWholeCast(ctx.entities, scene);
  releaseAllSceneActors(ctx.entities, scene.def.id);
  ctx.state.sceneLock = false;
  const camera = sceneOwnedCamera();
  sceneFrameReleased = false;
  if (camera) camera.mode = 'player';
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
  // Уходящих ведут по id сущностей, а этаж, смерть и загрузка их обнуляют. Кого
  // не довели — тот остаётся на своём этаже обычным жильцом.
  errands.length = 0;
  if (state) state.sceneLock = false;
  const camera = sceneOwnedCamera();
  sceneFrameReleased = false;
  if (!scene) return;
  if (entities) {
    unleashWholeCast(entities, scene);
    releaseAllSceneActors(entities, scene.def.id);
  }
  if (camera) camera.mode = 'player';
}

/**
 * Игрок забирает кадр себе, не обрывая сцену.
 *
 * Сцена ЖИВЁТ дальше: актёры отыгрывают такты, говорят свои реплики и доводят
 * события до конца — просто уже без зрителя в первом ряду. Снимается ровно то,
 * что принадлежит зрителю: замок ввода, камера и вместе с замком неуязвимость
 * (`debug_cheats.ts` читает тот же `sceneLock`). Так и задумано: перехватить кадр
 * — решение игрока, и цена решения — своя шкура.
 *
 * Отдельного флага для ворот ввода не нужно и заводить нельзя: `sceneLock` УЖЕ
 * означает «кадр принадлежит сцене, а не игроку», и все его читатели —
 * игроко-обращённые.
 *
 * Зовут это КАЖДЫЙ КАДР сцены, и `requested` — просто «жмут ли сейчас»: взведение
 * тоже дело проигрывателя, а не входной точки. Вернувшееся `true` означает, что
 * кадр только что отдан, и нажатие пора съесть.
 */
export function releaseFloorSceneToPlayer(state: GameState, requested: boolean): boolean {
  if (!active || sceneFrameReleased) return false;
  if (!requested) {
    sceneReleaseArmed = true;
    return false;
  }
  if (!sceneReleaseArmed) return false;
  sceneFrameReleased = true;
  state.sceneLock = false;
  if (sceneCamera) sceneCamera.mode = 'player';
  return true;
}

/* ── Разрешение ссылок ───────────────────────────────────────── */

/**
 * Живые исполнители роли.
 *
 * Спрашивают это КАЖДЫЙ КАДР, пока идёт сцена: за фокусом камеры и за концом
 * такта `awaitDeath`. Раньше на каждый вопрос перебирался весь этаж, да ещё и
 * с `ids.includes` внутри — тысячи сущностей на горстку актёров. Теперь ходим
 * по составу роли, а сущность берём из индекса: он держит ровно живых, поэтому
 * промах — это и есть «не дожил».
 *
 * Порядок стал порядком СОСТАВА, а не массива сущностей. Наружу это видно
 * только в `firstLivingOfRole`, который и так выбирает случайного.
 */
function entitiesOfRole(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): Entity[] {
  const ids = scene.cast.get(role);
  if (!ids || !ids.length) return [];
  const byId = ensureEntityIndex(ctx.entities).byId;
  const found: Entity[] = [];
  for (const id of ids) {
    const entity = byId.get(id);
    if (entity && entity.alive) found.push(entity);
  }
  return found;
}

/**
 * Кто из роли скажет реплику. Живой и ПРОИЗВОЛЬНЫЙ, а не первый по списку.
 *
 * Реплику массовки даёт не назначенный боец, а тот, кто до неё дожил: в бою
 * назначенный погибает первым делом, и сцена лишалась голоса на ровном месте.
 * Для роли из одного человека выбор вырождается в него самого.
 */
function firstLivingOfRole(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): Entity | undefined {
  const alive = entitiesOfRole(ctx, scene, role);
  if (!alive.length) return undefined;
  return alive[Math.floor(rng() * alive.length)];
}

function roleIsGone(ctx: ContentRuntimeContext, scene: ActiveScene, role: string): boolean {
  return entitiesOfRole(ctx, scene, role).length === 0;
}

/** Центр масс роли: кадр держится за людей, а не за координату, которую они уже покинули. */
function resolveSpot(ctx: ContentRuntimeContext, scene: ActiveScene, spot: SceneSpot): { x: number; y: number } {
  if ('speaker' in spot) {
    // Кадр держится за говорившего каждый кадр такта — по индексу, не перебором.
    const speaker = scene.lastSpeakerId !== undefined
      ? ensureEntityIndex(ctx.entities).byId.get(scene.lastSpeakerId)
      : undefined;
    if (speaker?.alive) return { x: speaker.x, y: speaker.y };
    return { x: scene.anchorX, y: scene.anchorY };
  }
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
