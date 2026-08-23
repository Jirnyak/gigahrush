import './content';   // вторая точка входа (arena.html): без неё у самосбора нет генератора этажей
import { World } from './core/world';
import { Cell, W, EntityType, AIGoal, type Entity, MonsterKind, Faction, type GameState } from './core/types';
import { tryAssignPathToCell, setPathContext } from './systems/ai/pathfinding';
import { updateAI } from './systems/ai/index';
import { rebuildEntityIndexForSimulation } from './systems/entity_index';
import { updatePerceptionFields } from './systems/fields';
import { setPathBlockerRow, PATH_BLOCKER_SUBDIV, getPathBlockerRow, clearPathBlockersAtCell } from './core/path_blockers';
import { seedGlobalRng } from './core/rand';
import { applyMapEditorOp } from './systems/map_editor';
import { ArenaMetrics, formatReport } from './arena_metrics';
import { ARENA_SCENARIOS, buildScenario, stepDriver, isWalkableCell, createArenaGameState, type ArenaScene } from './arena_scenarios';
import { dumpAscii, snapshotActors, ActorTracer } from './arena_dump';
// ── Globals ──────────────────────────────────────────────────────────
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud') as HTMLDivElement;
let world = new World();
let entities: Entity[] = [];
let nextEntityId = 1;

let zoom = 32; // pixels per cell
let panX = W / 2;
let panY = W / 2;
let paused = true;
let currentTool = 1; // 1: Floor, 2: Wall, 3: Monster, 4: Target, 5: Blocker, 6: NPC
let showGrid = false;
let subcellBlockerActive = false;
let lastTime = performance.now();
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, W: false, A: false, S: false, D: false };
let mouseWorldX = 0;
let mouseWorldY = 0;
let mouseSubX = 0;
let mouseSubY = 0;

// Setup
seedGlobalRng(1337);
world.cells.fill(Cell.WALL);
setPathContext([], 0);

/* Игра расталкивает акторов САМА, внутри followPath (applyActorSeparation).
 * Второй расталкиватель на стороне стенда прятал реальное кучкование, поэтому
 * он выключен по умолчанию и остаётся только как ручка сравнения. */
let arenaSeparation = false;
let simTick = 0;
let metrics = new ArenaMetrics('живой стенд', 1337);
let tracer: ActorTracer | null = null;
let activeScene: ArenaScene | null = null;
let captureLeft = 0;

let traceTargetId = -1;

// Helper for UI
function updateHUD() {
  hud.innerHTML = `
    <b>AI Test Arena</b>
    FPS: ${Math.round(1000 / Math.max(1, performance.now() - lastTime))}
    Status: <span style="color:${paused ? '#f00' : '#0f0'}">${paused ? 'PAUSED' : 'PLAYING'}</span>
    Entities: ${entities.length}
    Mouse: (${mouseWorldX.toFixed(2)}, ${mouseWorldY.toFixed(2)}) sub: ${mouseSubX},${mouseSubY}
  `.replace(/\n\s+/g, '<br>');
}

function setupSidebar() {
  const tools = [0, 1, 2, 3, 6, 4, 5];
  for (const t of tools) {
    const btn = document.getElementById(`btn-tool-${t}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentTool = t;
        for (const t2 of tools) {
          document.getElementById(`btn-tool-${t2}`)?.classList.remove('active');
        }
        btn.classList.add('active');
      });
    }
  }

  document.getElementById('btn-preset-empty')?.addEventListener('click', loadPresetEmptyCorner);
  document.getElementById('btn-preset-maze')?.addEventListener('click', loadPresetMaze);
  document.getElementById('btn-preset-narrow')?.addEventListener('click', loadPresetNarrow);
  document.getElementById('btn-preset-floor')?.addEventListener('click', () => {
    const input = document.getElementById('input-floor-id') as HTMLInputElement;
    const id = input?.value || 'outer_district';
    loadPresetFloor(id);
  });
  setupMetricsSidebar();
}

function setupMetricsSidebar(): void {
  const select = document.getElementById('sel-scenario') as HTMLSelectElement | null;
  if (select) {
    for (const s of ARENA_SCENARIOS) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      select.appendChild(opt);
    }
  }
  document.getElementById('btn-scenario-load')?.addEventListener('click', () => {
    loadScenario(select?.value || 'corridor');
    paused = false;
  });
  document.getElementById('btn-metrics-reset')?.addEventListener('click', () => {
    resetMetrics(activeScene?.title ?? 'живой стенд');
  });
  document.getElementById('btn-metrics-capture')?.addEventListener('click', () => {
    const secs = Number((document.getElementById('input-capture-sec') as HTMLInputElement)?.value) || 30;
    resetMetrics(activeScene?.title ?? 'живой стенд');
    captureLeft = secs;
    paused = false;
  });
  document.getElementById('btn-metrics-now')?.addEventListener('click', () => {
    publishSummary(formatReport(metrics.report(entities)));
  });
  document.getElementById('btn-dump-ascii')?.addEventListener('click', () => {
    publishSummary(dumpAscii(world, entities, {
      cx: Math.floor(panX), cy: Math.floor(panY), w: 72, h: 34,
      focusId: tracer ? traceTargetId : undefined,
    }));
  });
  document.getElementById('btn-dump-json')?.addEventListener('click', () => {
    publishSummary(JSON.stringify(snapshotActors(entities, simTick, gameTime, true), null, 1));
  });
  document.getElementById('btn-trace-here')?.addEventListener('click', () => {
    let best: Entity | null = null;
    let bestD = 1e9;
    for (const e of entities) {
      if (!e.ai || !e.alive) continue;
      const d = world.dist2(e.x, e.y, mouseWorldX, mouseWorldY);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    traceTargetId = best.id;
    tracer = new ActorTracer(best.id);
    publishSummary(`Трассирую актора #${best.id}. Нажми «Трасса» через несколько секунд.`);
  });
  document.getElementById('btn-trace-show')?.addEventListener('click', () => {
    publishSummary(tracer ? tracer.format(1) : 'Актор не выбран: «Следить за ближайшим».');
  });
  const sep = document.getElementById('chk-separation') as HTMLInputElement | null;
  if (sep) {
    sep.checked = arenaSeparation;
    sep.addEventListener('change', () => { arenaSeparation = sep.checked; });
  }
}

setupSidebar();

// ── Rendering ────────────────────────────────────────────────────────
function draw() {
  const now = performance.now();
  const dtDraw = (now - lastTime) / 1000;
  lastTime = now;
  
  // Camera pan via WASD
  const panSpeed = 600 * dtDraw / Math.max(1, zoom);
  if (keys.w || keys.W || keys.ArrowUp) panY -= panSpeed;
  if (keys.s || keys.S || keys.ArrowDown) panY += panSpeed;
  if (keys.a || keys.A || keys.ArrowLeft) panX -= panSpeed;
  if (keys.d || keys.D || keys.ArrowRight) panX += panSpeed;

  // Resize canvas
  if (canvas.parentElement) {
    if (canvas.width !== canvas.parentElement.clientWidth || canvas.height !== canvas.parentElement.clientHeight) {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }
  }

  // Update logic if playing
  if (!paused) {
    step(Math.min(dtDraw, 0.1));
  }

  // Draw
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-panX, -panY);

  const viewMinX = Math.max(0, Math.floor(panX - (canvas.width / 2) / zoom));
  const viewMaxX = Math.min(W, Math.ceil(panX + (canvas.width / 2) / zoom));
  const viewMinY = Math.max(0, Math.floor(panY - (canvas.height / 2) / zoom));
  const viewMaxY = Math.min(W, Math.ceil(panY + (canvas.height / 2) / zoom));

  // Draw cells
  for (let y = viewMinY; y < viewMaxY; y++) {
    for (let x = viewMinX; x < viewMaxX; x++) {
      const i = y * W + x;
      const cell = world.cells[i];
      if (cell === Cell.WALL) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
      }

      // Draw subcell blockers
      for (let r = 0; r < PATH_BLOCKER_SUBDIV; r++) {
        const rowMask = getPathBlockerRow(world, i, r);
        if (rowMask !== 0) {
          for (let c = 0; c < PATH_BLOCKER_SUBDIV; c++) {
            if ((rowMask & (1 << c)) !== 0) {
              ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
              const sx = x + c / PATH_BLOCKER_SUBDIV;
              const sy = y + r / PATH_BLOCKER_SUBDIV;
              ctx.fillRect(sx, sy, 1 / PATH_BLOCKER_SUBDIV, 1 / PATH_BLOCKER_SUBDIV);
            }
          }
        }
      }
    }
  }

  // Grid
  if (showGrid) {
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    for (let x = viewMinX; x <= viewMaxX; x++) { ctx.moveTo(x, viewMinY); ctx.lineTo(x, viewMaxY); }
    for (let y = viewMinY; y <= viewMaxY; y++) { ctx.moveTo(viewMinX, y); ctx.lineTo(viewMaxX, y); }
    ctx.stroke();
    
    // Subgrid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    for (let x = viewMinX; x <= viewMaxX; x += 1/PATH_BLOCKER_SUBDIV) { ctx.moveTo(x, viewMinY); ctx.lineTo(x, viewMaxY); }
    for (let y = viewMinY; y <= viewMaxY; y += 1/PATH_BLOCKER_SUBDIV) { ctx.moveTo(viewMinX, y); ctx.lineTo(viewMaxX, y); }
    ctx.stroke();
  }

  // Draw Entities and Paths
  for (const e of entities) {
    // Draw Path
    if (e.ai && e.ai.path.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.lineWidth = 2 / zoom;
      let lastX = e.x;
      let lastY = e.y;
      for (let j = e.ai.pi; j < e.ai.path.length; j++) {
        const ci = e.ai.path[j];
        const sX = ci % 4096;
        const sY = Math.floor(ci / 4096);
        const pX = sX / 4 + 0.125;
        const pY = sY / 4 + 0.125;
        if (Math.abs(pX - lastX) > 512 || Math.abs(pY - lastY) > 512) {
          ctx.moveTo(pX, pY);
        } else {
          ctx.lineTo(pX, pY);
        }
        lastX = pX;
        lastY = pY;
      }
      if (e.ai.goal === AIGoal.HUNT || e.ai.goal === AIGoal.GOTO) {
        if (Math.abs(e.ai.tx - lastX) > 512 || Math.abs(e.ai.ty - lastY) > 512) {
          ctx.moveTo(e.ai.tx, e.ai.ty);
        } else {
          ctx.lineTo(e.ai.tx, e.ai.ty);
        }
      }
      ctx.stroke();
      
      // Target dot
      ctx.fillStyle = '#0ff';
      ctx.beginPath();
      ctx.arc(e.ai.tx, e.ai.ty, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Entity body
    ctx.fillStyle = e.type === EntityType.MONSTER ? '#f33' : '#3f3';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius || 0.18, 0, Math.PI * 2);
    ctx.fill();
    
    // Direction line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.angle) * 0.3, e.y + Math.sin(e.angle) * 0.3);
    ctx.stroke();
  }

  // Highlight hovered subcell
  if (currentTool === 5) {
    const px = Math.floor(mouseWorldX * PATH_BLOCKER_SUBDIV) / PATH_BLOCKER_SUBDIV;
    const py = Math.floor(mouseWorldY * PATH_BLOCKER_SUBDIV) / PATH_BLOCKER_SUBDIV;
    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.fillRect(px, py, 1/PATH_BLOCKER_SUBDIV, 1/PATH_BLOCKER_SUBDIV);
  } else {
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(Math.floor(mouseWorldX), Math.floor(mouseWorldY), 1, 1);
  }

  ctx.restore();

  updateHUD();
  updateMetricsPanel();
  requestAnimationFrame(draw);
}

/* Литерал состояния живёт в arena_scenarios.ts — общий с безголовым
 * прогоном, иначе браузерные и консольные числа разъедутся. */

import { ensureAlifeState } from './systems/alife';
let arenaState = createArenaGameState();
ensureAlifeState(arenaState);
let gameTime = 0;
const dummyPlayerId = 0;

// ── Logic ────────────────────────────────────────────────────────────
function arenaPushApart(): void {
  for (const e of entities) {
    if (!e.ai || !e.alive) continue;
    for (const other of entities) {
      if (other === e || !other.alive) continue;
      const dx = e.x - other.x;
      const dy = e.y - other.y;
      const dist2 = dx * dx + dy * dy;
      const r = (e.radius || 0.18) + (other.radius || 0.18);
      if (dist2 > 0 && dist2 < r * r) {
        const dist = Math.sqrt(dist2);
        const push = (r - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        e.x += nx * push;
        e.y += ny * push;
        other.x -= nx * push;
        other.y -= ny * push;
      }
    }
  }
}

function step(dt: number) {
  gameTime += dt;
  const msgs: any[] = [];

  if (activeScene) {
    activeScene.entities = entities;
    stepDriver(activeScene, dt, metrics);
  }
  // Тот же порядок, что в main.ts: бродфейз пересобирается ПЕРЕД симуляцией,
  // иначе близкие акторы ищутся по позициям прошлого кадра.
  rebuildEntityIndexForSimulation(entities, simTick);
  // Поля восприятия тикают тем же тактом, что в игре: без них полевые драйвы
  // в стенде инертны, и стенд врёт молча.
  updatePerceptionFields(world, dt);
  const nextIdRef = { v: nextEntityId };
  const t0 = performance.now();
  updateAI(
    world,
    entities,
    dt,
    gameTime,
    msgs,
    dummyPlayerId,
    arenaState.clock,
    false, // samosborActive
    nextIdRef,
    0, // currentZ
    arenaState
  );
  const aiMs = performance.now() - t0;
  nextEntityId = nextIdRef.v;

  if (arenaSeparation) arenaPushApart();

  metrics.observe(world, entities, dt, aiMs);
  tracer?.sample(world, entities, simTick, gameTime);
  simTick++;
  if (captureLeft > 0) {
    captureLeft -= dt;
    if (captureLeft <= 0) {
      captureLeft = 0;
      publishSummary(formatReport(metrics.report(entities)));
    }
  }

  entities = entities.filter(e => e.alive);
}

/* ── Панель метрик и текстовые дампы ─────────────────────────────── */

function summaryBox(): HTMLTextAreaElement | null {
  return document.getElementById('metrics-out') as HTMLTextAreaElement | null;
}

function publishSummary(text: string): void {
  const box = summaryBox();
  if (box) { box.value = text; box.scrollTop = 0; }
  console.log(text);
}

function resetMetrics(label: string): void {
  metrics = new ArenaMetrics(label, 1337);
  metrics.measureWalkable(world, isWalkableCell);
  simTick = 0;
  gameTime = 0;
  captureLeft = 0;
}

/* Сводка сортирует выборки, поэтому панель обновляется 4 раза в секунду,
 * а не каждый кадр: иначе прибор сам станет источником просадки. */
let panelCd = 0;

function updateMetricsPanel(): void {
  const live = document.getElementById('metrics-live');
  if (!live) return;
  panelCd -= 1;
  if (panelCd > 0) return;
  panelCd = 15;
  const r = metrics.report(entities);
  const pct = (v: number) => (v * 100).toFixed(1);
  live.innerHTML = [
    `сцена: ${r.scenario}`,
    `тик ${r.ticks}, сим ${r.simSeconds.toFixed(1)}c, акторов ${r.liveActors}`,
    `updateAI ${r.aiMs.mean.toFixed(2)} мс (p95 ${r.aiMs.p95.toFixed(2)})`,
    `кучность: соседей ${r.cluster.meanNeighbors.toFixed(2)}, индекс ${r.cluster.clumpIndex.toFixed(1)}×`,
    `пересечений тел ${pct(r.cluster.overlapFrac)}%, макс/клетка ${r.cluster.maxPerCell}`,
    `застряло N ${pct(r.npc.stuckFrac)}% / M ${pct(r.monster.stuckFrac)}%`,
    `путь N ${r.npc.repathHz.toFixed(2)}/с / M ${r.monster.repathHz.toFixed(2)}/с`,
    `провалы N ${r.npc.failHz.toFixed(2)}/с / M ${r.monster.failHz.toFixed(2)}/с`,
    `ось/диаг ${r.aniso.axisBias.toFixed(2)}, χ²/шаг ${r.aniso.chi2PerStep.toFixed(3)}`,
    captureLeft > 0 ? `<span style="color:#fc0">ЗАМЕР: ${captureLeft.toFixed(1)} c</span>` : '',
  ].filter(Boolean).join('<br>');
}

function loadScenario(id: string): void {
  const scene = buildScenario(id, 1337);
  activeScene = scene;
  world = scene.world;
  entities = scene.entities;
  nextEntityId = scene.nextId.v;
  panX = scene.camX;
  panY = scene.camY;
  zoom = scene.zoom;
  tracer = null;
  resetMetrics(id);
  arenaState = createArenaGameState();
  ensureAlifeState(arenaState);
  seedGlobalRng(1337);
}

// ── Interaction ──────────────────────────────────────────────────────
let isDragging = false;
let isPanning = false;

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousedown', (e) => {
  if (e.target !== canvas) return;
  if (e.button === 1 || e.button === 2) { // Middle or Right click
    isPanning = true;
    return;
  }
  if (e.button === 0) {
    applyTool(false);
    isDragging = true;
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    panX -= e.movementX / zoom;
    panY -= e.movementY / zoom;
  }
  
  // Calculate world coordinates
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const cw = canvas.width / 2;
  const ch = canvas.height / 2;
  mouseWorldX = panX + (mouseX - cw) / zoom;
  mouseWorldY = panY + (mouseY - ch) / zoom;
  mouseSubX = Math.floor(mouseWorldX * PATH_BLOCKER_SUBDIV);
  mouseSubY = Math.floor(mouseWorldY * PATH_BLOCKER_SUBDIV);

  if (isDragging) {
    applyTool(true);
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  isPanning = false;
});

window.addEventListener('wheel', (e) => {
  if (e.deltaY > 0) zoom *= 0.8;
  else zoom *= 1.25;
  zoom = Math.max(4, Math.min(zoom, 128));
});

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key as keyof typeof keys] = true;
  if (e.key >= '1' && e.key <= '6') {
    currentTool = parseInt(e.key);
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-tool-${currentTool}`)?.classList.add('active');
  }
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  if (e.key.toLowerCase() === 's') { step(0.016); }
  if (e.key.toLowerCase() === 'g') { showGrid = !showGrid; }
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    entities = entities.filter(ent => {
      const dx = ent.x - mouseWorldX;
      const dy = ent.y - mouseWorldY;
      return (dx*dx + dy*dy) > 0.25;
    });
  }

  if (e.key === 'F1') loadPresetEmptyCorner();
  if (e.key === 'F2') loadPresetMaze();
  if (e.key === 'F3') loadPresetNarrow();
  if (e.key === 'F4') {
    e.preventDefault();
    const input = document.getElementById('input-floor-id') as HTMLInputElement;
    const id = input?.value || 'outer_district';
    loadPresetFloor(id);
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key as keyof typeof keys] = false;
});

import { bakeNavigationTree } from './systems/ai/pathfinding';
const btnBakeBfs = document.getElementById('btn-bake-bfs');
if (btnBakeBfs) {
  btnBakeBfs.addEventListener('click', () => {
    bakeNavigationTree(world);
    console.log('BFS Navigation Tree Baked.');
  });
}

function applyTool(dragged: boolean = isDragging) {
  const x = Math.floor(mouseWorldX);
  const y = Math.floor(mouseWorldY);
  if (x < 0 || x >= W || y < 0 || y >= W) return;
  const idx = y * W + x;

  if (currentTool === 1) { // Floor
    world.cells[idx] = Cell.FLOOR;
    clearPathBlockersAtCell(world, idx);
    world.cellVersion++;
  } else if (currentTool === 2) { // Wall
    world.cells[idx] = Cell.WALL;
    clearPathBlockersAtCell(world, idx);
    world.cellVersion++;
  } else if (currentTool === 3) { // Monster
    if (world.cells[idx] !== Cell.WALL && !dragged) { // Only one click per monster
      createMonster(mouseWorldX, mouseWorldY, MonsterKind.SBORKA);
    }
  } else if (currentTool === 6) { // NPC
    if (world.cells[idx] !== Cell.WALL && !dragged) {
      createNPC(mouseWorldX, mouseWorldY);
    }
  } else if (currentTool === 4) { // Target
    if (!isDragging) {
      // Find nearest
      let nearest = null;
      let minDist = 99999;
      for (const e of entities) {
        if (!e.ai) continue;
        const d = (e.x - mouseWorldX)**2 + (e.y - mouseWorldY)**2;
        if (d < minDist) { minDist = d; nearest = e; }
      }
      if (nearest) {
        tryAssignPathToCell(world, nearest, mouseWorldX, mouseWorldY);
      }
    }
  } else if (currentTool === 5) { // Blocker
    if (!dragged) {
      subcellBlockerActive = !subcellBlockerActive;
    }
    const cellIdx = idx;
    const sx = Math.floor((mouseWorldX - x) * PATH_BLOCKER_SUBDIV);
    const sy = Math.floor((mouseWorldY - y) * PATH_BLOCKER_SUBDIV);
    
    const row = getPathBlockerRow(world, cellIdx, sy);
    if (subcellBlockerActive) {
      setPathBlockerRow(world, cellIdx, sy, row | (1 << sx));
    } else {
      setPathBlockerRow(world, cellIdx, sy, row & ~(1 << sx));
    }
  }
}

function createMonster(x: number, y: number, kind: MonsterKind = MonsterKind.SBORKA) {
  const dummyState = { currentZ: 0 } as GameState;
  const dummyPlayer = { id: 0, x: 0, y: 0 } as Entity;
  const nextIdObj = { v: nextEntityId };
  const res = applyMapEditorOp(world, entities, dummyPlayer, dummyState, nextIdObj, {
    kind: 'spawn_entity', x, y, entityDef: { kind: 'monster', monsterKind: kind }
  }, false);
  console.log('createMonster res:', res);
  nextEntityId = nextIdObj.v;
}

function createNPC(x: number, y: number) {
  const dummyState = { currentZ: 0 } as GameState;
  const dummyPlayer = { id: 0, x: 0, y: 0 } as Entity;
  const nextIdObj = { v: nextEntityId };
  const res = applyMapEditorOp(world, entities, dummyPlayer, dummyState, nextIdObj, {
    kind: 'spawn_entity', x, y, entityDef: { kind: 'npc', faction: Faction.CITIZEN }
  }, false);
  console.log('createNPC res:', res);
  nextEntityId = nextIdObj.v;
}

/* Легаси-пресеты переехали в arena_scenarios.ts вместе с починкой адресации:
 * здесь они писались как `(y + ARENA_OFFSET) * W + (x + ARENA_OFFSET)` при
 * ARENA_OFFSET === W, то есть всегда за границей массива клеток. Запись молча
 * терялась — ни одна стена этих пресетов никогда не появлялась, монстр бегал
 * по пустому полю. Функции сохранены как кнопки, но строят сцену через общий
 * билдер, который адресует клетки через world.idx(). */
function loadPresetEmptyCorner() { loadScenario('empty_corner'); }
function loadPresetMaze() { loadScenario('maze'); }
function loadPresetNarrow() { loadScenario('narrow'); }

function loadPresetFloor(id: string) {
  try {
    loadScenario(`floor:${id}`);
  } catch (err) {
    alert('Failed to generate floor: ' + err);
  }
}

// Init
loadScenario('corridor');
requestAnimationFrame(draw);
Object.defineProperty(window, 'world', { get: () => world });
Object.defineProperty(window, 'entities', { get: () => entities });
