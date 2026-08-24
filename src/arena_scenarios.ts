/* ── AI-стенд: детерминированные сценарии ─────────────────────────
 *
 * Dev-only. Один и тот же набор сцен питает браузерный стенд (arena.html)
 * и безголовый прогон (scripts/arena-bench.ts): числа сравнимы напрямую.
 *
 * Каждая сцена воспроизводит ОДНУ жалобу владельца:
 *   corridor    — слипание и пробка в узком месте
 *   furnished   — застревание об углы, анизотропия шага вдоль стены
 *   unreachable — бесконечная пересборка маршрута к недостижимой цели
 *   torus_seam  — голое вычитание координат вместо world.delta
 *   open_field  — чистая изотропия и потеря боевой цели в открытом поле
 *   floor:<id>  — интегральный замер на настоящем дизайн-этаже
 *
 * Ловушка, найденная при разборе стенда: старые пресеты адресовали клетки
 * как `(y + ARENA_OFFSET) * W + (x + ARENA_OFFSET)` при ARENA_OFFSET === W.
 * Такой индекс всегда ≥ W*W, запись в типизированный массив за границей
 * молча теряется — стены НИ ОДНОГО пресета не появлялись, монстр всё это
 * время бегал по пустому полю. Здесь всё адресуется через world.idx(),
 * который заворачивает координаты по тору.
 */

import { Cell, DoorState, EntityType, AIGoal, Faction, MonsterKind, type Entity, type GameState } from './core/types';
import { W } from './core/types';
import { World } from './core/world';
import { seedGlobalRng, seededRandom } from './core/rand';
import { clearPathBlockersAtCell, setPathBlockerRow, PATH_BLOCKER_SUBDIV } from './core/path_blockers';
import { applyMapEditorOp } from './systems/map_editor';
import { tryAssignPathToCell } from './systems/ai/pathfinding';
import { generateDesignFloor } from './gen/design_floors/manifest';
import type { DesignFloorId } from './data/design_floors';
import type { ArenaMetrics } from './arena_metrics';

/* Начало координат синтетических сцен. Подальше от шва, чтобы шов ловила
 * только та сцена, которая для него и заведена. */
export const ARENA_ORIGIN = 256;
/* Начало координат легаси-пресетов стенда — оно же ноль тора. */
export const ARENA_OFFSET = 1024;

/** Актор считается дошедшим, если он ближе этого к назначенной точке. */
const DRIVER_ARRIVE = 1.2;
/** Сколько секунд терпим, что AI увёл актора со своей точки, прежде чем вернуть. */
const DRIVER_GRACE = 1.5;
const DRIVER_DRIFT2 = 0.25;

export interface ArenaScene {
  world: World;
  entities: Entity[];
  nextId: { v: number };
  driver: DrivenActor[];
  camX: number;
  camY: number;
  zoom: number;
  title: string;
}

export interface DrivenActor {
  id: number;
  ax: number; ay: number;
  bx: number; by: number;
  toB: boolean;
  driftT: number;
}

export interface ScenarioDef {
  id: string;
  title: string;
  build(seed: number): ArenaScene;
}

/* ── Примитивы построения ─────────────────────────────────────── */

function blankState(): GameState {
  return { currentZ: 0, time: 0 } as GameState;
}

/**
 * Минимальный, но рабочий GameState для стенда: updateAI читает часы,
 * ленту событий и состояние A-Life. Литерал общий для браузерного стенда
 * и безголового прогона, иначе они разъедутся и числа перестанут сравниваться.
 */
export function createArenaGameState(): GameState {
  return {
    tick: 0,
    time: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 0 },
    samosborActive: false,
    samosborTimer: 999999,
    samosborCount: 0,
    paused: false,
    gameOver: false,
    showInventory: false,
    mapMode: 0,
    showQuests: false,
    invSel: 0,
    msgs: [],
    quests: [],
    nextQuestId: 1,
    currentZ: 0,
    showMenu: false,
    menuSel: 0,
    showNpcMenu: false,
    npcMenuSel: 0,
    npcMenuTarget: 0,
    npcMenuTab: 'main',
    npcTalkText: '',
    questPage: 0,
    tradeCursorX: 0,
    tradeCursorY: 0,
    tradeSide: 'player',
    showContainerMenu: false,
    containerMenuTarget: 0,
    containerCursorX: 0,
    containerCursorY: 0,
    containerSide: 'player',
    showCraftMenu: false,
    craftMode: 'craft',
    craftCursor: 0,
    craftFilter: '',
    craftStationKind: 'any',
    showDebug: false,
    debugSel: 0,
    showFactions: false,
    factionRankScroll: 0,
    showDemos: false,
    showFeedback: false,
    demosCursor: 0,
    demosSearch: '',
    demosSearchActive: false,
    demosTab: 'profile',
    demosFeedScroll: 0,
    demosPostCursor: 0,
    showLog: false,
    logScroll: 0,
    showHelp: false,
    showControls: false,
    controlView: 'keys',
    controlSel: 0,
    controlScroll: 0,
    showUiSettings: false,
    uiSettingsView: 'interface',
    uiSettingsSel: 0,
    uiSettingsScroll: 0,
    showMapLegend: false,
    mapLegendSel: 0,
    mapLegendScroll: 0,
    msgLog: [],
    dmgFlash: 0,
    dmgSeed: 0,
    deathTimer: 0,
    sleeping: false,
    beamFx: 0,
    beamAngle: 0,
    beamLen: 0,
    uvBeamFx: 0,
    uvBeamLen: 0,
    gameWon: false,
    crafting: { knownRecipeIds: [], materialCount: {} },
    worldEvents: {
      nextId: 1,
      recentEvents: { capacity: 100, start: 0, count: 0, items: new Array(100).fill(null) },
      importantEvents: { capacity: 100, start: 0, count: 0, items: new Array(100).fill(null) },
      zoneEvents: [],
      facts: [],
      nextFactId: 1,
      lastLogKey: '',
      lastLogTime: 0,
    },
  } as unknown as GameState;
}

function fillRect(world: World, x0: number, y0: number, w: number, h: number, cell: Cell): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(world.wrap(x0 + dx), world.wrap(y0 + dy));
      world.cells[ci] = cell;
      clearPathBlockersAtCell(world, ci);
    }
  }
}

function setCell(world: World, x: number, y: number, cell: Cell): void {
  world.cells[world.idx(world.wrap(x), world.wrap(y))] = cell;
}

/** Пустой мир: сплошная стена и вырезанная под сцену коробка. */
function blankWorld(x0: number, y0: number, w: number, h: number): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let i = 0; i < W * W; i++) clearPathBlockersAtCell(world, i);
  fillRect(world, x0, y0, w, h, Cell.FLOOR);
  world.cellVersion++;
  return world;
}

function spawn(scene: ArenaScene, x: number, y: number, kind: 'npc' | 'monster', monsterKind = MonsterKind.SBORKA): Entity | null {
  const before = scene.entities.length;
  const dummy = { id: 0, x: 0, y: 0 } as Entity;
  applyMapEditorOp(scene.world, scene.entities, dummy, blankState(), scene.nextId, {
    kind: 'spawn_entity', x, y,
    entityDef: kind === 'monster' ? { kind: 'monster', monsterKind } : { kind: 'npc', faction: Faction.CITIZEN },
  }, false);
  return scene.entities.length > before ? scene.entities[scene.entities.length - 1] : null;
}

function drive(scene: ArenaScene, e: Entity | null, ax: number, ay: number, bx: number, by: number): void {
  if (!e || !e.ai) return;
  scene.driver.push({ id: e.id, ax, ay, bx, by, toB: true, driftT: 0 });
  e.ai.goal = AIGoal.GOTO;
  tryAssignPathToCell(scene.world, e, bx, by);
}

function newScene(world: World, title: string, camX: number, camY: number, zoom = 16): ArenaScene {
  return { world, entities: [], nextId: { v: 1 }, driver: [], camX, camY, zoom, title };
}

/* ── Драйвер целей ───────────────────────────────────────────────
 * NPC-FSM и монстрятник переписывают ai.goal под свои нужды — внешняя
 * точка назначения не переживает и одного такта. Драйвер возвращает
 * актору его точку, но ТОЛЬКО когда тот дошёл либо когда AI держит
 * чужую цель дольше DRIVER_GRACE. Каждый такой возврат считается
 * отдельной метрикой: «сколько раз в минуту AI бросил задание». */
export function stepDriver(scene: ArenaScene, dt: number, metrics?: ArenaMetrics): void {
  if (scene.driver.length === 0) return;
  const byId = new Map<number, Entity>();
  for (const e of scene.entities) if (e.alive && e.ai) byId.set(e.id, e);

  for (const d of scene.driver) {
    const e = byId.get(d.id);
    if (!e || !e.ai) continue;
    const tx = d.toB ? d.bx : d.ax;
    const ty = d.toB ? d.by : d.ay;
    const world = scene.world;

    if (world.dist2(e.x, e.y, tx, ty) <= DRIVER_ARRIVE * DRIVER_ARRIVE) {
      d.toB = !d.toB;
      d.driftT = 0;
      e.ai.goal = AIGoal.GOTO;
      tryAssignPathToCell(world, e, d.toB ? d.bx : d.ax, d.toB ? d.by : d.ay);
      continue;
    }

    if (world.dist2(e.ai.tx, e.ai.ty, tx, ty) <= DRIVER_DRIFT2) { d.driftT = 0; continue; }
    d.driftT += dt;
    if (d.driftT < DRIVER_GRACE) continue;
    d.driftT = 0;
    e.ai.goal = AIGoal.GOTO;
    tryAssignPathToCell(world, e, tx, ty);
    metrics?.noteDriverOverride();
  }
}

/* ── Сцены ───────────────────────────────────────────────────────── */

/** Длинный узкий проход с однклеточной перемычкой и залами по краям. */
function buildCorridor(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = blankWorld(O - 1, O - 1, 54, 14);
  // Всё стена, кроме двух залов и коридора между ними.
  fillRect(world, O - 1, O - 1, 54, 14, Cell.WALL);
  fillRect(world, O, O, 10, 12, Cell.FLOOR);          // зал A
  fillRect(world, O + 42, O, 10, 12, Cell.FLOOR);     // зал B
  fillRect(world, O + 10, O + 5, 32, 2, Cell.FLOOR);  // коридор в две клетки
  fillRect(world, O + 25, O + 5, 1, 2, Cell.WALL);
  /* Перемычка в одну дверь — и обязательно С ЗАПИСЬЮ в реестре. Без записи
   * `world.solid` держит дверную клетку сплошной НАВСЕГДА, открыть и сломать её
   * нечем, а навигация её проходимой считает. Так эта сцена и стояла: её
   * единственный проход между залами был фантомом, то есть коробка была
   * запечатана наглухо, и все снятые с неё числа описывали мир, из которого
   * нельзя выйти. Замок на класс — `tests/phantom-doors.test.ts`. */
  const doorIdx = world.idx(O + 25, O + 5);
  setCell(world, O + 25, O + 5, Cell.DOOR);
  world.doors.set(doorIdx, {
    idx: doorIdx, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0,
  });
  world.cellVersion++;

  const scene = newScene(world, 'Коридор: пробка в двери', O + 26, O + 6, 14);
  for (let i = 0; i < 12; i++) {
    const fromA = i % 2 === 0;
    const row = Math.floor(i / 2);
    const sx = fromA ? O + 2 + (row % 3) : O + 47 - (row % 3);
    const sy = O + 1 + row * 2;
    const e = spawn(scene, sx, sy, 'npc');
    drive(scene, e, sx + 0.5, sy + 0.5, fromA ? O + 47.5 : O + 2.5, O + 5.5);
  }
  return scene;
}

/* Комната с мебелью строится ОДНОЙ геометрией под два населения: жителей и
 * монстров. Разведка утверждает, что страховка от залипания работает только
 * для NPC — проверять это можно лишь на одинаковых углах и одинаковом сиде. */
function buildFurnishedWith(seed: number, kind: 'npc' | 'monster'): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = blankWorld(O, O, 24, 24);
  const rand = seededRandom(seed ^ 0x51ed);
  for (let k = 0; k < 18; k++) {
    const x = O + 2 + Math.floor(rand() * 20);
    const y = O + 2 + Math.floor(rand() * 20);
    setCell(world, x, y, Cell.WALL);
    // Тонкая мебель рядом с колонной — только подклеточный блокер.
    const ci = world.idx(world.wrap(x + 1), world.wrap(y));
    setPathBlockerRow(world, ci, 1, 0b1111);
    setPathBlockerRow(world, ci, 2, 0b1111);
  }
  world.cellVersion++;

  const who = kind === 'npc' ? 'жители' : 'монстры';
  const scene = newScene(world, `Комната с мебелью: углы и стены (${who})`, O + 12, O + 12, 20);
  for (let i = 0; i < 10; i++) {
    const sx = O + 1 + (i % 2 === 0 ? 0 : 22);
    const sy = O + 2 + i * 2;
    const e = spawn(scene, sx, sy, kind);
    drive(scene, e, sx + 0.5, sy + 0.5, O + (i % 2 === 0 ? 22.5 : 1.5), O + 22.5 - i * 2);
  }
  return scene;
}

const buildFurnished = (seed: number) => buildFurnishedWith(seed, 'npc');
const buildFurnishedMonsters = (seed: number) => buildFurnishedWith(seed, 'monster');

/** Открытая яма: монстры охотятся на жителей — потеря цели и слепота в бою. */
function buildCombatPit(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = blankWorld(O, O, 32, 32);
  const scene = newScene(world, 'Яма: бой в открытом поле', O + 16, O + 16, 14);
  const kinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.ZOMBIE, MonsterKind.POLZUN];
  for (let i = 0; i < 12; i++) spawn(scene, O + 3 + (i % 6) * 5, O + 4 + Math.floor(i / 6) * 3, 'monster', kinds[i % kinds.length]);
  for (let i = 0; i < 6; i++) {
    const sx = O + 4 + i * 4;
    const sy = O + 27;
    const e = spawn(scene, sx, sy, 'npc');
    drive(scene, e, sx + 0.5, sy + 0.5, O + 27.5 - i * 4, O + 27.5);
  }
  return scene;
}

/** Две запечатанные коробки: цель физически недостижима. */
function buildUnreachable(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let i = 0; i < W * W; i++) clearPathBlockersAtCell(world, i);
  fillRect(world, O, O, 8, 8, Cell.FLOOR);            // коробка A
  fillRect(world, O + 12, O, 8, 8, Cell.FLOOR);       // коробка B, стена между ними
  world.cellVersion++;

  const scene = newScene(world, 'Недостижимая цель: две коробки', O + 10, O + 4, 20);
  for (let i = 0; i < 4; i++) {
    const sx = O + 1 + i;
    const sy = O + 1 + i;
    const e = spawn(scene, sx, sy, 'npc');
    // Точка A и точка B обе в чужой коробке — драйвер не даст «дойти» никогда.
    drive(scene, e, O + 13.5, O + 2.5, O + 18.5, O + 6.5);
  }
  return scene;
}

/** Полоса, лежащая поперёк шва тора: актор у W−1, цель у 0. */
function buildTorusSeam(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let i = 0; i < W * W; i++) clearPathBlockersAtCell(world, i);
  fillRect(world, W - 16, 240, 32, 12, Cell.FLOOR);   // x: 1008..1023 и 0..15
  world.cellVersion++;

  const scene = newScene(world, 'Шов тора: цель за нулём', 0, 246, 18);
  for (let i = 0; i < 6; i++) {
    const sx = W - 4;
    const sy = 242 + i;
    const e = spawn(scene, sx, sy, 'npc');
    drive(scene, e, world.wrap(sx) + 0.5, sy + 0.5, 3.5, 246.5);
  }
  return scene;
}

/** Открытое поле без единой стены — эталон изотропии и полигон боя. */
function buildOpenField(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = blankWorld(O, O, 48, 48);
  const scene = newScene(world, 'Открытое поле: изотропия и бой', O + 24, O + 24, 12);
  const rand = seededRandom(seed ^ 0x0f1e);
  for (let i = 0; i < 16; i++) {
    const sx = O + 2 + Math.floor(rand() * 44);
    const sy = O + 2 + Math.floor(rand() * 44);
    const e = spawn(scene, sx, sy, 'npc');
    drive(scene, e, sx + 0.5, sy + 0.5,
      O + 2.5 + Math.floor(rand() * 44), O + 2.5 + Math.floor(rand() * 44));
  }
  return scene;
}

/** Открытое поле БЕЗ заданий: чистая проверка изотропии самого блуждания. */
function buildOpenWander(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const O = ARENA_ORIGIN;
  const world = blankWorld(O, O, 48, 48);
  const scene = newScene(world, 'Открытое поле: свободное блуждание', O + 24, O + 24, 12);
  const rand = seededRandom(seed ^ 0x7a3d);
  // Только монстры: жители в открытом поле перебили бы их за десяток секунд,
  // и от блуждания остался бы бой. Изотропию меряем на том, кто просто ходит.
  for (let i = 0; i < 12; i++) {
    spawn(scene, O + 4 + Math.floor(rand() * 40), O + 4 + Math.floor(rand() * 40), 'monster');
  }
  return scene;
}

/* ── Легаси-пресеты стенда, починенные по адресации ──────────────── */

function legacyArena(): { world: World; scene: ArenaScene } {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let i = 0; i < W * W; i++) clearPathBlockersAtCell(world, i);
  fillRect(world, ARENA_OFFSET - 2, ARENA_OFFSET - 2, 68, 68, Cell.FLOOR);
  world.cellVersion++;
  return { world, scene: newScene(world, '', ARENA_OFFSET + 10, ARENA_OFFSET + 10, 32) };
}

export function buildEmptyCorner(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const { world, scene } = legacyArena();
  scene.title = 'Пустой угол';
  fillRect(world, ARENA_OFFSET, ARENA_OFFSET, 20, 20, Cell.WALL);
  for (let i = 5; i < 15; i++) setCell(world, ARENA_OFFSET + i, ARENA_OFFSET + 5, Cell.FLOOR);
  for (let j = 5; j < 15; j++) setCell(world, ARENA_OFFSET + 14, ARENA_OFFSET + j, Cell.FLOOR);
  world.cellVersion++;
  const e = spawn(scene, ARENA_OFFSET + 6, ARENA_OFFSET + 5, 'monster');
  drive(scene, e, ARENA_OFFSET + 6.5, ARENA_OFFSET + 5.5, ARENA_OFFSET + 14.5, ARENA_OFFSET + 14.5);
  return scene;
}

export function buildMaze(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const { world, scene } = legacyArena();
  scene.title = 'Решётка колонн';
  for (let i = 0; i < 25; i++) {
    for (let j = 0; j < 25; j++) {
      setCell(world, ARENA_OFFSET + i, ARENA_OFFSET + j, (i % 2 === 0 && j % 2 === 0) ? Cell.WALL : Cell.FLOOR);
    }
  }
  world.cellVersion++;
  const e = spawn(scene, ARENA_OFFSET + 1, ARENA_OFFSET + 1, 'monster');
  drive(scene, e, ARENA_OFFSET + 1.5, ARENA_OFFSET + 1.5, ARENA_OFFSET + 23.5, ARENA_OFFSET + 23.5);
  return scene;
}

export function buildNarrow(seed: number): ArenaScene {
  seedGlobalRng(seed);
  const { world, scene } = legacyArena();
  scene.title = 'Узкий проход с блокером';
  fillRect(world, ARENA_OFFSET, ARENA_OFFSET, 20, 20, Cell.WALL);
  for (let i = 5; i < 15; i++) setCell(world, ARENA_OFFSET + i, ARENA_OFFSET + 10, Cell.FLOOR);
  const pinch = world.idx(world.wrap(ARENA_OFFSET + 10), world.wrap(ARENA_OFFSET + 10));
  setPathBlockerRow(world, pinch, 0, (1 << PATH_BLOCKER_SUBDIV) - 1);
  setPathBlockerRow(world, pinch, PATH_BLOCKER_SUBDIV - 1, (1 << PATH_BLOCKER_SUBDIV) - 1);
  world.cellVersion++;
  const e = spawn(scene, ARENA_OFFSET + 6, ARENA_OFFSET + 10, 'monster');
  drive(scene, e, ARENA_OFFSET + 6.5, ARENA_OFFSET + 10.5, ARENA_OFFSET + 14.5, ARENA_OFFSET + 10.5);
  return scene;
}

/** Настоящий дизайн-этаж со своим населением — интегральный замер. */
export function buildFloor(floorId: string, seed: number): ArenaScene {
  seedGlobalRng(seed);
  const gen = generateDesignFloor(floorId as DesignFloorId, seed);
  const nextId = { v: gen.entities.reduce((m, e) => Math.max(m, e.id), 0) + 1 };
  let camX = W / 2;
  let camY = W / 2;
  for (let i = 0; i < gen.world.cells.length; i++) {
    if (gen.world.cells[i] === Cell.LIFT) { camX = i % W; camY = Math.floor(i / W); break; }
  }
  return {
    world: gen.world, entities: gen.entities, nextId, driver: [],
    camX, camY, zoom: 8, title: `Этаж ${floorId}`,
  };
}

export const ARENA_SCENARIOS: ScenarioDef[] = [
  { id: 'corridor', title: 'Коридор', build: buildCorridor },
  { id: 'furnished', title: 'Комната с мебелью (жители)', build: buildFurnished },
  { id: 'furnished_mon', title: 'Комната с мебелью (монстры)', build: buildFurnishedMonsters },
  { id: 'combat_pit', title: 'Яма: бой', build: buildCombatPit },
  { id: 'unreachable', title: 'Недостижимая цель', build: buildUnreachable },
  { id: 'torus_seam', title: 'Шов тора', build: buildTorusSeam },
  { id: 'open_field', title: 'Открытое поле', build: buildOpenField },
  { id: 'open_wander', title: 'Свободное блуждание', build: buildOpenWander },
  { id: 'empty_corner', title: 'Пустой угол (легаси)', build: buildEmptyCorner },
  { id: 'maze', title: 'Решётка (легаси)', build: buildMaze },
  { id: 'narrow', title: 'Узкий проход (легаси)', build: buildNarrow },
];

export function buildScenario(id: string, seed: number): ArenaScene {
  if (id.startsWith('floor:')) return buildFloor(id.slice('floor:'.length), seed);
  const def = ARENA_SCENARIOS.find(s => s.id === id);
  if (!def) throw new Error(`Нет сценария ${id}. Есть: ${ARENA_SCENARIOS.map(s => s.id).join(', ')}, floor:<id>`);
  return def.build(seed);
}

export function isWalkableCell(cell: number): boolean {
  return cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.DOOR || cell === Cell.LIFT;
}

export function actorKindLabel(e: Entity): string {
  if (e.type === EntityType.MONSTER) return 'M';
  if (e.type === EntityType.NPC) return 'N';
  return '?';
}
