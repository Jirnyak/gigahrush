/* ── Runtime camera controller ────────────────────────────────── */
/* Camera modes are visual runtime state. They resolve to a small
 * CameraView for render; they do not mutate gameplay ownership. */

import { Cell, W } from '../core/types';
import { PATH_BLOCKER_SUBDIV } from '../core/path_blockers';
import { World } from '../core/world';
import { bfsPath, subcellToWorld } from './ai/pathfinding.js';
import { cellCeilingHeight, SKY_TIER_THRESHOLD, cellCeilingTier } from '../world/ceiling_heights';
import { mathRng as rng } from '../core/rand';

export type CameraMode = 'player' | 'free' | 'death' | 'trailer' | 'cinematic';

export interface CameraSubject {
  x: number;
  y: number;
  angle: number;
  pitch?: number;
  alive?: boolean;
  height?: number;
}

export interface CameraPose {
  x: number;
  y: number;
  angle: number;
  pitch: number;
  height: number;
  fovRadians?: number;
}

export interface CameraView extends CameraPose {
  mode: CameraMode;
  fovRadians: number;
}

export interface CinematicCameraState {
  path: number[][];
  targetNodeIndex: number;
  active: boolean;
  time: number;
  angleTarget: number;
  /** Текущая скорость хода. К заданной подтягивается плавно, а не прыжком. */
  flySpeed: number;
  /**
   * Угловая скорость кадра, рад/с. Разворот — это не мгновенное «повернуть на
   * столько-то», а тело с инерцией: скорость сама разгоняется и сама гаснет.
   * Без неё панорама начиналась рывком с нуля до потолка в первом же кадре.
   */
  angleRate?: number;
  /** Текущий наклон. Отдельно от геометрического — тот прыгает при смене оси. */
  pitchNow?: number;
  /**
   * Скорость, которую попросил такт.
   *
   * Раньше её ставили напрямую в `flySpeed`, и переход от дальнего подлёта к
   * короткому кадру внутри зала (20 → 5) читался толчком: кадр тормозил за один
   * кадр. Теперь такт задаёт ЦЕЛЬ, а ход подходит к ней экспонентой.
   */
  flySpeedTarget?: number;
  /* Режиссёрские поля. Без них поведение прежнее: камера летит по курсу
   * взгляда и возвращается к игроку, исчерпав путь. */
  /** Точка внимания. Задана — камера смотрит на неё, а летит куда ведёт путь. */
  lookAtX?: number;
  lookAtY?: number;
  /** Облёт вокруг точки внимания. Позиция считается аналитически, путь не нужен. */
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitPhase?: number;
  /** Текущий радиус круга: подходит к `orbitRadius` плавно, чтобы вход не был прыжком. */
  orbitReach?: number;
  /** Где была точка внимания в прошлом кадре: по её сдвигу считается запас хода. */
  orbitTrackX?: number;
  orbitTrackY?: number;
  /** Целевая высота, к которой камера подходит плавно. */
  heightTarget?: number;
  /**
   * Текущая высота кадра. Отдельно от заданной, потому что высота назначалась
   * ПРЯМО: такт со своей высотой подбрасывал камеру за один кадр, и проезд вдоль
   * строя с 1.1 на 1.8 читался скачком, а не подъёмом.
   */
  heightNow?: number;
  /** Исчерпав путь, держать позу вместо возврата к игроку. Владелец сцены решает, когда отпустить. */
  hold?: boolean;
  /**
   * Дороги к цели нет — идём напрямую, не спрашивая преград. Взводится только
   * когда маршрут исчерпан мимо цели: пустой кадр хуже короткого сквозняка, а
   * телепорт хуже обоих.
   */
  forced?: boolean;
}

/** Режиссёрская настройка полёта. Пустой объект = прежнее поведение. */
export interface CinematicCameraAim {
  /** Точка внимания; `null` снимает её и возвращает взгляд по курсу. */
  lookAt?: { x: number; y: number } | null;
  /** Облёт вокруг точки внимания; `null` снимает облёт. */
  orbit?: { radius: number; speed: number; phase?: number } | null;
  height?: number;
  flySpeed?: number;
  hold?: boolean;
  /** Начальный угол камеры: сцена стартует со взгляда игрока, а не с нулевого. */
  angle?: number;
}

export interface RuntimeCamera {
  mode: CameraMode;
  free: CameraPose;
  bob: CameraBobState;
  /* Один пролёт на все режимы кадра. Трейлер — это тот же полёт по ломаной, ему
   * лишь дописывают маршрут, пока он летит; своей манеры двигаться у него нет. */
  cinematic?: CinematicCameraState;
}

export interface FreeCameraMove {
  forward?: number;
  strafe?: number;
  vertical?: number;
  turn?: number;
  pitch?: number;
  speed?: number;
  turnSpeed?: number;
  pitchSpeed?: number;
  collide?: boolean;
}

interface DeathCameraState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  height: number;
  fx: number;
  fy: number;
  fz: number;
  prevYaw: number;
  timer: number;
  active: boolean;
}

interface CameraBobState {
  phase: number;
  amount: number;
  offset: number;
  lastX: number;
  lastY: number;
  ready: boolean;
}

export const CAMERA_STANDING_HEIGHT = 0.5;
export const CAMERA_DEATH_FLOOR_HEIGHT = 0.12;

const DEFAULT_CAMERA_FOV_RADIANS = Math.PI / 2;
const CAMERA_BOB_STEP_RATE = 9.2;
const CAMERA_BOB_FULL_SPEED = 2.15;
const CAMERA_BOB_HEIGHT = 0.026;
const CAMERA_BOB_MIN_MOVE = 0.001;
const CAMERA_BOB_TELEPORT_DIST = 1.5;
const CAMERA_BOB_RISE = 8.5;
const CAMERA_BOB_FALL = 6;
const CAMERA_BOB_OFFSET_RATE = 16;
const FREE_CAMERA_SPEED = 5.0;
const FREE_CAMERA_TURN_SPEED = 2.5;
const FREE_CAMERA_PITCH_SPEED = 1.6;
const FREE_CAMERA_MIN_HEIGHT = 0.08;
const FREE_CAMERA_MAX_HEIGHT = 8.0;
/* Общий почерк пролёта: трейлер и сцена летят и дышат одинаково. */
const CINEMATIC_FLY_SPEED = 4.0;
/**
 * Жёсткость разворота, рад/с². Пружина критического затухания: до цели она
 * доводит примерно за `4.7 / w` секунды, то есть около секунды, и делает это без
 * перелёта — кадр не качается вокруг курса.
 */
const CINEMATIC_TURN_RATE = 5.0;
/** Потолок скорости разворота, рад/с. Примерно 115°/с — панорама, а не хлыст. */
const CINEMATIC_MAX_TURN_RATE = 2.0;
/** С какой охотой наклон идёт к геометрическому. Той же манерой, что высота и радиус. */
const CINEMATIC_PITCH_EASE = 2.4;
/* Зазор от плоскости стены, в долях клетки. Треть клетки — это около метра с
 * четвертью при масштабе 3.6 м на клетку: ближе кадр уже читается упором. Больше
 * половины ставить нельзя — в клетке шириной один зазор с двух сторон не сойдётся. */
const CAMERA_WALL_CLEARANCE = 0.34;
/** С какой охотой радиус облёта подходит к заданному. Ниже — мягче вход в сцену. */
const CINEMATIC_ORBIT_EASE = 1.2;
/**
 * Нижняя полка накатa. Без неё замедление у цели становится асимптотой, кадр
 * никогда не «прибывает», и такт, ждущий прибытия, висит до потолка сцены.
 */
const CINEMATIC_GLIDE_FLOOR = 0.35;
/** Сколько хода за кадр добавляет уходящий субъект. Быстрее любого человека вдвое. */
const CINEMATIC_ORBIT_TRACK_MAX = 0.06;
const CINEMATIC_BREATH_HEIGHT = 0.15;
const CINEMATIC_BREATH_PITCH = 0.1;
/* Допуск на узел маршрута — ПОЛОВИНА подклетки, то есть половина шага той сетки,
 * по которой узлы и проложены. Это не подобранное число: допуск шире шага сетки
 * означает, что камера объявляет пройденными сразу несколько узлов и идёт к
 * дальнему по хорде — сквозь простенок между ними. Прежние 0.5 были вдвое шире
 * шага (0.25), и на настоящем этаже пролёт до зала выглядел так: упёршийся шаг
 * промотывал узлы без движения, кадр блуждал шесть секунд, уходя от цели на 68
 * клеток, и заканчивался вынужденным переносом. С допуском внутри подклетки
 * камера идёт ровно по ломаной, а упереться ей больше не во что.
 * Потолок субшагов — предохранитель от длинного кадра, не тюнинг. */
const CINEMATIC_NODE_REACH = 0.5 / PATH_BLOCKER_SUBDIV;
/**
 * Насколько далеко по ломаной смотреть, выбирая курс, В КЛЕТКАХ.
 *
 * Считалось это в УЗЛАХ — двенадцать штук сетки, то есть те же три клетки, пока
 * узлы стояли ровным шагом по подклеткам. После разглаживания шаг перестал быть
 * ровным: на прямом перегоне между узлами бывает десяток клеток, и счёт в узлах
 * унёс бы прицел за поворот, который кадр ещё не прошёл.
 */
const CINEMATIC_LOOKAHEAD = 3;
const CINEMATIC_MAX_SUBSTEPS = 64;
/**
 * Доля звена, отдаваемая под срез угла. Четверть — предел: отступ берётся с
 * обоих концов звена, и больше четверти они бы перекрылись.
 * Нижняя доля — предохранитель поджатия: срез мельче четверти подклетки уже не
 * скругление, а тот же излом.
 */
const CORNER_CUT_SHARE = 0.25;
const CORNER_CUT_MIN_SHARE = CINEMATIC_NODE_REACH / 2;

const DEATH_BALL_RADIUS = 0.2;
const DEATH_FRICTION = 0.65;
const DEATH_BOUNCE = 0.45;
const DEATH_DROP_SPEED = 4.0;
const deathCameraStates = new WeakMap<RuntimeCamera, DeathCameraState>();

function wrapCoord(value: number): number {
  return ((value % W) + W) % W;
}

/** Кратчайшее смещение a→b на торе. Двойник `world.delta` там, где мира под рукой нет. */
function wrapDelta(a: number, b: number): number {
  let d = b - a;
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

function clampPitch(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function clampHeight(value: number): number {
  return Math.max(FREE_CAMERA_MIN_HEIGHT, Math.min(FREE_CAMERA_MAX_HEIGHT, value));
}

export function createRuntimeCamera(): RuntimeCamera {
  return {
    mode: 'player',
    free: { x: 0, y: 0, angle: 0, pitch: 0, height: CAMERA_STANDING_HEIGHT },
    bob: createCameraBobState(),
  };
}

export function resetRuntimeCamera(camera: RuntimeCamera): void {
  camera.mode = 'player';
  resetCameraBob(camera.bob);
  deathCameraStates.delete(camera);
}

export function followPlayerCamera(camera: RuntimeCamera): void {
  resetRuntimeCamera(camera);
}

export function setFreeCamera(camera: RuntimeCamera, pose: Partial<CameraPose> & Pick<CameraPose, 'x' | 'y'>): void {
  camera.mode = 'free';
  resetCameraBob(camera.bob);
  deathCameraStates.delete(camera);
  camera.free = {
    x: wrapCoord(pose.x),
    y: wrapCoord(pose.y),
    angle: pose.angle ?? camera.free.angle,
    pitch: clampPitch(pose.pitch ?? camera.free.pitch),
    height: clampHeight(pose.height ?? camera.free.height),
    fovRadians: pose.fovRadians ?? camera.free.fovRadians,
  };
}

export function setFreeCameraFromSubject(camera: RuntimeCamera, subject: CameraSubject, height = CAMERA_STANDING_HEIGHT): void {
  setFreeCamera(camera, {
    x: subject.x,
    y: subject.y,
    angle: subject.angle,
    pitch: subject.pitch ?? 0,
    height,
    fovRadians: camera.free.fovRadians,
  });
}

export function moveFreeCamera(camera: RuntimeCamera, world: World, move: FreeCameraMove, dt: number): void {
  if (camera.mode !== 'free') return;
  const pose = camera.free;
  const turnSpeed = move.turnSpeed ?? FREE_CAMERA_TURN_SPEED;
  const pitchSpeed = move.pitchSpeed ?? FREE_CAMERA_PITCH_SPEED;
  pose.angle += (move.turn ?? 0) * turnSpeed * dt;
  pose.pitch = clampPitch(pose.pitch + (move.pitch ?? 0) * pitchSpeed * dt);
  pose.height = clampHeight(pose.height + (move.vertical ?? 0) * (move.speed ?? FREE_CAMERA_SPEED) * dt);

  const forward = Math.max(-1, Math.min(1, move.forward ?? 0));
  const strafe = Math.max(-1, Math.min(1, move.strafe ?? 0));
  if (forward === 0 && strafe === 0) return;

  const len = Math.sqrt(forward * forward + strafe * strafe);
  const mag = len > 1 ? 1 / len : 1;
  const speed = (move.speed ?? FREE_CAMERA_SPEED) * dt;
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  const nx = wrapCoord(pose.x + (cos * forward - sin * strafe) * mag * speed);
  const ny = wrapCoord(pose.y + (sin * forward + cos * strafe) * mag * speed);
  if (move.collide === true && world.solid(Math.floor(nx), Math.floor(ny))) return;
  pose.x = nx;
  pose.y = ny;
}

export function startDeathCamera(
  camera: RuntimeCamera,
  px: number,
  py: number,
  pAngle: number,
  random: () => number = rng,
): void {
  camera.mode = 'death';
  resetCameraBob(camera.bob);
  camera.free = {
    x: wrapCoord(px),
    y: wrapCoord(py),
    angle: pAngle,
    pitch: 0,
    height: CAMERA_STANDING_HEIGHT,
    fovRadians: camera.free.fovRadians,
  };
  deathCameraStates.set(camera, createDeathCameraState(px, py, pAngle, random));
}

export function startCinematicCamera(
  camera: RuntimeCamera,
  px: number,
  py: number,
  waypoints: number[][],
  aim?: CinematicCameraAim,
): void {
  camera.mode = 'cinematic';
  resetCameraBob(camera.bob);
  camera.free = {
    x: wrapCoord(px),
    y: wrapCoord(py),
    angle: 0,
    pitch: 0,
    height: CAMERA_STANDING_HEIGHT,
    fovRadians: camera.free.fovRadians,
  };
  camera.cinematic = {
    path: waypoints,
    targetNodeIndex: 0,
    active: true,
    time: 0,
    angleTarget: 0,
    flySpeed: CINEMATIC_FLY_SPEED,
  };
  if (aim) aimCinematicCamera(camera, aim);
}

/** Перенацелить летящую камеру, не перезапуская пролёт: сцена меняет план кадра между репликами. */
export function aimCinematicCamera(camera: RuntimeCamera, aim: CinematicCameraAim): void {
  const ts = camera.cinematic;
  if (!ts) return;
  if (aim.lookAt !== undefined) {
    ts.lookAtX = aim.lookAt === null ? undefined : wrapCoord(aim.lookAt.x);
    ts.lookAtY = aim.lookAt === null ? undefined : wrapCoord(aim.lookAt.y);
  }
  if (aim.orbit !== undefined) {
    if (aim.orbit === null) {
      ts.orbitRadius = undefined;
      ts.orbitSpeed = undefined;
    } else {
      ts.orbitRadius = Math.max(0.5, aim.orbit.radius);
      ts.orbitSpeed = aim.orbit.speed;
      // Круг начинается ТАМ, ГДЕ КАДР УЖЕ СТОИТ: и фаза, и радиус берутся с
      // текущего места, а к заданному радиусу камера подходит плавно. Иначе
      // первый же кадр облёта — прыжок с точки прилёта на окружность, и вход в
      // сцену читается как склейка.
      const dx = ts.lookAtX !== undefined ? wrapDelta(ts.lookAtX, camera.free.x) : 0;
      const dy = ts.lookAtY !== undefined ? wrapDelta(ts.lookAtY, camera.free.y) : 0;
      const distNow = Math.sqrt(dx * dx + dy * dy);
      ts.orbitPhase = aim.orbit.phase ?? (distNow === 0 ? ts.orbitPhase ?? 0 : Math.atan2(dy, dx));
      ts.orbitTrackX = ts.lookAtX;
      ts.orbitTrackY = ts.lookAtY;
      // Ровно текущее расстояние, без нижней полки: кадр, прилетевший в самый
      // центр облёта, иначе отскакивал на эту полку в первый же кадр.
      ts.orbitReach = distNow;
    }
  }
  if (aim.height !== undefined) ts.heightTarget = clampHeight(aim.height);
  if (aim.flySpeed !== undefined) ts.flySpeedTarget = Math.max(0, aim.flySpeed);
  if (aim.hold !== undefined) ts.hold = aim.hold;
  if (aim.angle !== undefined) camera.free.angle = aim.angle;
}

/** Проложить новый маршрут для той же сцены. Курсор узлов сбрасывается, прицел сохраняется. */
export function setCinematicCameraPath(camera: RuntimeCamera, waypoints: number[][]): void {
  const ts = camera.cinematic;
  if (!ts) return;
  ts.path = waypoints;
  ts.targetNodeIndex = 0;
  ts.forced = false;
}

/**
 * Проложить маршрут ПО ПРОХОДИМЫМ КЛЕТКАМ. Пути этажа и так запечены, и лететь
 * сквозь бетон незачем: зритель должен видеть дорогу, а не изнанку стен.
 * Если прохода нет вовсе, остаётся прямая — пустой кадр хуже короткого сквозняка.
 */
export function routeCinematicCamera(camera: RuntimeCamera, world: World, tx: number, ty: number): void {
  const ts = camera.cinematic;
  if (!ts) return;
  // Цель приземляется на ближайшую проходимую клетку. Точку кадра назначает автор
  // сцены смещением от якоря, и промахнуться мимо комнаты легко: та же цифра,
  // верная для зала двадцать на четырнадцать, у комнаты пять на шесть лежит уже в
  // бетоне. Без приземления такой кадр вырождался в вынужденный перенос, то есть
  // в телепорт на десятки клеток.
  const landed = nearestCameraSpot(world, tx, ty);
  const waypoints = cameraRouteWaypoints(
    world,
    world.wrap(Math.floor(camera.free.x)),
    world.wrap(Math.floor(camera.free.y)),
    Math.floor(landed.x),
    Math.floor(landed.y),
  );
  waypoints.push([landed.x, landed.y]);
  // Точка приземления дописана уже ПОСЛЕ разглаживания, и потому вносит свой,
  // последний излом. Проход среза углов по готовому маршруту его и снимает:
  // подъезд к кадру перестаёт быть поворотом в последний момент.
  setCinematicCameraPath(camera, cutCorners(world, waypoints));
}

/* Сколько искать дверь для выхода из запертого объёма и сколько проёмов пробовать.
 * Оба потолка — предохранители одноразового поиска на такте, не тюнинг кадра. */
const CAMERA_DOOR_HOP_REACH = 48;
const CAMERA_DOOR_HOP_CANDIDATES = 12;
/** Докуда искать проходимую клетку под точку кадра, если автор промахнулся. */
const CAMERA_TARGET_LANDING_REACH = 6;
/**
 * Желаемая длина перегона трейлера, в клетках: на четырёх клетках в секунду это
 * около восьми секунд хода, то есть один план. Не предел, а масштаб оценки — за
 * ним комнаты дешевеют, но остаются доступны.
 */
const TRAILER_HOP_REACH = 32;
/** Ближе этого лететь незачем: кадр туда уже смотрит по упреждению курса. */
const TRAILER_HOP_MIN = CINEMATIC_LOOKAHEAD;
/** С какой площади комната считается просторной. Зал 20x14 — заведомо да, каморка — нет. */
const TRAILER_ROOMY_AREA = 200;
/** Сколько последних комнат помнить, чтобы трейлер не ходил одним кругом. */
const TRAILER_VISITED_MEMORY = 8;

/**
 * Ближайшая к точке кадра клетка, куда камера вообще может встать. Сама точка
 * годится чаще всего; поиск нужен для промаха мимо комнаты, и расходящаяся
 * спираль находит стену насквозь — за проёмом или за углом, как ляжет.
 */
function nearestCameraSpot(world: World, tx: number, ty: number): { x: number; y: number } {
  if (!cameraBlocked(world, tx, ty)) return { x: tx, y: ty };
  const cx = Math.floor(tx);
  const cy = Math.floor(ty);
  for (let radius = 1; radius <= CAMERA_TARGET_LANDING_REACH; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = world.wrap(cx + dx) + 0.5;
        const y = world.wrap(cy + dy) + 0.5;
        if (!cameraBlocked(world, x, y)) return { x, y };
      }
    }
  }
  return { x: tx, y: ty };
}

/**
 * Маршрут кадра, ДЛЯ КОТОРОГО ЗАМКОВ НЕ СУЩЕСТВУЕТ.
 *
 * Дверь камеру не держит, но запечённое дерево путей считает запертое
 * непроходимым — а значит из запертого объёма маршрута нет ВООБЩЕ, и никакая
 * проходимость шага этого не исправит. Так и начинается игра: пролог играется из
 * Столовой, куда игрок поставлен за дверью на ключ, и дерево путей оттуда не
 * выходит (замерено — ноль узлов на любом сиде).
 *
 * Поэтому маршрут собирается по частям: до двери, через неё, дальше от её другой
 * стороны. Это запросы к УЖЕ ЗАПЕЧЁННОМУ дереву, а не новый обход, и делаются они
 * один раз на такт — Железный закон о том, что O(W²) считается только на загрузке
 * этажа, не нарушен.
 */
function cameraRouteWaypoints(world: World, sx: number, sy: number, tx: number, ty: number): number[][] {
  const direct = bakedRouteLeg(world, sx, sy, tx, ty);
  if (direct) return smoothCameraRoute(world, direct);

  // Двери ищутся у ОБОИХ концов. Запирающая створка стоит там, где заперто, а не
  // там, где мы стоим: возврат к игроку из зала пролога упирался в стену именно
  // поэтому — игрок остался в запертой Столовой в сотне клеток отсюда, и её дверь
  // в список ближайших к камере не попадала.
  const candidates: { idx: number; dist2: number }[] = [];
  for (const idx of world.doors.keys()) {
    const dx = idx % W;
    const dy = (idx / W) | 0;
    const fromStart = world.delta(sx, dx) ** 2 + world.delta(sy, dy) ** 2;
    const fromTarget = world.delta(tx, dx) ** 2 + world.delta(ty, dy) ** 2;
    const dist2 = Math.min(fromStart, fromTarget);
    if (dist2 <= CAMERA_DOOR_HOP_REACH * CAMERA_DOOR_HOP_REACH) candidates.push({ idx, dist2 });
  }
  candidates.sort((a, b) => a.dist2 - b.dist2);

  const tried = Math.min(candidates.length, CAMERA_DOOR_HOP_CANDIDATES);
  for (let i = 0; i < tried; i++) {
    const doorIdx = candidates[i].idx;
    const sides = doorSideCells(world, doorIdx);
    if (!sides) continue;
    const doorX = (doorIdx % W) + 0.5;
    const doorY = ((doorIdx / W) | 0) + 0.5;
    for (const flip of [false, true]) {
      const near = flip ? sides[1] : sides[0];
      const far = flip ? sides[0] : sides[1];
      const toDoor = bakedRouteLeg(world, sx, sy, near.x, near.y);
      if (!toDoor) continue;
      const fromDoor = bakedRouteLeg(world, far.x, far.y, tx, ty);
      if (!fromDoor) continue;
      // Разглаживается КАЖДОЕ ПЛЕЧО ОТДЕЛЬНО, а створка остаётся узлом как есть:
      // спрямление поперёк проёма срезало бы косяк, а это единственное место
      // маршрута, где камера обязана пройти строго по оси.
      return [
        ...smoothCameraRoute(world, toDoor),
        [doorX, doorY],
        ...smoothCameraRoute(world, fromDoor),
      ];
    }
  }
  return [];
}

/**
 * РАЗГЛАДИТЬ МАРШРУТ. Один раз на маршрут, не на кадре.
 *
 * Запечённое дерево путей отдаёт ломаную по сетке подклеток: узел через каждую
 * четверть клетки, ходы только по осям. Диагональный перегон из-за этого не
 * прямая, а лесенка, и кадр, идущий по ней ТОЧНО (а он обязан идти точно, иначе
 * режет углы простенков), физически виляет каждую четверть клетки. Замерено на
 * дороге до зала пролога: 234 узла, суммарный излом ломаной 3526° на 113 клеток
 * хода, и курс самого хода набирал 2450° поворота за восемь секунд, из них 21
 * рывок круче сорока пяти градусов. Это и есть «стрейфы и дёрганые повороты» —
 * не манера камеры, а форма дороги, которую ей дали.
 *
 * Лечится дорога, а не камера, и в два приёма. Сперва натяжение: узел выживает,
 * только если от последнего выжившего до СЛЕДУЮЩЕГО за ним по прямой нет
 * преграды, — лесенка схлопывается в отрезок. Затем срез углов, дважды:
 * оставшиеся настоящие повороты перестают быть изломом и становятся дугой.
 *
 * Обе пробы идут по правилу камеры как ТЕЛА: прямая проверяется не только по
 * оси, но и на ширину по бокам. Иначе спрямление прошло бы по диагонали между
 * двумя углами простенка — формально по свободным клеткам, а на деле сквозь бетон.
 */
function smoothCameraRoute(world: World, path: number[][]): number[][] {
  if (path.length < 3) return path;
  const pulled: number[][] = [path[0]];
  let anchor = path[0];
  for (let i = 1; i < path.length - 1; i++) {
    if (clearForCamera(world, anchor, path[i + 1])) continue;
    anchor = path[i];
    pulled.push(anchor);
  }
  pulled.push(path[path.length - 1]);
  return cutCorners(world, cutCorners(world, pulled));
}

/** Пройдёт ли камера по прямой между двумя точками, не задев стену бортом. */
function clearForCamera(world: World, from: number[], to: number[]): boolean {
  const dx = world.delta(from[0], to[0]);
  const dy = world.delta(from[1], to[1]);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return true;
  const nx = dx / dist;
  const ny = dy / dist;
  const steps = Math.ceil(dist / CINEMATIC_NODE_REACH);
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * dist;
    const x = from[0] + nx * t;
    const y = from[1] + ny * t;
    // Борта проверяются по нормали к ходу: сама ось может лечь ровно в щель
    // между углами двух простенков, и тогда осевая проба ничего не заметит.
    //
    // Отступ — ПОЛОВИНА ПОДКЛЕТКИ, то есть разрешение самой сетки путей, а не
    // зазор от стены. Зазор здесь строже дороги, по которой камера и так летела:
    // узлы дерева стоят по подклеткам и сами лежат в четверти клетки от бетона,
    // так что проба с зазором браковала почти всякое спрямление. Замерено на
    // дороге до зала: с зазором ломаная жала 222 узла в 79, с половиной
    // подклетки — в 11, и это настоящее число поворотов коридора.
    if (cameraBlocked(world, x, y)) return false;
    if (cameraBlocked(world, x - ny * CINEMATIC_NODE_REACH, y + nx * CINEMATIC_NODE_REACH)) return false;
    if (cameraBlocked(world, x + ny * CINEMATIC_NODE_REACH, y - nx * CINEMATIC_NODE_REACH)) return false;
  }
  return true;
}

/**
 * Срезать углы: излом заменяется хордой, отступающей от вершины по обоим звеньям.
 * Концы маршрута неприкосновенны — начало это место кадра, конец это заказанная точка.
 *
 * Проверяется не точка среза, а САМА ХОРДА. Точки лежат на уже проверенном звене
 * и потому свободны всегда, а вот хорда идёт ЧЕРЕЗ ВЕРШИНУ угла — и ровно она
 * уводит кадр внутрь простенка. Замерено: без этой проверки сцена пролога
 * проводила в бетоне полтора процента кадров, хотя каждая точка среза была
 * свободна.
 *
 * И срез не «да или нет», а НАСКОЛЬКО ВЛЕЗЕТ: доля отступа поджимается вдвое,
 * пока хорда не пройдёт, — тот же приём, которым радиус облёта поджимается к
 * стене. Отказ от среза целиком оставлял острый угол ровно там, где скруглить
 * нужнее всего: в тесном повороте коридора.
 *
 * Отсюда инвариант, который держит весь разглаженный маршрут: КАЖДОЕ звено на
 * выходе — либо часть уже проверенного звена, либо проверенная хорда. Четверть
 * сверху обязательна: отступ с обоих концов звена не должен перекрываться.
 */
function cutCorners(world: World, path: number[][]): number[][] {
  if (path.length < 3) return path;
  const out: number[][] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const here = path[i];
    const next = path[i + 1];
    const inX = world.delta(here[0], prev[0]);
    const inY = world.delta(here[1], prev[1]);
    const outX = world.delta(here[0], next[0]);
    const outY = world.delta(here[1], next[1]);
    let cut: number[][] | null = null;
    for (let f = CORNER_CUT_SHARE; f >= CORNER_CUT_MIN_SHARE; f /= 2) {
      const from = [wrapCoord(here[0] + inX * f), wrapCoord(here[1] + inY * f)];
      const to = [wrapCoord(here[0] + outX * f), wrapCoord(here[1] + outY * f)];
      if (clearForCamera(world, from, to)) { cut = [from, to]; break; }
    }
    if (cut) out.push(cut[0], cut[1]);
    else out.push(here);
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Отрезок по запечённому дереву. `null` — дороги нет; пустой список — уже на месте. */
function bakedRouteLeg(world: World, sx: number, sy: number, tx: number, ty: number): number[][] | null {
  if (sx === tx && sy === ty) return [];
  const nodes = bfsPath(world, sx, sy, tx, ty);
  return nodes.length ? nodes.map(node => subcellToWorld(node) as unknown as number[]) : null;
}

/** Клетки по обе стороны проёма: напротив друг друга по его оси. */
function doorSideCells(
  world: World,
  doorIdx: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const x = doorIdx % W;
  const y = (doorIdx / W) | 0;
  if (!cameraBlocked(world, x - 1, y) && !cameraBlocked(world, x + 1, y)) {
    return [{ x: world.wrap(x - 1), y }, { x: world.wrap(x + 1), y }];
  }
  if (!cameraBlocked(world, x, y - 1) && !cameraBlocked(world, x, y + 1)) {
    return [{ x, y: world.wrap(y - 1) }, { x, y: world.wrap(y + 1) }];
  }
  return null;
}

/**
 * Проходимость ДЛЯ КАМЕРЫ. Дверь оператора не держит — ни прикрытая, ни запертая:
 * ключей у камеры нет, и открывать ей нечем. Держит только настоящая преграда —
 * бетон, пропасть, шахта лифта.
 *
 * Дверь как преграда ломала кадр дважды. `world.solid` считает сплошной любую
 * дверь кроме распахнутой, поэтому шаг упирался в обычную прикрытую створку на
 * дороге; а запечённое дерево путей считает непроходимым запертое, поэтому из
 * стартовой запертой комнаты маршрута наружу не существует вовсе.
 */
function cameraBlocked(world: World, x: number, y: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (world.cells[world.idx(cx, cy)] === Cell.DOOR) return false;
  return world.solid(cx, cy);
}

/**
 * Вынужденный ход к цели напрямую.
 *
 * Узел за преградой признаётся пройденным по допуску, и если преграда настоящая,
 * так проматывается вся ломаная, пока кадр стоит на месте: маршрут «кончился», а
 * камера не сдвинулась. Такт `fly` ждёт прибытия без секундомера, поэтому «не
 * доехал» означало бы отобранное у игрока управление до потолка сцены.
 *
 * Раньше кадр в этом случае СТАВИЛСЯ в цель — и это был телепорт, тем заметнее,
 * чем короче остаток. А случается такое и на двух клетках: мелкая комната,
 * набитая мебелью, для дерева путей непроходима, хотя камере там пусто.
 *
 * Поэтому теперь не прыжок, а ход напрямую: скорость та же, что у такта, значит
 * перескока нет вовсе. Ценой — возможный короткий сквозняк через простенок, и это
 * честный обмен: дороги-то нет.
 */
function forceRouteEnd(ts: CinematicCameraState): void {
  if (ts.path.length) ts.forced = true;
}

/** Идёт ли сейчас вынужденный ход. Для сцены он неотличим от обычного пролёта. */
export function cinematicCameraForced(camera: RuntimeCamera): boolean {
  return camera.cinematic?.forced === true;
}

/**
 * Пройти по маршруту за кадр, НЕ срезая углы.
 *
 * Сквозь стены камера пролетала не потому, что маршрут плохой, а потому что шаг
 * за кадр был крупнее допуска на узел: на скорости 22 клетки в секунду камера
 * проходит за кадр три четверти клетки, перескакивает узел, не «съев» его, и
 * дальше идёт по хорде — то есть напрямую через угол простенка.
 *
 * Поэтому кадровое перемещение режется на короткие шаги (не длиннее допуска),
 * и на каждом шаге камера правит курс на текущий узел. Получается ход строго по
 * ломаной, которую проложил BFS. Стена вдобавок останавливает шаг: если узел
 * почему-то оказался за ней, кадр замрёт на месте, а не окажется в бетоне —
 * такой узел через `CINEMATIC_NODE_REACH` всё равно будет признан пройденным.
 */
function flyAlongRoute(camera: RuntimeCamera, world: World, ts: CinematicCameraState, dt: number): void {
  let budget = ts.flySpeed * dt;
  if (budget <= 0) return;
  if (ts.forced) {
    // Вынужденный ход накатом не идёт: он и так последний отрезок, а замедлять
    // его — значит откладывать прибытие, которого такт ждёт.
    flyStraightToRouteEnd(camera, world, ts, budget);
    return;
  }
  /* Подъезд к точке — НАКАТОМ, а не в стену. Ход обрывался ровно на последнем
   * узле: кадр шёл полной скоростью и в один кадр вставал, а следующий такт так
   * же резко трогал его с места.
   *
   * Считается ОСТАТОК ЛОМАНОЙ, а не расстояние до конца по прямой: на дороге
   * буквой П камера бывает в двух клетках от цели, пройдя половину пути, и
   * замедляться ей там незачем. Нижняя полка обязательна — без неё замедление
   * становится асимптотой и прибытия не наступает вовсе. */
  const glideSpan = ts.flySpeed / CINEMATIC_ORBIT_EASE;
  // Дорога из одного узла — то же, что вынужденный ход: ломаной нет, кадр
  // пробирается к цели вслепую вдоль стен, и накат там только откладывает
  // прибытие.
  if (glideSpan > 0 && ts.path.length > 1) {
    const remaining = routeRemainingLength(camera, world, ts);
    budget *= Math.max(CINEMATIC_GLIDE_FLOOR, Math.min(1, remaining / glideSpan));
  }
  let guard = CINEMATIC_MAX_SUBSTEPS;
  const startGap = routeEndGap(camera, world, ts);
  // Запечённое дерево путей находит дорогу не всегда: на части этажей маршрута
  // до зала попросту нет, и тогда в пути остаётся единственный узел — сама цель.
  // Лететь к ней по прямой значит идти сквозь бетон, поэтому в таком кадре
  // камера пробирается со скольжением вдоль стен и узел не бросает.
  const routeless = ts.path.length <= 1;
  while (budget > 0 && guard-- > 0 && ts.targetNodeIndex < ts.path.length) {
    const node = ts.path[ts.targetNodeIndex];
    const dx = world.delta(camera.free.x, node[0]);
    const dy = world.delta(camera.free.y, node[1]);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0) {
      ts.targetNodeIndex++;
      continue;
    }
    const step = Math.min(budget, CINEMATIC_NODE_REACH, dist);
    // Узел берётся ТОЧНО, а не «примерно». Порог «достаточно близко» оставлял
    // камере перелёт на долю клетки, после чего она возвращалась к брошенному
    // узлу: на настоящем этаже ход выходил вдвое длиннее самой ломаной (197
    // клеток вместо 102) — то есть половина пролёта уходила в дрожь на месте.
    const reached = step >= dist;
    const nx = wrapCoord(camera.free.x + (dx / dist) * step);
    const ny = wrapCoord(camera.free.y + (dy / dist) * step);
    if (!cameraBlocked(world, nx, ny)) {
      camera.free.x = nx;
      camera.free.y = ny;
      budget -= step;
      if (reached) ts.targetNodeIndex++;
      continue;
    }
    if (!routeless) {
      ts.targetNodeIndex++;
      continue;
    }
    // Стена на прямой: разъезжаемся по осям, чтобы обогнуть её, а не пройти насквозь.
    const slidX = wrapCoord(camera.free.x + (dx / dist) * step);
    const slidY = wrapCoord(camera.free.y + (dy / dist) * step);
    if (!cameraBlocked(world, slidX, camera.free.y)) camera.free.x = slidX;
    if (!cameraBlocked(world, camera.free.x, slidY)) camera.free.y = slidY;
    budget -= step;
  }

  ts.angleTarget = routeCourseAngle(camera, world, ts);

  const gap = routeEndGap(camera, world, ts);
  if (gap <= CINEMATIC_NODE_REACH) return;

  // Ломаная промотана, а камера не у цели: узлы съедала преграда, а не ход.
  if (ts.targetNodeIndex >= ts.path.length) {
    forceRouteEnd(ts);
    return;
  }
  // Маршрута нет, и слепой прогон по прямой перестал сокращать дистанцию: ждать
  // нечего, плана обхода у камеры и не было. Судить по продвижению, а не по
  // «сдвинулись ли по осям» — при строго осевом подходе к стене скольжение
  // двигает кадр на ноль и рапортует успех.
  if (routeless && gap >= startGap) forceRouteEnd(ts);
}

/** Ход к концу ломаной напрямую, сквозь что угодно. Прибытие — по допуску на узел. */
function flyStraightToRouteEnd(
  camera: RuntimeCamera,
  world: World,
  ts: CinematicCameraState,
  budget: number,
): void {
  const end = ts.path[ts.path.length - 1];
  if (!end) {
    ts.targetNodeIndex = ts.path.length;
    return;
  }
  const dx = world.delta(camera.free.x, end[0]);
  const dy = world.delta(camera.free.y, end[1]);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= CINEMATIC_NODE_REACH) {
    ts.forced = false;
    ts.targetNodeIndex = ts.path.length;
    return;
  }
  const step = Math.min(budget, dist);
  camera.free.x = wrapCoord(camera.free.x + (dx / dist) * step);
  camera.free.y = wrapCoord(camera.free.y + (dy / dist) * step);
  ts.angleTarget = Math.atan2(dy, dx);
  if (step >= dist) {
    ts.forced = false;
    ts.targetNodeIndex = ts.path.length;
  }
}

/**
 * Докуда от точки внимания видно по луче.
 *
 * Облёт — единственное место, где кадр переносится аналитически каждый кадр, и
 * потому единственное, где он способен пройти сквозь бетон. Прежняя проба искала
 * ПЕРВУЮ СВОБОДНУЮ клетку, идя от края круга внутрь, и охотно ставила оператора
 * за простенок: клетка за стеной свободна. Следующий кадр переносил его обратно
 * по касательной — и кадр проходил стену боком, ровно как в жалобе на вращение.
 *
 * Марш наружу обрезает радиус ПЕРВОЙ преградой: круг поджимается к стене, а
 * оператор остаётся в той же комнате, что и актёры.
 *
 * Обрезается он С ЗАЗОРОМ — тем же, что держит всякий кадр от плоскости стены.
 * Без него круг поджимался ВПЛОТНУЮ, и облёт вокруг человека у стены превращался
 * в скрёб носом по бетону на трети оборота. Толкать оттуда уже поздно: общий
 * зазор правит клетку, в которой кадр стоит, и внутреннего угла — где бетон по
 * диагонали — он не видит вовсе.
 */
function clearRadius(
  world: World,
  cx: number,
  cy: number,
  dirX: number,
  dirY: number,
  maxRadius: number,
): number {
  let reach = 0;
  for (let r = CINEMATIC_NODE_REACH; r <= maxRadius; r += CINEMATIC_NODE_REACH) {
    if (cameraBlocked(world, cx + dirX * r, cy + dirY * r)) break;
    reach = r;
  }
  // Зазор нужен с ОБЕИХ сторон: если после отступа от стены до актёров осталось
  // меньше того же зазора, места на круг нет вовсе — и честнее сказать это прямо,
  // чем поставить оператора вплотную к людям.
  const gapped = reach - CAMERA_WALL_CLEARANCE;
  return gapped >= CAMERA_WALL_CLEARANCE ? gapped : 0;
}

/**
 * Курс кадра — на точку в НЕСКОЛЬКИХ КЛЕТКАХ впереди по ломаной, а не на
 * ближайший узел.
 *
 * Целиться в ближайший узел значит переставлять курс на каждом шаге: направление
 * на соседний узел скачет между осевым и диагональным, и кадр дёргается вместо
 * поворота. Дальняя точка меняется медленно, поэтому поворот выходит один и плавный.
 *
 * Отсчёт идёт В КЛЕТКАХ ПО ЛОМАНОЙ, а не в узлах: после разглаживания шаг узлов
 * неровен, и «двенадцать узлов вперёд» на прямом перегоне унесло бы прицел за
 * поворот, в который кадр ещё не вошёл.
 */
function routeCourseAngle(camera: RuntimeCamera, world: World, ts: CinematicCameraState): number {
  let px = camera.free.x;
  let py = camera.free.y;
  let left = CINEMATIC_LOOKAHEAD;
  let node = ts.path[ts.targetNodeIndex] ?? ts.path[ts.path.length - 1];
  for (let i = ts.targetNodeIndex; i < ts.path.length && left > 0; i++) {
    node = ts.path[i];
    const dx = world.delta(px, node[0]);
    const dy = world.delta(py, node[1]);
    left -= Math.sqrt(dx * dx + dy * dy);
    px = node[0];
    py = node[1];
  }
  if (!node) return ts.angleTarget;
  const dx = world.delta(camera.free.x, node[0]);
  const dy = world.delta(camera.free.y, node[1]);
  return dx === 0 && dy === 0 ? ts.angleTarget : Math.atan2(dy, dx);
}

/** Насколько кадр не доехал до конца проложенной ломаной. */
/** Сколько ломаной осталось пройти: от кадра до текущего узла плюс все хвостовые звенья. */
function routeRemainingLength(camera: RuntimeCamera, world: World, ts: CinematicCameraState): number {
  let i = ts.targetNodeIndex;
  if (i >= ts.path.length) return 0;
  let px = camera.free.x;
  let py = camera.free.y;
  let total = 0;
  for (; i < ts.path.length; i++) {
    const node = ts.path[i];
    const dx = world.delta(px, node[0]);
    const dy = world.delta(py, node[1]);
    total += Math.sqrt(dx * dx + dy * dy);
    px = node[0];
    py = node[1];
  }
  return total;
}

function routeEndGap(camera: RuntimeCamera, world: World, ts: CinematicCameraState): number {
  const end = ts.path[ts.path.length - 1];
  if (!end) return 0;
  const dx = world.delta(camera.free.x, end[0]);
  const dy = world.delta(camera.free.y, end[1]);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Потолок над камерой. Высоко — хорошо, сквозь перекрытие — нет: план режется
 * по потолку текущей клетки, отступая ровно на амплитуду покачивания, чтобы
 * «дыхание» кадра не пробивало плиту. Под открытым небом ограничивать нечем.
 *
 * Масштаб для справки: глаз человека 0.5 = 1.8 м, значит единица высоты ≈ 3.6 м,
 * а обычное перекрытие (ярус 0) — те же 3.6 м. Отсюда рабочий потолок плана
 * около 0.85, то есть примерно три метра над полом.
 */
function ceilingLimitedHeight(world: World, x: number, y: number, wanted: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cellCeilingTier(world, cx, cy) >= SKY_TIER_THRESHOLD) return clampHeight(wanted);
  const ceiling = cellCeilingHeight(world, cx, cy) - CINEMATIC_BREATH_HEIGHT;
  return clampHeight(Math.min(wanted, Math.max(FREE_CAMERA_MIN_HEIGHT, ceiling)));
}

/** Дошла ли камера до конца проложенного маршрута. Сцена ждёт этого, прежде чем давать реплику. */
export function cinematicCameraArrived(camera: RuntimeCamera): boolean {
  const ts = camera.cinematic;
  if (!ts) return true;
  // Пока идёт вынужденный ход, прибытия нет. Взводится он ровно тогда, когда
  // ломаная уже промотана, — и без этой оговорки кадр объявлял бы себя на месте,
  // ещё только начав лететь напрямую.
  if (ts.forced) return false;
  return ts.targetNodeIndex >= ts.path.length;
}

export function updateCinematicCamera(camera: RuntimeCamera, world: World, dt: number): void {
  if (camera.mode !== 'cinematic' || !camera.cinematic) return;
  flyCinematicFrame(camera, world, camera.cinematic, dt);
}

/**
 * Кадр пролёта. Один на все режимы, у которых камера летит сама: и сцена этажа,
 * и трейлер главного меню идут ровно этим ходом, этим разворотом и этим дыханием.
 * Разница между ними только в том, кто прокладывает маршрут.
 */
function flyCinematicFrame(camera: RuntimeCamera, world: World, ts: CinematicCameraState, dt: number): void {
  ts.time += dt;
  /* Ход подтягивается к заданному такту той же экспонентой, что и радиус облёта:
   * у кадра одна манера двигаться, а не отдельная ручка на каждый повод. Смена
   * скорости между тактами перестаёт быть толчком. */
  if (ts.flySpeedTarget !== undefined) {
    ts.flySpeed = approach(ts.flySpeed, ts.flySpeedTarget, CINEMATIC_ORBIT_EASE, dt);
  }
  const directed = ts.lookAtX !== undefined && ts.lookAtY !== undefined;

  // Облёт: позиция вокруг точки внимания считается аналитически, маршрут не нужен.
  // Радиус поджимается, пока точка не окажется в проходимой клетке: круг шире
  // комнаты иначе уводил бы оператора в бетон на каждом втором обороте.
  if (directed && ts.orbitRadius !== undefined && ts.orbitSpeed !== undefined) {
    ts.orbitPhase = (ts.orbitPhase ?? 0) + ts.orbitSpeed * dt;
    const cos = Math.cos(ts.orbitPhase);
    const sin = Math.sin(ts.orbitPhase);
    // Радиус обрезается ПЕРВОЙ преградой на луче от актёров, поэтому круг
    // поджимается к стене и остаётся в той же комнате. Если не видно даже
    // вплотную — кадр остаётся на прежнем месте: замереть на секунду честнее,
    // чем уехать внутрь простенка.
    // Радиус ПОДТЯГИВАЕТСЯ, а не назначается — и к заданному, и к обрезанному
    // стеной. Два рывка отсюда: вход в облёт был прыжком с точки прилёта на
    // окружность, а обрез по стене менялся ступенями, и на каждом пересечении
    // луча с простенком кадр отскакивал на несколько клеток.
    const clear = clearRadius(world, ts.lookAtX!, ts.lookAtY!, cos, sin, ts.orbitRadius);
    if (clear > 0) {
      // Кадр ИДЁТ к точке круга, а не назначается ею. Радиус на обороте меняется
      // и плавно (вход в сцену), и скачком (луч зашёл за простенок — обрез падает
      // с шести клеток до четверти за один кадр). Назначение позиции превращало
      // второе в телепорт, а сглаживание одного радиуса — в кадр внутри бетона.
      // Ход с потолком на шаг закрывает оба: и вход, и обход стены выходят
      // скольжением, а в бетон камера просто не шагает.
      ts.orbitReach = Math.min(approach(ts.orbitReach ?? clear, clear, CINEMATIC_ORBIT_EASE, dt), clear);
      const wantX = wrapCoord(ts.lookAtX! + cos * ts.orbitReach);
      const wantY = wrapCoord(ts.lookAtY! + sin * ts.orbitReach);
      const dx = world.delta(camera.free.x, wantX);
      const dy = world.delta(camera.free.y, wantY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      /* Потолок шага РАСТЁТ вместе с ходом субъекта. Он поставлен против прыжков,
       * а не против слежения: облёт вокруг идущего человека при жёстком потолке
       * безнадёжно отстаёт — кадр волочится следом и утыкается в стены, что и
       * выглядело как «камера врезалась и застряла». Своя доля хода остаётся
       * прежней, к ней добавляется ровно то, на сколько ушёл сам субъект. */
      const trackedX = ts.orbitTrackX !== undefined ? Math.abs(wrapDelta(ts.orbitTrackX, ts.lookAtX!)) : 0;
      const trackedY = ts.orbitTrackY !== undefined ? Math.abs(wrapDelta(ts.orbitTrackY, ts.lookAtY!)) : 0;
      ts.orbitTrackX = ts.lookAtX;
      ts.orbitTrackY = ts.lookAtY;
      // Запас ограничен ШАГОМ ЧЕЛОВЕКА. Точка внимания умеет не только идти, но и
      // прыгать: центр масс роли смещается разом, когда в ней кто-то погибает, и
      // безлимитный запас утаскивал кадр этим прыжком.
      const tracked = Math.min(CINEMATIC_ORBIT_TRACK_MAX, Math.hypot(trackedX, trackedY));
      const step = Math.min(dist, CINEMATIC_NODE_REACH + tracked);
      if (dist > 0) {
        const nx = wrapCoord(camera.free.x + (dx / dist) * step);
        const ny = wrapCoord(camera.free.y + (dy / dist) * step);
        if (!cameraBlocked(world, nx, ny)) {
          camera.free.x = nx;
          camera.free.y = ny;
        }
      }
    }
    // Не видно даже вплотную — кадр ОСТАЁТСЯ НА МЕСТЕ. Прежняя запасная ветка
    // ставила его в самих актёров, то есть прыжком на весь радиус: облёт вокруг
    // прижатого к стене человека давал перескок на шесть клеток посреди кадра.
    applyCinematicGaze(camera, world, ts, dt, true, true);
    return;
  }

  // Маршрут исчерпан: держим кадр, если сцена этого просила, иначе отдаём камеру
  // игроку. Вынужденный ход сюда не попадает: он взводится ровно на исчерпании
  // ломаной, и эта ветка отбила бы его раньше, чем он начнётся.
  if (!ts.forced && (ts.path.length === 0 || ts.targetNodeIndex >= ts.path.length)) {
    if (!ts.hold) {
      camera.mode = 'player';
      return;
    }
    applyCinematicGaze(camera, world, ts, dt, directed, true);
    return;
  }

  // Маршрут ведётся ВСЕГДА, а точка внимания решает только взгляд. Раньше здесь
  // была развилка: без точки внимания камера летела не по ломаной, а туда, куда
  // смотрит, догоняя узлы разворотом. Из-за неё «летим по маршруту» и «смотрим
  // вперёд» были взаимоисключающими, и пролёт с актёрами в кадре шёл боком, не
  // поворачивая в коридорах.
  flyAlongRoute(camera, world, ts, dt);
  if (ts.targetNodeIndex >= ts.path.length && !ts.hold) {
    camera.mode = 'player';
    return;
  }
  applyCinematicGaze(camera, world, ts, dt, directed, ts.targetNodeIndex >= ts.path.length);
}

/**
 * ЗАЗОР ОТ СТЕН. Камера — тело с радиусом, а не точка.
 *
 * Точка вправо стоять у самой плоскости стены, и все проверки проходимости это
 * разрешают: клетка-то свободна. Но кадр из такой позиции — упор носом в бетон, и
 * сцену это портит вернее любого перескока. Ни один частный случай тут не лечится:
 * прижаться можно и пролётом, и облётом, и просто застыв в держащем кадре.
 *
 * Поэтому зазор держится ОДИН РАЗ НА КАДР, поверх любого способа перемещения, —
 * ровно как коллизия у всякого тела в игре. Толкает только от занятых соседей и
 * только внутрь своей клетки, так что оттолкнуть кадр в стену нечем.
 *
 * Двери не толкают: они камере проходимы, и упираться в открытый проём незачем.
 */
function keepWallClearance(world: World, camera: RuntimeCamera): void {
  const cx = Math.floor(camera.free.x);
  const cy = Math.floor(camera.free.y);
  const fx = camera.free.x - cx;
  const fy = camera.free.y - cy;
  if (fx < CAMERA_WALL_CLEARANCE && cameraBlocked(world, cx - 1, cy)) {
    camera.free.x = wrapCoord(cx + CAMERA_WALL_CLEARANCE);
  } else if (fx > 1 - CAMERA_WALL_CLEARANCE && cameraBlocked(world, cx + 1, cy)) {
    camera.free.x = wrapCoord(cx + 1 - CAMERA_WALL_CLEARANCE);
  }
  if (fy < CAMERA_WALL_CLEARANCE && cameraBlocked(world, cx, cy - 1)) {
    camera.free.y = wrapCoord(cy + CAMERA_WALL_CLEARANCE);
  } else if (fy > 1 - CAMERA_WALL_CLEARANCE && cameraBlocked(world, cx, cy + 1)) {
    camera.free.y = wrapCoord(cy + 1 - CAMERA_WALL_CLEARANCE);
  }
}

/** Взгляд, высота и наклон кадра. Наклон выводится из геометрии, а не из подобранного числа. */
function applyCinematicGaze(
  camera: RuntimeCamera,
  world: World,
  ts: CinematicCameraState,
  dt: number,
  directed: boolean,
  settled: boolean,
): void {
  // Зазор держится только на ПОКОЕ — в держащем кадре и на облёте. В пролёте он
  // ломает саму дорогу: отталкивает кадр ровно настолько, насколько тот успел
  // продвинуться, ход выходит нулевым, но каждый кадр выглядит продвижением — и
  // признак «дороги нет» не срабатывает никогда. Камера упиралась в стену вечно.
  if (settled && !ts.forced) keepWallClearance(world, camera);
  // Режется итоговая высота, а не план: иначе верхняя точка покачивания упиралась
  // бы в плиту ровно на зазор, и кадр всё равно «висел под потолком».
  const heightWanted = ts.heightTarget ?? CAMERA_STANDING_HEIGHT;
  ts.heightNow = approach(ts.heightNow ?? camera.free.height, heightWanted, CINEMATIC_ORBIT_EASE, dt);
  const wanted = ts.heightNow + Math.sin(ts.time * 0.7) * CINEMATIC_BREATH_HEIGHT;
  camera.free.height = ceilingLimitedHeight(world, camera.free.x, camera.free.y, wanted);

  if (!directed) {
    turnToward(camera, ts, ts.angleTarget, dt);
    pitchToward(camera, ts, Math.sin(ts.time * 1.1) * CINEMATIC_BREATH_PITCH, dt);
    return;
  }

  const dx = world.delta(camera.free.x, ts.lookAtX!);
  const dy = world.delta(camera.free.y, ts.lookAtY!);
  turnToward(camera, ts, Math.atan2(dy, dx), dt);

  // Экранное смещение точки высоты h на дистанции d равно (camHeight - h) / d в долях экрана,
  // а pitch задан в тех же долях (webgl.ts horizonShift). Положительный pitch поднимает взгляд,
  // поэтому камера выше цели наклоняется вниз.
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  pitchToward(camera, ts, (CAMERA_STANDING_HEIGHT - camera.free.height) / dist, dt);
}

/**
 * Довернуть кадр к цели — С ИНЕРЦИЕЙ, но НЕ БЫСТРЕЕ предела.
 *
 * Разворот вели одной экспонентой, и у неё нет разгона: угловая скорость в первом
 * же кадре прыгала с нуля до потолка, а у цели так же обрывалась в ноль. Оба конца
 * панорамы читались толчком — ровно та «недостаточная кинематографичность», на
 * которую жалуются, и заметнее всего она в коридорных поворотах, где цель курса
 * переставляется каждые несколько клеток.
 *
 * Поэтому кадр разворачивает не положение, а СКОРОСТЬ: пружина критического
 * затухания разгоняет её и сама же гасит у цели, без перелёта и без раскачки.
 * Потолок остаётся сверху и остаётся нужным: на развороте в сто восемьдесят
 * градусов пружина просит около шести радиан в секунду — это снова хлыст.
 */
function turnToward(camera: RuntimeCamera, ts: CinematicCameraState, target: number, dt: number): void {
  let diff = target - camera.free.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const w = CINEMATIC_TURN_RATE;
  const rate = (ts.angleRate ?? 0) + (w * w * diff - 2 * w * (ts.angleRate ?? 0)) * dt;
  // Потолок кладётся на САМУ скорость, а не на шаг: иначе пружина копит запас,
  // которого не отдаёт, и после долгого упора в потолок кадр проскакивает цель.
  ts.angleRate = Math.max(-CINEMATIC_MAX_TURN_RATE, Math.min(CINEMATIC_MAX_TURN_RATE, rate));
  camera.free.angle += ts.angleRate * dt;
}

/**
 * Наклон — тоже ход, а не назначение. Геометрический наклон прыгает при каждой
 * смене оси взгляда и при каждом скачке дистанции до неё, и назначенный напрямую
 * он давал кивок на всю разницу за один кадр.
 */
function pitchToward(camera: RuntimeCamera, ts: CinematicCameraState, target: number, dt: number): void {
  ts.pitchNow = approach(ts.pitchNow ?? camera.free.pitch, clampPitch(target), CINEMATIC_PITCH_EASE, dt);
  camera.free.pitch = clampPitch(ts.pitchNow);
}

export function startTrailerCamera(
  camera: RuntimeCamera,
  px: number,
  py: number,
): void {
  camera.mode = 'trailer';
  resetCameraBob(camera.bob);
  camera.free = {
    x: wrapCoord(px),
    y: wrapCoord(py),
    angle: 0,
    pitch: 0,
    height: CAMERA_STANDING_HEIGHT,
    fovRadians: camera.free.fovRadians,
  };
  camera.cinematic = {
    path: [],
    targetNodeIndex: 0,
    active: true,
    time: 0,
    angleTarget: 0,
    flySpeed: CINEMATIC_FLY_SPEED,
    // Кадр никому не отдаётся: за трейлером нет игрока, к которому возвращаться.
    hold: true,
  };
  trailerVisitedRooms.delete(camera);
}

/**
 * Куда лететь дальше — В ТОЧКУ ИНТЕРЕСА, а не «куда-нибудь подальше».
 *
 * Здесь сменились обе половины замысла. Случайная клетка тора не годится
 * потому, что интереса у неё нет вовсе: перегон выходил на сотни клеток одного
 * коридора. Но и лотерея по кольцу расстояний не годится тоже — на этаже, где
 * комнаты стоят редко, в кольцо не попадает НИ ОДНА, и кадр просто висит на
 * месте. Замерено: на Аду ближайшая комната в шестидесяти клетках, кольцо до
 * тридцати двух пусто, за минуту камера не сдвинулась ни разу.
 *
 * Поэтому не жребий, а ВЫБОР ЛУЧШЕЙ: комнаты перебираются целиком (это раз в
 * несколько секунд, не на кадре) и получают оценку. Дороже авторская комната —
 * у неё есть имя и назначение, то есть она и есть точка интереса; дороже
 * просторная — каморка в кадре не читается; дешевле дальняя — перегон должен
 * быть планом, а не перелётом через этаж. Случайная доля не решает, куда лететь,
 * а только не даёт трейлеру ходить одним и тем же кругом.
 *
 * Верхнего предела расстоянию нет намеренно: лучше долгий перелёт до
 * единственной комнаты, чем неподвижный кадр.
 */
function findTrailerTarget(
  world: World,
  cx: number,
  cy: number,
  visited: readonly number[],
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (const room of world.rooms) {
    if (!room || visited.includes(room.id)) continue;
    const x = wrapCoord(room.x + Math.floor(room.w / 2)) + 0.5;
    const y = wrapCoord(room.y + Math.floor(room.h / 2)) + 0.5;
    const dx = world.delta(cx, x);
    const dy = world.delta(cy, y);
    const dist2 = dx * dx + dy * dy;
    if (dist2 < TRAILER_HOP_MIN * TRAILER_HOP_MIN) continue;
    const score = (room.defId ? 1 : 0)
      + Math.min(1, (room.w * room.h) / TRAILER_ROOMY_AREA)
      - Math.sqrt(dist2) / TRAILER_HOP_REACH
      + rng();
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

/** Куда кадр уже слетал. Общая манера модуля хранить состояние режима вне камеры. */
const trailerVisitedRooms = new WeakMap<RuntimeCamera, number[]>();

function rememberTrailerRoom(camera: RuntimeCamera, world: World, x: number, y: number): void {
  const seen = trailerVisitedRooms.get(camera) ?? [];
  const roomId = world.roomMap[world.idx(Math.floor(x), Math.floor(y))];
  if (roomId === undefined || roomId < 0) return;
  seen.push(roomId);
  while (seen.length > TRAILER_VISITED_MEMORY) seen.shift();
  trailerVisitedRooms.set(camera, seen);
}

/**
 * Дописать перегон к хвосту маршрута — ПОКА КАДР ЕЩЁ ЛЕТИТ.
 *
 * Ждать конца ломаной нельзя: у самой цели пролёт идёт накатом и почти
 * останавливается, а следующий перегон трогает его с места заново. Трейлер из
 * такого выходит пульсирующим. Маршрут поэтому продлевается заранее, и кадр не
 * знает, что перегон сменился.
 */
function extendTrailerRoute(camera: RuntimeCamera, world: World, ts: CinematicCameraState): void {
  const tail = ts.path[ts.path.length - 1];
  const fromX = tail ? tail[0] : camera.free.x;
  const fromY = tail ? tail[1] : camera.free.y;
  const visited = trailerVisitedRooms.get(camera) ?? [];
  const target = findTrailerTarget(world, fromX, fromY, visited);
  if (!target) return;
  const landed = nearestCameraSpot(world, target.x, target.y);
  // Комната записывается в память СРАЗУ, а не по прибытии. Дороги к ней может и
  // не оказаться — запечённое дерево не выходит из запертых и отрезанных объёмов, —
  // и без этой записи следующий кадр выбирал бы ту же лучшую по оценке комнату
  // снова и снова. Замерено на министерстве: кадр стоял пятую часть времени,
  // раз за разом упираясь в один и тот же недостижимый зал.
  rememberTrailerRoom(camera, world, landed.x, landed.y);
  const leg = cameraRouteWaypoints(
    world,
    world.wrap(Math.floor(fromX)),
    world.wrap(Math.floor(fromY)),
    Math.floor(landed.x),
    Math.floor(landed.y),
  );
  if (!leg.length) return;
  leg.push([landed.x, landed.y]);
  for (const node of leg) ts.path.push(node);
  // Пройденный хвост срезается: меню живёт часами, и без этого ломаная растёт
  // без потолка, а вместе с ней — перебор остатка на каждом кадре.
  ts.path.splice(0, ts.targetNodeIndex);
  ts.targetNodeIndex = 0;
}

export function updateTrailerCamera(camera: RuntimeCamera, world: World, dt: number): void {
  if (camera.mode !== 'trailer' || !camera.cinematic) return;
  const ts = camera.cinematic;
  /* Порог не подобран, а выведен: перегон дописывается раньше, чем пролёт войдёт
   * в накат (`flySpeed / CINEMATIC_ORBIT_EASE`) и раньше, чем кончится то, что
   * кадр уже держит в прицеле (упреждение курса). */
  const left = routeRemainingLength(camera, world, ts);
  const refill = ts.flySpeed / CINEMATIC_ORBIT_EASE + CINEMATIC_LOOKAHEAD;
  // Дороги может и не найтись — кадр в запертом объёме, комнаты не подошли. Тогда
  // он стоит и дышит, а не летит сквозь бетон: следующий кадр попробует снова.
  if (left < refill) extendTrailerRoute(camera, world, ts);
  flyCinematicFrame(camera, world, ts, dt);
}

export function updateRuntimeCamera(camera: RuntimeCamera, world: World, dt: number, subject?: CameraSubject): void {
  const deathCamera = deathCameraStates.get(camera);
  if (camera.mode === 'death' && deathCamera) updateDeathCamera(deathCamera, world, dt);
  if (camera.mode === 'player' && subject) updatePlayerCameraBob(camera.bob, world, subject, dt);
  if (camera.mode === 'trailer') updateTrailerCamera(camera, world, dt);
  if (camera.mode === 'cinematic') updateCinematicCamera(camera, world, dt);
}

export function runtimeCameraView(camera: RuntimeCamera, subject: CameraSubject, fovRadians = DEFAULT_CAMERA_FOV_RADIANS): CameraView {
  const deathCamera = deathCameraStates.get(camera);
  if (camera.mode === 'death' && deathCamera) {
    return {
      mode: 'death',
      x: deathCamera.x,
      y: deathCamera.y,
      angle: deathCameraAngle(deathCamera),
      pitch: deathCameraPitch(deathCamera),
      height: deathCamera.height,
      fovRadians,
    };
  }
  if (camera.mode === 'free' || camera.mode === 'trailer' || camera.mode === 'cinematic') {
    return { mode: camera.mode, ...camera.free, fovRadians: camera.free.fovRadians ?? fovRadians };
  }
  return {
    mode: 'player',
    x: subject.x,
    y: subject.y,
    angle: subject.angle,
    pitch: subject.pitch ?? 0,
    height: playerCameraHeight(camera.bob, subject),
    fovRadians,
  };
}

function createCameraBobState(): CameraBobState {
  return { phase: 0, amount: 0, offset: 0, lastX: 0, lastY: 0, ready: false };
}

function resetCameraBob(bob: CameraBobState): void {
  bob.phase = 0;
  bob.amount = 0;
  bob.offset = 0;
  bob.lastX = 0;
  bob.lastY = 0;
  bob.ready = false;
}

function updatePlayerCameraBob(bob: CameraBobState, world: World, subject: CameraSubject, dt: number): void {
  const sx = wrapCoord(subject.x);
  const sy = wrapCoord(subject.y);
  if (!bob.ready || dt <= 0) {
    bob.lastX = sx;
    bob.lastY = sy;
    bob.ready = true;
    return;
  }

  const dx = world.delta(bob.lastX, sx);
  const dy = world.delta(bob.lastY, sy);
  const dist = Math.sqrt(dx * dx + dy * dy);
  bob.lastX = sx;
  bob.lastY = sy;

  if (dist > CAMERA_BOB_TELEPORT_DIST || subject.alive === false) {
    bob.amount = approach(bob.amount, 0, CAMERA_BOB_FALL, dt);
    bob.offset = approach(bob.offset, 0, CAMERA_BOB_OFFSET_RATE, dt);
    return;
  }

  const speed = dist / Math.max(0.001, dt);
  const speedFrac = Math.min(1, speed / CAMERA_BOB_FULL_SPEED);
  const target = dist > CAMERA_BOB_MIN_MOVE ? speedFrac * speedFrac : 0;
  bob.amount = approach(bob.amount, target, target > bob.amount ? CAMERA_BOB_RISE : CAMERA_BOB_FALL, dt);
  if (target > 0 || bob.amount > 0.001) {
    bob.phase = (bob.phase + dt * CAMERA_BOB_STEP_RATE) % (Math.PI * 2);
  }
  if (bob.amount < 0.0005) bob.amount = 0;
  bob.offset = approach(bob.offset, Math.sin(bob.phase) * CAMERA_BOB_HEIGHT * bob.amount, CAMERA_BOB_OFFSET_RATE, dt);
}

function approach(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return current + (target - current) * t;
}

function playerCameraHeight(bob: CameraBobState, subject?: CameraSubject): number {
  let baseHeight = CAMERA_STANDING_HEIGHT;
  if (subject && subject.height !== undefined) {
    baseHeight = CAMERA_STANDING_HEIGHT * (subject.height / 1.8);
  }
  return baseHeight + bob.offset;
}

function createDeathCameraState(px: number, py: number, pAngle: number, random: () => number): DeathCameraState {
  const spreadAngle = pAngle + (random() - 0.5) * Math.PI * 0.8;
  const launchSpeed = 2.0 + random() * 2.5;
  const tilt = -0.3;
  const h = Math.sqrt(1 - tilt * tilt);

  return {
    x: wrapCoord(px),
    y: wrapCoord(py),
    vx: Math.cos(spreadAngle) * launchSpeed,
    vy: Math.sin(spreadAngle) * launchSpeed,
    height: CAMERA_STANDING_HEIGHT,
    fx: Math.cos(pAngle) * h,
    fy: Math.sin(pAngle) * h,
    fz: tilt,
    prevYaw: pAngle,
    timer: 0,
    active: true,
  };
}

function rotateVec(
  vx: number, vy: number, vz: number,
  kx: number, ky: number, kz: number,
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dot = kx * vx + ky * vy + kz * vz;
  const cx = ky * vz - kz * vy;
  const cy = kz * vx - kx * vz;
  const cz = kx * vy - ky * vx;
  return [
    vx * c + cx * s + kx * dot * (1 - c),
    vy * c + cy * s + ky * dot * (1 - c),
    vz * c + cz * s + kz * dot * (1 - c),
  ];
}

function updateDeathCamera(dc: DeathCameraState, world: World, dt: number): void {
  if (!dc.active) return;
  dc.timer += dt;

  if (dc.height > CAMERA_DEATH_FLOOR_HEIGHT) {
    dc.height = Math.max(CAMERA_DEATH_FLOOR_HEIGHT, dc.height - DEATH_DROP_SPEED * dt);
  }

  const speed = Math.sqrt(dc.vx * dc.vx + dc.vy * dc.vy);
  if (speed < 0.04 && dc.timer > 0.5) {
    dc.vx = 0;
    dc.vy = 0;
    return;
  }

  const decay = Math.pow(DEATH_FRICTION, dt);
  dc.vx *= decay;
  dc.vy *= decay;

  if (speed > 0.01) {
    const ax = -dc.vy / speed;
    const ay = dc.vx / speed;
    const theta = (speed * dt) / DEATH_BALL_RADIUS;
    const [nx, ny, nz] = rotateVec(dc.fx, dc.fy, dc.fz, ax, ay, 0, theta);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    dc.fx = nx / len;
    dc.fy = ny / len;
    dc.fz = nz / len;
  }

  const wxO = Math.floor(wrapCoord(dc.x));
  const wyO = Math.floor(wrapCoord(dc.y));
  let hitX = false;
  let hitY = false;

  const offX = dc.vx > 0 ? DEATH_BALL_RADIUS : -DEATH_BALL_RADIUS;
  const offY = dc.vy > 0 ? DEATH_BALL_RADIUS : -DEATH_BALL_RADIUS;
  const nxPos = dc.x + dc.vx * dt;
  const nyPos = dc.y + dc.vy * dt;

  const cxCheck = Math.floor(wrapCoord(nxPos + offX));
  if (world.solid(cxCheck, wyO)) {
    dc.vx = -dc.vx * DEATH_BOUNCE;
    hitX = true;
  }

  const cyCheck = Math.floor(wrapCoord(nyPos + offY));
  if (world.solid(wxO, cyCheck)) {
    dc.vy = -dc.vy * DEATH_BOUNCE;
    hitY = true;
  }

  if (!hitX && !hitY) {
    const cxD = Math.floor(wrapCoord(nxPos + offX));
    const cyD = Math.floor(wrapCoord(nyPos + offY));
    if (world.solid(cxD, cyD)) {
      dc.vx = -dc.vx * DEATH_BOUNCE;
      dc.vy = -dc.vy * DEATH_BOUNCE;
    }
  }

  dc.x = wrapCoord(dc.x + dc.vx * dt);
  dc.y = wrapCoord(dc.y + dc.vy * dt);
}

function deathCameraAngle(dc: DeathCameraState): number {
  const raw = Math.atan2(dc.fy, dc.fx);
  const xyLen = Math.sqrt(dc.fx * dc.fx + dc.fy * dc.fy);
  const t = Math.min(1, xyLen / 0.4);
  let diff = raw - dc.prevYaw;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  dc.prevYaw += diff * t;
  return dc.prevYaw;
}

function deathCameraPitch(dc: DeathCameraState): number {
  return clampPitch(dc.fz);
}
