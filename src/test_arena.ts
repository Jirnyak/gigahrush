import { World } from './core/world';
import { Cell, W, EntityType, AIGoal, type Entity, MonsterKind, Faction, type GameState } from './core/types';
import { tryAssignPathToCell, setPathContext } from './systems/ai/pathfinding';
import { updateAI } from './systems/ai/index';
import { setPathBlockerRow, PATH_BLOCKER_SUBDIV, getPathBlockerRow, clearPathBlockersAtCell } from './core/path_blockers';
import { seedGlobalRng } from './core/rand';
import { applyMapEditorOp } from './systems/map_editor';
import { generateDesignFloor } from './gen/design_floors/manifest';
import type { DesignFloorId } from './data/design_floors';
// ── Globals ──────────────────────────────────────────────────────────
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const help = document.getElementById('help')!;

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
let mouseWorldX = 0;
let mouseWorldY = 0;
let mouseSubX = 0;
let mouseSubY = 0;

// Setup
seedGlobalRng(1337);
world.cells.fill(Cell.FLOOR);
setPathContext([], 0);

// Helper for UI
function updateHUD() {
  const tools = ['-', '1: Floor', '2: Wall', '3: Monster', '4: Target', '5: Blocker', '6: NPC'];
  hud.innerHTML = `
    <b>AI Test Arena</b>
    FPS: ${Math.round(1000 / Math.max(1, performance.now() - lastTime))}
    Status: <span style="color:${paused ? '#f00' : '#0f0'}">${paused ? 'PAUSED' : 'PLAYING'}</span>
    Tool: <b>${tools[currentTool]}</b>
    Entities: ${entities.length}
    Mouse: (${mouseWorldX.toFixed(2)}, ${mouseWorldY.toFixed(2)}) sub: ${mouseSubX},${mouseSubY}
  `.replace(/\n\s+/g, '<br>');

  help.innerHTML = `
    Controls:
    [Middle Mouse] Drag to pan | [Scroll] Zoom
    [1] Paint Floor
    [2] Paint Wall
    [3] Place Monster (random)
    [4] Set Target (for nearest AI)
    [5] Toggle Subcell Blocker
    [6] Place NPC
    [Del] Remove hovered entity
    [Space] Pause / Play
    [S] Step one frame
    [G] Toggle Grid
    [F1-F3] Presets
    [F4] Generate Floor (Prompt)
  `.trim().replace(/\n\s+/g, '<br>');
}

// ── Rendering ────────────────────────────────────────────────────────
function draw() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Resize canvas
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Update logic if playing
  if (!paused) {
    step(dt);
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
      ctx.moveTo(e.x, e.y);
      for (let j = e.ai.pi; j < e.ai.path.length; j++) {
        const ci = e.ai.path[j];
        const sX = ci % 4096;
        const sY = Math.floor(ci / 4096);
        const pX = sX / 4 + 0.125;
        const pY = sY / 4 + 0.125;
        ctx.lineTo(pX, pY);
      }
      if (e.ai.goal === AIGoal.HUNT || e.ai.goal === AIGoal.GOTO) {
        ctx.lineTo(e.ai.tx, e.ai.ty);
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
  requestAnimationFrame(draw);
}

const dummyState = {
  clock: { totalMinutes: 0 },
  msgs: [],
  currentZ: 0,
} as unknown as GameState;

let gameTime = 0;

// ── Logic ────────────────────────────────────────────────────────────
function step(dt: number) {
  gameTime += dt;
  const msgs: any[] = [];

  updateAI(
    world,
    entities,
    dt,
    gameTime,
    msgs,
    0, // dummy player ID
    dummyState.clock,
    false, // samosborActive
    { v: nextEntityId },
    0, // currentZ
    dummyState
  );

  for (const e of entities) {
    if (!e.ai || !e.alive) continue;
    
    // Resolve collisions
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

  entities = entities.filter(e => e.alive);
}

// ── Interaction ──────────────────────────────────────────────────────
let isDragging = false;
let isPanning = false;

window.addEventListener('mousedown', (e) => {
  if (e.button === 1) { // Middle click
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
  const cw = canvas.width / 2;
  const ch = canvas.height / 2;
  mouseWorldX = panX + (e.clientX - cw) / zoom;
  mouseWorldY = panY + (e.clientY - ch) / zoom;
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
  if (e.key >= '1' && e.key <= '6') currentTool = parseInt(e.key);
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  if (e.key.toLowerCase() === 's') { step(0.016); }
  if (e.key.toLowerCase() === 'g') { showGrid = !showGrid; }
  
  if (e.key === 'Delete') {
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
    const id = prompt('Enter design floor ID:', 'outer_district');
    if (id) loadPresetFloor(id);
  }
});

function applyTool(dragged: boolean = isDragging) {
  const x = Math.floor(mouseWorldX);
  const y = Math.floor(mouseWorldY);
  if (x < 0 || x >= W || y < 0 || y >= W) return;
  const idx = y * W + x;

  if (currentTool === 1) { // Floor
    world.cells[idx] = Cell.FLOOR;
    clearPathBlockersAtCell(world, idx);
  } else if (currentTool === 2) { // Wall
    world.cells[idx] = Cell.WALL;
    clearPathBlockersAtCell(world, idx);
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

function clearArena() {
  world.cells.fill(Cell.FLOOR);
  for (let i = 0; i < W*W; i++) clearPathBlockersAtCell(world, i);
  entities = [];
  panX = 10;
  panY = 10;
}

function loadPresetEmptyCorner() {
  clearArena();
  // Draw an L-shaped room
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      world.cells[j*W + i] = Cell.WALL;
    }
  }
  for (let i = 5; i < 15; i++) world.cells[5*W + i] = Cell.FLOOR; // Horizontal
  for (let j = 5; j < 15; j++) world.cells[j*W + 14] = Cell.FLOOR; // Vertical
  createMonster(6, 5.5);
}

function loadPresetMaze() {
  clearArena();
  for (let i = 0; i < 25; i++) {
    for (let j = 0; j < 25; j++) {
      world.cells[j*W + i] = (i % 2 === 0 && j % 2 === 0) ? Cell.WALL : Cell.FLOOR;
    }
  }
  createMonster(1.5, 1.5);
}

function loadPresetNarrow() {
  clearArena();
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      world.cells[j*W + i] = Cell.WALL;
    }
  }
  for (let i = 5; i < 15; i++) world.cells[10*W + i] = Cell.FLOOR;
  
  // Create small blockers
  setPathBlockerRow(world, 10*W + 10, 0, 0b1111);
  setPathBlockerRow(world, 10*W + 10, 3, 0b1111);
  
  createMonster(6, 10.5);
}

function loadPresetFloor(id: string) {
  try {
    const gen = generateDesignFloor(id as DesignFloorId, 12345);
    world = gen.world;
    entities = gen.entities;
    nextEntityId = entities.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    
    // Find player spawn to center camera
    let spawnX = W / 2;
    let spawnY = W / 2;
    for (let i = 0; i < world.cells.length; i++) {
      if (world.cells[i] === Cell.LIFT) {
        spawnX = i % W;
        spawnY = Math.floor(i / W);
        break;
      }
    }
    panX = spawnX;
    panY = spawnY;
    zoom = 8;
  } catch (err) {
    alert('Failed to generate floor: ' + err);
  }
}

function loadPresetTangentStuck() {
  clearArena();
  // Tangential wall scenario: A straight wall that the monster has to slide along or graze.
  // We place a wall block
  world.cells[5*W + 5] = Cell.WALL;
  world.cells[5*W + 6] = Cell.WALL;
  world.cells[6*W + 5] = Cell.WALL;
  world.cells[6*W + 6] = Cell.WALL;
  
  createMonster(4.5, 7.5);
  // Set target for the monster
  const e = entities[0];
  if (e) {
    tryAssignPathToCell(world, e, 6.5, 4.5);
  }
}

// Init
loadPresetTangentStuck();
requestAnimationFrame(draw);
