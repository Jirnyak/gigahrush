/* ── Runtime camera controller ────────────────────────────────── */
/* Camera modes are visual runtime state. They resolve to a small
 * CameraView for render; they do not mutate gameplay ownership. */

import { W } from '../core/types';
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

export interface TrailerCameraState {
  path: number[];
  targetNodeIndex: number;
  active: boolean;
  time: number;
  angleTarget: number;
  flySpeed: number;
}

export interface CinematicCameraState {
  path: number[][];
  targetNodeIndex: number;
  active: boolean;
  time: number;
  angleTarget: number;
  flySpeed: number;
  /* Режиссёрские поля. Без них поведение прежнее: камера летит по курсу
   * взгляда и возвращается к игроку, исчерпав путь. */
  /** Точка внимания. Задана — камера смотрит на неё, а летит куда ведёт путь. */
  lookAtX?: number;
  lookAtY?: number;
  /** Облёт вокруг точки внимания. Позиция считается аналитически, путь не нужен. */
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitPhase?: number;
  /** Целевая высота, к которой камера подходит плавно. */
  heightTarget?: number;
  /** Исчерпав путь, держать позу вместо возврата к игроку. Владелец сцены решает, когда отпустить. */
  hold?: boolean;
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
  trailer?: TrailerCameraState;
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
const CINEMATIC_TURN_RATE = 6.0;
const CINEMATIC_BREATH_HEIGHT = 0.15;
const CINEMATIC_BREATH_PITCH = 0.1;
/* Допуск на узел маршрута и потолок субшагов за кадр: шаг крупнее допуска —
 * и камера начинает срезать углы по хорде, то есть лететь сквозь простенки. */
const CINEMATIC_NODE_REACH = 0.5;
const CINEMATIC_MAX_SUBSTEPS = 64;

const DEATH_BALL_RADIUS = 0.2;
const DEATH_FRICTION = 0.65;
const DEATH_BOUNCE = 0.45;
const DEATH_DROP_SPEED = 4.0;
const deathCameraStates = new WeakMap<RuntimeCamera, DeathCameraState>();

function wrapCoord(value: number): number {
  return ((value % W) + W) % W;
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
      ts.orbitPhase = aim.orbit.phase ?? ts.orbitPhase ?? 0;
    }
  }
  if (aim.height !== undefined) ts.heightTarget = clampHeight(aim.height);
  if (aim.flySpeed !== undefined) ts.flySpeed = Math.max(0, aim.flySpeed);
  if (aim.hold !== undefined) ts.hold = aim.hold;
  if (aim.angle !== undefined) camera.free.angle = aim.angle;
}

/** Проложить новый маршрут для той же сцены. Курсор узлов сбрасывается, прицел сохраняется. */
export function setCinematicCameraPath(camera: RuntimeCamera, waypoints: number[][]): void {
  const ts = camera.cinematic;
  if (!ts) return;
  ts.path = waypoints;
  ts.targetNodeIndex = 0;
}

/**
 * Проложить маршрут ПО ПРОХОДИМЫМ КЛЕТКАМ. Пути этажа и так запечены, и лететь
 * сквозь бетон незачем: зритель должен видеть дорогу, а не изнанку стен.
 * Если прохода нет вовсе, остаётся прямая — пустой кадр хуже короткого сквозняка.
 */
export function routeCinematicCamera(camera: RuntimeCamera, world: World, tx: number, ty: number): void {
  const ts = camera.cinematic;
  if (!ts) return;
  const nodes = bfsPath(world, Math.floor(camera.free.x), Math.floor(camera.free.y), Math.floor(tx), Math.floor(ty));
  const waypoints: number[][] = nodes.map(node => subcellToWorld(node) as unknown as number[]);
  waypoints.push([tx, ty]);
  setCinematicCameraPath(camera, waypoints);
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
  let guard = CINEMATIC_MAX_SUBSTEPS;
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
    if (dist < CINEMATIC_NODE_REACH) {
      ts.targetNodeIndex++;
      continue;
    }
    ts.angleTarget = Math.atan2(dy, dx);
    const step = Math.min(budget, CINEMATIC_NODE_REACH, dist);
    const nx = wrapCoord(camera.free.x + (dx / dist) * step);
    const ny = wrapCoord(camera.free.y + (dy / dist) * step);
    if (!world.solid(Math.floor(nx), Math.floor(ny))) {
      camera.free.x = nx;
      camera.free.y = ny;
      budget -= step;
      continue;
    }
    if (!routeless) {
      ts.targetNodeIndex++;
      continue;
    }
    // Стена на прямой: разъезжаемся по осям, чтобы обогнуть её, а не пройти насквозь.
    const slidX = wrapCoord(camera.free.x + (dx / dist) * step);
    const slidY = wrapCoord(camera.free.y + (dy / dist) * step);
    let moved = false;
    if (!world.solid(Math.floor(slidX), Math.floor(camera.free.y))) { camera.free.x = slidX; moved = true; }
    if (!world.solid(Math.floor(camera.free.x), Math.floor(slidY))) { camera.free.y = slidY; moved = true; }
    budget -= step;
    if (!moved) break; // упёрлись в тупик; такт закроется по своему таймауту
  }
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
  return ts.targetNodeIndex >= ts.path.length;
}

export function updateCinematicCamera(camera: RuntimeCamera, world: World, dt: number): void {
  if (camera.mode !== 'cinematic' || !camera.cinematic) return;
  const ts = camera.cinematic;
  ts.time += dt;
  const directed = ts.lookAtX !== undefined && ts.lookAtY !== undefined;

  // Облёт: позиция вокруг точки внимания считается аналитически, маршрут не нужен.
  // Радиус поджимается, пока точка не окажется в проходимой клетке: круг шире
  // комнаты иначе уводил бы оператора в бетон на каждом втором обороте.
  if (directed && ts.orbitRadius !== undefined && ts.orbitSpeed !== undefined) {
    ts.orbitPhase = (ts.orbitPhase ?? 0) + ts.orbitSpeed * dt;
    const cos = Math.cos(ts.orbitPhase);
    const sin = Math.sin(ts.orbitPhase);
    // Радиус поджимается до первой проходимой клетки. Если свободной нет вовсе
    // (актёры прижаты к стене, и весь сектор круга в бетоне) — кадр остаётся на
    // прежнем месте: замереть на секунду честнее, чем уехать внутрь простенка.
    let placed = false;
    for (let radius = ts.orbitRadius; radius >= CINEMATIC_NODE_REACH; radius -= CINEMATIC_NODE_REACH) {
      const ox = wrapCoord(ts.lookAtX! + cos * radius);
      const oy = wrapCoord(ts.lookAtY! + sin * radius);
      if (world.solid(Math.floor(ox), Math.floor(oy))) continue;
      camera.free.x = ox;
      camera.free.y = oy;
      placed = true;
      break;
    }
    if (!placed && !world.solid(Math.floor(ts.lookAtX!), Math.floor(ts.lookAtY!))) {
      camera.free.x = ts.lookAtX!;
      camera.free.y = ts.lookAtY!;
    }
    applyCinematicGaze(camera, world, ts, dt, true);
    return;
  }

  // Маршрут исчерпан: держим кадр, если сцена этого просила, иначе отдаём камеру игроку.
  if (ts.path.length === 0 || ts.targetNodeIndex >= ts.path.length) {
    if (!ts.hold) {
      camera.mode = 'player';
      return;
    }
    applyCinematicGaze(camera, world, ts, dt, directed);
    return;
  }

  if (directed) {
    flyAlongRoute(camera, world, ts, dt);
    if (ts.targetNodeIndex >= ts.path.length && !ts.hold) {
      camera.mode = 'player';
      return;
    }
    applyCinematicGaze(camera, world, ts, dt, true);
    return;
  }

  let courseAngle = ts.angleTarget;
  while (ts.targetNodeIndex < ts.path.length) {
    const waypoint = ts.path[ts.targetNodeIndex];
    const dx = world.delta(camera.free.x, waypoint[0]);
    const dy = world.delta(camera.free.y, waypoint[1]);
    if (dx * dx + dy * dy < 0.64) {
      ts.targetNodeIndex++;
    } else {
      courseAngle = Math.atan2(dy, dx);
      ts.angleTarget = courseAngle;
      break;
    }
  }

  if (ts.targetNodeIndex >= ts.path.length) {
    if (!ts.hold) {
      camera.mode = 'player';
      return;
    }
    applyCinematicGaze(camera, world, ts, dt, directed);
    return;
  }

  // Без точки внимания камера летит туда, куда смотрит — прежнее поведение трейлерного пролёта.
  // С точкой внимания курс и взгляд разъезжаются: летим по маршруту, смотрим на актёров.
  const heading = directed ? courseAngle : camera.free.angle;
  const nx = wrapCoord(camera.free.x + Math.cos(heading) * ts.flySpeed * dt);
  const ny = wrapCoord(camera.free.y + Math.sin(heading) * ts.flySpeed * dt);
  // Маршрут проложен по проходимым клеткам, но между узлами камера идёт по хорде
  // и на поворотах срезает угол сквозь простенок. По осям разъезжаемся отдельно:
  // тогда срезанный угол превращается в скольжение вдоль стены, а не в проход через неё.
  // Между узлами камера идёт свободно. Маршрут уже проложен по проходимым клеткам,
  // и этого достаточно: попытка ещё и тереться о стены давала залипание в простенках
  // и растягивала пролёт втрое. Остаются лишь микросрезы угла на поворотах.
  camera.free.x = nx;
  camera.free.y = ny;
  applyCinematicGaze(camera, world, ts, dt, directed);
}

/** Взгляд, высота и наклон кадра. Наклон выводится из геометрии, а не из подобранного числа. */
function applyCinematicGaze(
  camera: RuntimeCamera,
  world: World,
  ts: CinematicCameraState,
  dt: number,
  directed: boolean,
): void {
  // Режется итоговая высота, а не план: иначе верхняя точка покачивания упиралась
  // бы в плиту ровно на зазор, и кадр всё равно «висел под потолком».
  const wanted = (ts.heightTarget ?? CAMERA_STANDING_HEIGHT) + Math.sin(ts.time * 0.7) * CINEMATIC_BREATH_HEIGHT;
  camera.free.height = ceilingLimitedHeight(world, camera.free.x, camera.free.y, wanted);

  if (!directed) {
    turnToward(camera, ts.angleTarget, dt);
    camera.free.pitch = Math.sin(ts.time * 1.1) * CINEMATIC_BREATH_PITCH;
    return;
  }

  const dx = world.delta(camera.free.x, ts.lookAtX!);
  const dy = world.delta(camera.free.y, ts.lookAtY!);
  turnToward(camera, Math.atan2(dy, dx), dt);

  // Экранное смещение точки высоты h на дистанции d равно (camHeight - h) / d в долях экрана,
  // а pitch задан в тех же долях (webgl.ts horizonShift). Положительный pitch поднимает взгляд,
  // поэтому камера выше цели наклоняется вниз.
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  camera.free.pitch = clampPitch((CAMERA_STANDING_HEIGHT - camera.free.height) / dist);
}

function turnToward(camera: RuntimeCamera, target: number, dt: number): void {
  let diff = target - camera.free.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  camera.free.angle += diff * Math.min(1, dt * CINEMATIC_TURN_RATE);
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
  camera.trailer = {
    path: [],
    targetNodeIndex: 0,
    active: true,
    time: 0,
    angleTarget: 0,
    flySpeed: 2.5,
  };
}

function findNewTrailerTarget(world: World, cx: number, cy: number): { x: number; y: number } | null {
  for (let i = 0; i < 50; i++) {
    const rx = Math.floor(rng() * W);
    const ry = Math.floor(rng() * W);
    if (!world.solid(rx, ry)) {
      const dx = world.delta(cx, rx);
      const dy = world.delta(cy, ry);
      if (Math.sqrt(dx * dx + dy * dy) > 10) return { x: rx, y: ry };
    }
  }
  return null;
}

export function updateTrailerCamera(camera: RuntimeCamera, world: World, dt: number): void {
  if (camera.mode !== 'trailer' || !camera.trailer) return;
  const ts = camera.trailer;
  ts.time += dt;
  ts.flySpeed = CINEMATIC_FLY_SPEED; // Cinematic flight (not too fast to avoid wide orbits)

  // Path navigation
  if (ts.path.length === 0 || ts.targetNodeIndex >= ts.path.length) {
    const target = findNewTrailerTarget(world, camera.free.x, camera.free.y);
    if (target) {
      ts.path = bfsPath(world, camera.free.x, camera.free.y, target.x, target.y);
      ts.targetNodeIndex = 0;
    } else {
      ts.path = [];
    }
  }

  // Follow the path
  while (ts.targetNodeIndex < ts.path.length) {
    const [tx, ty] = subcellToWorld(ts.path[ts.targetNodeIndex]);
    const dx = world.delta(camera.free.x, tx);
    const dy = world.delta(camera.free.y, ty);
    const dist2 = dx * dx + dy * dy;
    
    if (dist2 < 0.64) {
      // Consume the node if we are within 0.8 units radius. This tight radius prevents corner cutting
      // and forces the camera to naturally stay in the center of corridors.
      ts.targetNodeIndex++;
    } else {
      // Calculate required angle to the next valid node
      ts.angleTarget = Math.atan2(dy, dx);
      break;
    }
  }

  // Calculate forward velocity based on camera's current viewing angle
  let vx = Math.cos(camera.free.angle) * ts.flySpeed * dt;
  let vy = Math.sin(camera.free.angle) * ts.flySpeed * dt;
  
  const nx = wrapCoord(camera.free.x + vx);
  const ny = wrapCoord(camera.free.y + vy);

  // Noclip: directly apply velocity without solid checks
  camera.free.x = nx;
  camera.free.y = ny;

  // Smoothly interpolate angle (fast enough to not overshoot tight corners)
  turnToward(camera, ts.angleTarget, dt);

  // Cinematic bob and pitch
  camera.free.height = CAMERA_STANDING_HEIGHT + Math.sin(ts.time * 0.7) * CINEMATIC_BREATH_HEIGHT;
  camera.free.pitch = Math.sin(ts.time * 1.1) * CINEMATIC_BREATH_PITCH;
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
