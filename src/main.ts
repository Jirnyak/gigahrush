/* ── ГИГАХРУЩ — main entry point ──────────────────────────────── */
import './index.css';

import {
  W, Cell, DoorState, FloorLevel, Feature, Tex,
  type Entity, type GameState,
  EntityType, Faction, Occupation,
} from './core/types';
import { World } from './core/world';
import { generateWorld } from './gen/living';
import { generateMaintenance } from './gen/maintenance';
import { generateHell } from './gen/hell';
import { generateTextures } from './render/textures';
import { generateSprites } from './render/sprites';
import { renderScene, SCR_W, SCR_H, HALF_FOV, zBuf } from './render/engine';
import { drawHUD } from './render/hud';
import { spawnBloodHit, spawnDeathPool, updateBloodTrails, updateParticles, renderParticles } from './render/blood';
import { updateNeeds } from './systems/needs';
import { updateAI, getNpcStateText } from './systems/ai';
import { updateSamosbor, clearFogInZone } from './systems/samosbor';
import { pickupNearby, useItem, getWeaponStats, addItem, consumeDurability, consumeAmmo } from './systems/inventory';
import { createInput, bindInput } from './input';
import { freshNeeds } from './data/catalog';
import {
  playFootstep, playAttack, playDoor,
  playGunshot, playShotgun, playNailgun, playBreak,
  startAmbientDrone,
} from './systems/audio';
import { offerQuest, checkQuests, checkTalkQuest, notifyKill } from './systems/quests';
import {
  freshRPG, awardXP, xpForMonsterKill, xpForNpcKill,
  strMeleeDmgMult, agiSpeedMult, agiAttackSpeedMult,
  regenPsi, spendAttrPoint,
} from './systems/rpg';
import { execDebugCommand } from './systems/debug';
import {
  applyDamageRelationPenalty,
  updateFactionCapture, initFactionControl, countFactionTerritory, spawnPatrolSquads,
} from './systems/factions';
import { addRelMutual } from './data/relations';

/* ── Canvas setup ─────────────────────────────────────────────── */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Low-res buffer for raycaster output
const screen = ctx.createImageData(SCR_W, SCR_H);
const buf32 = new Uint32Array(screen.data.buffer);

/* ── Generate assets ──────────────────────────────────────────── */
const textures = generateTextures();
const sprites  = generateSprites();

/* ── Game initialization ──────────────────────────────────────── */
let world: World;
let entities: Entity[];
let player: Entity;
let state: GameState;
let nextEntityId = { v: 1 };

function initGame(): void {
  const gen = generateWorld();
  world = gen.world;
  entities = gen.entities;
  nextEntityId.v = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

  player = {
    id: nextEntityId.v++,
    type: EntityType.PLAYER,
    x: gen.spawnX,
    y: gen.spawnY,
    angle: -Math.PI / 2, // face north — toward slides
    pitch: 0,
    alive: true,
    speed: 3.0,
    sprite: 0,
    needs: freshNeeds(),
    hp: 100, maxHp: 100,
    money: 100,
    inventory: [],
    weapon: '',
    name: 'Вы',
    rpg: freshRPG(1),
    faction: Faction.CITIZEN,
  };
  entities.push(player);

  // Initialize per-cell faction control and spawn patrol squads
  initFactionControl(world);
  const fStats = countFactionTerritory(world);
  spawnPatrolSquads(world, entities, nextEntityId, fStats);

  state = {
    tick: 0,
    time: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 0 },
    samosborActive: false,
    samosborTimer: 120 + Math.random() * 60,
    samosborCount: 0,
    paused: false,
    gameOver: false,
    showInventory: false,
    mapMode: 0,
    showQuests: false,
    invSel: 0,
    msgs: [{ text: 'Добро пожаловать в ГИГАХРУЩ. Закройте дверь.', time: 0, color: '#aaa' }],
    quests: [],
    nextQuestId: 1,
    currentFloor: FloorLevel.LIVING,
    fogSpreadTimer: 0,
    showMenu: false,
    menuSel: 0,
    showNpcMenu: false,
    npcMenuSel: 0,
    npcMenuTarget: -1,
    npcMenuTab: 'main',
    npcTalkText: '',
    questPage: 0,
    tradeSel: 0,
    tradeMode: 'npc',
    showDebug: false,
    debugSel: 0,
  };
}

initGame();

/* ── Input ────────────────────────────────────────────────────── */
const input = createInput();
bindInput(input, canvas);

/* ── Toggles (edge-detect) ────────────────────────────────────── */
let prevMap = false, prevSamosbor = false, prevDebug = false; // eslint-disable-line
let stepAccum = 0; // footstep sound accumulator

/* ── Door auto-close update ───────────────────────────────────── */
function updateDoors(dt: number): void {
  for (const [, door] of world.doors) {
    if (door.timer > 0) {
      door.timer -= dt;
      if (door.timer <= 0 && (door.state === DoorState.OPEN || door.state === DoorState.HERMETIC_OPEN)) {
        door.state = door.state === DoorState.HERMETIC_OPEN ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED;
      }
    }
  }
}

/* ── Player movement ──────────────────────────────────────────── */
function movePlayer(dt: number): void {
  if (!player.alive) return;

  // Mouse look
  if (input.mouse.locked) {
    player.angle += input.mouse.dx * 0.003;
    player.pitch = Math.max(-1, Math.min(1, player.pitch - input.mouse.dy * 0.003));
    input.mouse.dx = 0;
    input.mouse.dy = 0;
  }

  // Keyboard turn
  if (input.left)  player.angle -= 2.5 * dt;
  if (input.right) player.angle += 2.5 * dt;

  // Movement
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  let mx = 0, my = 0;
  if (input.fwd)    { mx += cos; my += sin; }
  if (input.back)   { mx -= cos; my -= sin; }
  if (input.strafeL) { mx += sin; my -= cos; }
  if (input.strafeR) { mx -= sin; my += cos; }

  // Normalize
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0) {
    const speed = player.speed * dt;
    // Sleep exhaustion reduces speed
    const sleepMod = player.needs && player.needs.sleep < 10 ? 0.5 : 1;
    // AGI bonus to move speed
    const agiMod = player.rpg ? agiSpeedMult(player.rpg) : 1;
    mx = mx / len * speed * sleepMod * agiMod;
    my = my / len * speed * sleepMod * agiMod;

    const r = 0.2; // collision radius
    // X movement – check all 4 AABB corners
    const nx = player.x + mx;
    if (!world.solid(Math.floor(nx + r), Math.floor(player.y + r)) &&
        !world.solid(Math.floor(nx + r), Math.floor(player.y - r)) &&
        !world.solid(Math.floor(nx - r), Math.floor(player.y + r)) &&
        !world.solid(Math.floor(nx - r), Math.floor(player.y - r))) {
      player.x = ((nx % W) + W) % W;
    }
    // Y movement – check all 4 AABB corners (use updated X)
    const ny = player.y + my;
    if (!world.solid(Math.floor(player.x + r), Math.floor(ny + r)) &&
        !world.solid(Math.floor(player.x + r), Math.floor(ny - r)) &&
        !world.solid(Math.floor(player.x - r), Math.floor(ny + r)) &&
        !world.solid(Math.floor(player.x - r), Math.floor(ny - r))) {
      player.y = ((ny % W) + W) % W;
    }

    // Footstep sound
    stepAccum += speed;
    if (stepAccum > 1.8) {
      stepAccum = 0;
      playFootstep();
    }
  }
}

/* ── Player actions ───────────────────────────────────────────── */
function playerActions(_dt: number): void {
  if (!player.alive) return;

  // Toggle map
  if (input.map && !prevMap) state.mapMode = (state.mapMode + 1) % 3;
  prevMap = input.map;

  // Pickup
  if (input.pickup) {
    pickupNearby(world, entities, player, state.msgs, state.time);
    input.pickup = false;
  }

  // Interact (doors + NPCs)
  if (input.interact) {
    const lookX = player.x + Math.cos(player.angle) * 1.5;
    const lookY = player.y + Math.sin(player.angle) * 1.5;

    // Check for NPC nearby → open NPC interaction menu
    let interactedNpc = false;
    for (const e of entities) {
      if (e.type !== EntityType.NPC || !e.alive) continue;
      if (world.dist(player.x, player.y, e.x, e.y) < 2.0) {
        openNpcMenu(e);
        interactedNpc = true;
        break;
      }
    }

    // Check for lift interaction (LIFT cell or LIFT_BUTTON feature nearby)
    if (!interactedNpc) {
      const lx = Math.floor(lookX), ly = Math.floor(lookY);
      const lci = world.idx(lx, ly);
      const isLiftCell = world.cells[lci] === Cell.LIFT;
      const isLiftButton = world.features[lci] === Feature.LIFT_BUTTON;
      if (isLiftCell || isLiftButton) {
        switchFloor();
        input.interact = false;
        return;
      }
    }

    if (!interactedNpc) {
      const ci = world.idx(Math.floor(lookX), Math.floor(lookY));

      if (world.cells[ci] === Cell.DOOR) {
        const door = world.doors.get(ci);
        if (door) {
          if (door.state === DoorState.CLOSED || door.state === DoorState.HERMETIC_CLOSED) {
            if (door.state === DoorState.HERMETIC_CLOSED && state.samosborActive) {
              state.msgs.push({ text: 'Дверь герметично заперта!', time: state.time, color: '#f44' });
            } else {
              door.state = door.state === DoorState.HERMETIC_CLOSED ? DoorState.HERMETIC_OPEN : DoorState.OPEN;
              door.timer = 0;
              state.msgs.push({ text: 'Дверь открыта', time: state.time, color: '#aaa' });
              playDoor();
            }
          } else if (door.state === DoorState.OPEN || door.state === DoorState.HERMETIC_OPEN) {
            door.state = door.state === DoorState.HERMETIC_OPEN ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED;
            state.msgs.push({ text: 'Дверь закрыта', time: state.time, color: '#aaa' });
            playDoor();
          } else if (door.state === DoorState.LOCKED) {
            // Check for key
            if (door.keyId && player.inventory?.some(i => i.defId === 'key')) {
              door.state = DoorState.OPEN;
              state.msgs.push({ text: 'Дверь отперта ключом', time: state.time, color: '#4a4' });
            } else {
              state.msgs.push({ text: 'Заперто. Нужен ключ.', time: state.time, color: '#f84' });
            }
          }
        }
      }
    }
    input.interact = false;
  }

  // Attack (cooldown-based: hold to auto-fire)
  const wantsAttack = input.attack || input.mouseAttack;
  player.attackCd = Math.max(0, (player.attackCd ?? 0) - _dt);

  if (wantsAttack && player.attackCd! <= 0) {
    const ws = getWeaponStats(player);
    // AGI reduces attack cooldown
    const atkSpeedMod = player.rpg ? agiAttackSpeedMult(player.rpg) : 1;

    if (ws.isRanged) {
      // ── Ranged attack: spawn projectile(s) ──────────────
      if (consumeAmmo(player)) {
        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const pellets = ws.pellets ?? 1;
        const spread = ws.spread ?? 0;
        for (let p = 0; p < pellets; p++) {
          const ang = player.angle + (Math.random() - 0.5) * spread;
          const spd = ws.projSpeed ?? 15;
          entities.push({
            id: nextEntityId.v++,
            type: EntityType.PROJECTILE,
            x: player.x + cos * 0.5,
            y: player.y + sin * 0.5,
            angle: ang,
            pitch: 0,
            alive: true,
            speed: 0,
            sprite: ws.projSprite ?? 29,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            projDmg: ws.dmg,
            projLife: 3.0,
            ownerId: player.id,
            spriteScale: 0.25,
            spriteZ: 0.5,
          });
        }
        // Play weapon-specific sound
        if (player.weapon === 'shotgun') playShotgun();
        else if (player.weapon === 'nailgun') playNailgun();
        else playGunshot();
        player.attackCd = ws.speed * atkSpeedMod;
      } else {
        state.msgs.push({ text: 'Нет патронов!', time: state.time, color: '#f84' });
        player.attackCd = 0.5;
      }
    } else {
      // ── Melee attack: range check + durability ──────────
      // STR bonus to melee damage
      const strMult = player.rpg ? strMeleeDmgMult(player.rpg) : 1;
      const dmg = Math.round(ws.dmg * strMult);
      const range = ws.range;
      const ax = player.x + Math.cos(player.angle) * range;
      const ay = player.y + Math.sin(player.angle) * range;

      let hitSomething = false;
      for (const e of entities) {
        if ((e.type !== EntityType.MONSTER && e.type !== EntityType.NPC) || !e.alive) continue;
        if (e.id === player.id) continue;
        if (world.dist(ax, ay, e.x, e.y) < 1.2) {
          if (e.hp !== undefined) {
            e.hp -= dmg;
            // Relation penalty for hitting non-hostile NPCs
            if (e.type === EntityType.NPC) {
              applyDamageRelationPenalty(player.id, e.id, dmg, player.faction, e.faction, { addRelMutual });
            }
            // Blood splatter on hit
            spawnBloodHit(world, e.x, e.y, player.angle, dmg, e.type === EntityType.MONSTER);
            state.msgs.push({ text: `Удар! ${e.name} -${dmg}`, time: state.time, color: '#fc4' });
            if (e.hp <= 0) {
              e.alive = false;
              handleKill(e, true);
            }
          }
          hitSomething = true;
          break;
        }
      }
      playAttack();
      // Consume durability on melee hit
      if (hitSomething) {
        const broke = consumeDurability(player, state.msgs, state.time);
        if (broke) playBreak();
      }
      player.attackCd = ws.speed * atkSpeedMod;
    }
  }
}

/* ── Shared kill handling (melee + projectile) ────────────────── */
function handleKill(e: Entity, killerIsPlayer: boolean): void {
  // Death blood pool
  spawnDeathPool(world, e.x, e.y, e.type === EntityType.MONSTER);
  state.msgs.push({ text: `${e.name ?? 'Цель'} ${e.isFemale ? 'повержена' : 'повержен'}!`, time: state.time, color: '#4f4' });
  if (e.isFogBoss && e.fogBossZone !== undefined) {
    clearFogInZone(world, e.fogBossZone, state.msgs, state.time);
  }
  if (e.monsterKind !== undefined) {
    notifyKill(e.monsterKind, state);
    if (killerIsPlayer) {
      awardXP(player, xpForMonsterKill(e.monsterKind, e.rpg?.level ?? 1), state.msgs, state.time);
    }
  } else if (e.type === EntityType.NPC && killerIsPlayer) {
    awardXP(player, xpForNpcKill(e.rpg?.level ?? 1), state.msgs, state.time);
  }
}

/* ── Projectile update: move, collide walls + entities ────────── */
function updateProjectiles(dt: number): void {
  for (const p of entities) {
    if (p.type !== EntityType.PROJECTILE || !p.alive) continue;
    p.projLife = (p.projLife ?? 0) - dt;
    if (p.projLife! <= 0) { p.alive = false; continue; }

    const nx = p.x + (p.vx ?? 0) * dt;
    const ny = p.y + (p.vy ?? 0) * dt;

    // Wrap toroidal
    const wx = ((nx % W) + W) % W;
    const wy = ((ny % W) + W) % W;

    // Wall collision → leave bullet hole decal
    if (world.solid(Math.floor(wx), Math.floor(wy))) {
      const cellX = Math.floor(wx), cellY = Math.floor(wy);
      const ci = world.idx(cellX, cellY);
      // Determine impact texture coordinate based on approach direction
      const avx = Math.abs(p.vx ?? 0), avy = Math.abs(p.vy ?? 0);
      const texU = avx > avy ? (wy - cellY) : (wx - cellX);
      const tx = Math.floor(texU * 64) & 63;
      const ty = Math.floor(64 * 0.35 + Math.random() * 64 * 0.3);
      world.addDecal(ci, tx, ty);
      p.alive = false;
      continue;
    }

    p.x = wx;
    p.y = wy;

    // Entity collision — check monsters and NPCs
    const dmg = p.projDmg ?? 0;
    for (const e of entities) {
      if (!e.alive || e.id === p.ownerId) continue;
      if (e.type !== EntityType.MONSTER && e.type !== EntityType.NPC) continue;
      if (world.dist(p.x, p.y, e.x, e.y) < 0.6) {
        if (e.hp !== undefined) {
          e.hp -= dmg;
          // Relation penalty for projectile hits on non-hostile NPCs
          if (e.type === EntityType.NPC && p.ownerId === player.id) {
            applyDamageRelationPenalty(player.id, e.id, dmg, player.faction, e.faction, { addRelMutual });
          }
          // Blood splatter on projectile hit
          const hitAngle = Math.atan2(p.vy ?? 0, p.vx ?? 0);
          spawnBloodHit(world, e.x, e.y, hitAngle, dmg, e.type === EntityType.MONSTER);
          if (e.hp <= 0) {
            e.alive = false;
            handleKill(e, p.ownerId === player.id);
          }
        }
        p.alive = false;
        break;
      }
    }
  }
}

/* ── Restart check ────────────────────────────────────────────── */
function checkRestart(): void {
  if (state.gameOver && input.use) {
    initGame();
    input.use = false;
  }
}

/* ── Floor switching via lift ─────────────────────────────────── */
const FLOOR_NAMES: Record<FloorLevel, string> = {
  [FloorLevel.LIVING]:      'Жилая зона',
  [FloorLevel.MAINTENANCE]: 'Коллекторы',
  [FloorLevel.HELL]:        'Преисподняя',
};

function switchFloor(): void {
  // Cycle to next floor
  const nextFloor = ((state.currentFloor + 1) % 3) as FloorLevel;
  state.currentFloor = nextFloor;

  // Save player state
  const savedInventory = player.inventory ? [...player.inventory] : [];
  const savedNeeds = player.needs ? { ...player.needs } : freshNeeds();
  const savedHp = player.hp ?? 100;
  const savedMaxHp = player.maxHp ?? 100;
  const savedWeapon = player.weapon ?? '';
  const savedRpg = player.rpg ? { ...player.rpg } : freshRPG(1);
  const savedMoney = player.money ?? 100;

  // Generate new floor
  let gen: { world: World; entities: Entity[]; spawnX: number; spawnY: number };
  if (nextFloor === FloorLevel.LIVING) {
    gen = generateWorld();
  } else if (nextFloor === FloorLevel.MAINTENANCE) {
    gen = generateMaintenance();
  } else {
    gen = generateHell();
  }

  world = gen.world;
  entities = gen.entities;
  nextEntityId.v = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

  // Recreate player at new spawn
  player = {
    id: nextEntityId.v++,
    type: EntityType.PLAYER,
    x: gen.spawnX,
    y: gen.spawnY,
    angle: player.angle,
    pitch: 0,
    alive: true,
    speed: 3.0,
    sprite: 0,
    needs: savedNeeds,
    hp: savedHp,
    maxHp: savedMaxHp,
    inventory: savedInventory,
    weapon: savedWeapon,
    money: savedMoney,
    rpg: savedRpg,
    name: 'Вы',
    faction: Faction.CITIZEN,
  };
  entities.push(player);

  // Initialize faction control for new floor
  initFactionControl(world);
  const fStats = countFactionTerritory(world);
  spawnPatrolSquads(world, entities, nextEntityId, fStats);

  // Reset samosbor for new floor (interval depends on floor)
  if (nextFloor === FloorLevel.HELL) {
    state.samosborTimer = 60 + Math.random() * 240;  // 1-5 min
  } else if (nextFloor === FloorLevel.MAINTENANCE) {
    state.samosborTimer = 180 + Math.random() * 240; // 3-7 min
  } else {
    state.samosborTimer = 300 + Math.random() * 300; // 5-10 min
  }
  state.samosborActive = false;

  state.msgs.push({
    text: `Лифт прибыл: ${FLOOR_NAMES[nextFloor]}`,
    time: state.time,
    color: nextFloor === FloorLevel.HELL ? '#f44' : '#4af',
  });
}

/* ── NPC interaction menu ──────────────────────────────────────── */
function openNpcMenu(npc: Entity): void {
  state.showNpcMenu = true;
  state.npcMenuSel = 0;
  state.npcMenuTarget = npc.id;
  state.npcMenuTab = 'main';
  state.npcTalkText = '';
  state.tradeSel = 0;
  state.tradeMode = 'npc';
  // Generate NPC trade inventory if empty
  if (!npc.inventory || npc.inventory.length === 0) {
    npc.inventory = generateNpcTradeItems(npc);
  }
}

function generateNpcTradeItems(npc: Entity): { defId: string; count: number }[] {
  const items: { defId: string; count: number }[] = [];
  const OCC_ITEMS: Record<number, string[]> = {
    [Occupation.HOUSEWIFE]:   ['bread', 'water', 'cigs'],
    [Occupation.LOCKSMITH]:   ['wrench', 'pipe', 'flashlight'],
    [Occupation.SECRETARY]:   ['book', 'tea', 'cigs'],
    [Occupation.ELECTRICIAN]: ['wrench', 'flashlight', 'ammo_nails'],
    [Occupation.COOK]:        ['bread', 'kasha', 'kompot', 'canned'],
    [Occupation.DOCTOR]:      ['bandage', 'pills', 'antidep'],
    [Occupation.TURNER]:      ['wrench', 'pipe', 'rebar'],
    [Occupation.MECHANIC]:    ['wrench', 'pipe', 'flashlight', 'ammo_nails'],
    [Occupation.STOREKEEPER]: ['bread', 'water', 'cigs', 'bandage', 'ammo_shells'],
    [Occupation.ALCOHOLIC]:   ['bread', 'cigs', 'water'],
    [Occupation.SCIENTIST]:   ['flashlight', 'book', 'note', 'ammo_9mm'],
    [Occupation.CHILD]:       ['bread', 'water'],
    [Occupation.DIRECTOR]:    ['book', 'tea', 'cigs', 'ammo_9mm'],
    [Occupation.TRAVELER]:    ['bread', 'water', 'canned', 'cigs'],
    [Occupation.PILGRIM]:     ['bread', 'water', 'knife'],
    [Occupation.HUNTER]:      ['knife', 'canned', 'rawmeat', 'ammo_9mm'],
  };
  const pool = OCC_ITEMS[npc.occupation ?? 0] ?? ['bread', 'water'];
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const defId = pool[Math.floor(Math.random() * pool.length)];
    items.push({ defId, count: 1 + Math.floor(Math.random() * 3) });
  }
  return items;
}

function generateTalkText(npc: Entity): string {
  // ── Ольга Дмитриевна — tutorial dialogue ──
  if (npc.isTutor && !npc.tutorDone) {
    const tutorLines = [
      'Добро пожаловать в блок! Я Ольга Дмитриевна, врач. Прочитайте слайды на стене — там основные правила.',
      'Двигайтесь клавишами WASD, мышь — обзор. Нажмите E чтобы поговорить с кем-нибудь или открыть дверь.',
      'Клавиша F — подобрать предмет с пола. I — открыть инвентарь. Кушайте вовремя, иначе здоровье падает.',
      'Пробел или ЛКМ — удар/выстрел. Зайдите в оружейную — там Барни покажет как стрелять.',
      'Когда услышите сирену — это САМОСБОР. Бегите в ближайшую комнату и закройте дверь! Коридоры смертельно опасны.',
      'Фиолетовый туман убивает. Из него лезут твари. Не стойте в тумане — бегите к шлюзу.',
      'Нажмите M — карта. Q — журнал заданий. Общайтесь с жителями, помогайте — от них зависит выживание.',
      'У меня есть для вас задание. Откройте вкладку «Задание» — я расскажу.',
    ];
    const idx = (npc._tutorIdx ?? 0) % tutorLines.length;
    npc._tutorIdx = idx + 1;
    return tutorLines[idx];
  }

  // ── Барни — armory dialogue ──
  if (npc.isTutorBarni) {
    const barniLines = [
      'Я Барни, старший ликвидатор. Добро пожаловать в оружейную.',
      'Стреляй по мишеням — тренируйся. Патроны забирай со стойки.',
      'Макаров — лучший друг в лабиринте. Держи его заряженным.',
      'Слышишь сирену — хватай ствол и к двери. В коридоре без оружия — труп.',
      'Мишени на стене — стреляй сколько хочешь. Следы от пуль видно.',
      'Бетонник? Не лезь с ножом. Только с огнестрелом. И то — издалека.',
    ];
    return barniLines[Math.floor(Math.random() * barniLines.length)];
  }

  // After tutor phase — normal doctor dialogue
  if (npc.isTutor && npc.tutorDone) {
    const doctorLines = [
      'Приходи если ранен. Помогу.',
      'Таблеток мало осталось.',
      'Мне пора на работу. Береги себя.',
    ];
    return doctorLines[Math.floor(Math.random() * doctorLines.length)];
  }

  // Sometimes NPC tells about their current state
  if (npc.ai?.npcState !== undefined && Math.random() < 0.4) {
    return getNpcStateText(npc.ai.npcState);
  }
  const general = [
    'Стены опять гудят... Скоро будет самосбор.',
    'Не ходи в длинные коридоры один.',
    'Я слышал шорох за стеной. Проверь двери.',
    'Тут раньше была кухня. Теперь — стена.',
    'Свет мигает всё чаще. Дурной знак.',
    'Сколько себя помню — одни стены и двери.',
    'Говорят, кто-то нашёл выход. Вернулся через стену.',
    'Бетон скрипит ночью. Будто дышит.',
    'Самосбор был вчера. Половина коридоров пропала.',
    'Мой сосед ушёл за водой и не вернулся.',
  ];
  const byFaction: Record<number, string[]> = {
    0: ['Главное — не выходить во время самосбора.', 'Когда последний раз ел нормально?', 'Нужно беречь еду и воду.'],
    1: ['Ликвидаторы всегда на переднем крае.', 'После самосбора надо зачищать коридоры.', 'Видел тварь? Бей первым.'],
    2: ['Самосбор — не катастрофа. Это чудо.', 'Хрущ живой. Мы живём внутри его тела.', 'Стены — его плоть. Двери — суставы.'],
    3: ['Я изучаю природу хруща. Данные неоднозначны.', 'По моим расчётам, мир тороидальной формы.', 'Нужно больше образцов стен.'],
  };
  const byOcc: Record<number, string[]> = {
    1: ['Плита ещё работает. Приходи покушать.', 'Запасы тают. Нужна тушёнка.'],
    2: ['Приходи если ранен. Помогу.', 'Таблеток мало осталось.'],
    3: ['Трубы потекли опять. Нужен инструмент.'],
    4: ['Я охочусь на сборок. Они слабые, но быстрые.'],
    5: ['Помолись хрущу. Он слышит.'],
    6: ['Я записываю всё что вижу.'],
    7: ['Могу обменять кое-что полезное.'],
  };
  const lines: string[] = [...general];
  if (npc.faction !== undefined) lines.push(...(byFaction[npc.faction] ?? []));
  if (npc.occupation !== undefined) lines.push(...(byOcc[npc.occupation] ?? []));
  return lines[Math.floor(Math.random() * lines.length)];
}

/* ── Save / Load ──────────────────────────────────────────────── */
const SAVE_KEY = 'gigahrush_save';

function saveGame(): void {
  try {
    const data = {
      player: {
        x: player.x, y: player.y, angle: player.angle,
        hp: player.hp, maxHp: player.maxHp,
        needs: player.needs,
        inventory: player.inventory,
        weapon: player.weapon,
        rpg: player.rpg,
        money: player.money,
      },
      state: {
        time: state.time,
        tick: state.tick,
        clock: state.clock,
        samosborCount: state.samosborCount,
        samosborTimer: state.samosborTimer,
        quests: state.quests,
        nextQuestId: state.nextQuestId,
        currentFloor: state.currentFloor,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.msgs.push({ text: 'Игра сохранена', time: state.time, color: '#4f4' });
  } catch {
    state.msgs.push({ text: 'Ошибка сохранения!', time: state.time, color: '#f44' });
  }
}

function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      state.msgs.push({ text: 'Нет сохранения', time: state.time, color: '#f84' });
      return false;
    }
    const data = JSON.parse(raw);

    // Regenerate world for the saved floor
    const floor = data.state.currentFloor ?? FloorLevel.LIVING;
    let gen: { world: World; entities: Entity[]; spawnX: number; spawnY: number };
    if (floor === FloorLevel.LIVING) gen = generateWorld();
    else if (floor === FloorLevel.MAINTENANCE) gen = generateMaintenance();
    else gen = generateHell();

    world = gen.world;
    entities = gen.entities;
    nextEntityId.v = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

    player = {
      id: nextEntityId.v++,
      type: EntityType.PLAYER,
      x: data.player.x ?? gen.spawnX,
      y: data.player.y ?? gen.spawnY,
      angle: data.player.angle ?? 0,
      pitch: 0,
      alive: true,
      speed: 3.0,
      sprite: 0,
      needs: data.player.needs ?? freshNeeds(),
      hp: data.player.hp ?? 100,
      maxHp: data.player.maxHp ?? 100,
      inventory: data.player.inventory ?? [],
      weapon: data.player.weapon ?? '',
      money: data.player.money ?? 100,
      rpg: data.player.rpg ?? freshRPG(1),
      name: 'Вы',
      faction: Faction.CITIZEN,
    };
    entities.push(player);

    // Init faction control for loaded world
    initFactionControl(world);
    const fStats = countFactionTerritory(world);
    spawnPatrolSquads(world, entities, nextEntityId, fStats);

    state.time = data.state.time ?? 0;
    state.tick = data.state.tick ?? 0;
    state.clock = data.state.clock ?? { hour: 8, minute: 0, totalMinutes: 0 };
    state.samosborCount = data.state.samosborCount ?? 0;
    state.samosborTimer = data.state.samosborTimer ?? 120;
    state.quests = data.state.quests ?? [];
    state.nextQuestId = data.state.nextQuestId ?? 1;
    state.currentFloor = floor;
    state.samosborActive = false;
    state.gameOver = false;
    state.showMenu = false;

    state.msgs.push({ text: 'Игра загружена', time: state.time, color: '#4af' });
    return true;
  } catch {
    state.msgs.push({ text: 'Ошибка загрузки!', time: state.time, color: '#f44' });
    return false;
  }
}

/* ── Menu input handling (runs regardless of pause state) ─────── */
let prevEsc = false, prevInvMenu = false, prevQuestMenu = false;
let prevMenuUp = false, prevMenuDn = false, prevMenuLeft = false, prevMenuRight = false;
let prevMenuInteract = false;

function handleMenuInput(): void {
  const escEdge = input.escape && !prevEsc;
  const upEdge = input.invUp && !prevMenuUp;
  const dnEdge = input.invDn && !prevMenuDn;
  const leftEdge = input.invLeft && !prevMenuLeft;
  const rightEdge = input.invRight && !prevMenuRight;
  const interactEdge = input.interact && !prevMenuInteract;
  const invEdge = input.inv && !prevInvMenu;
  const questEdge = input.questLog && !prevQuestMenu;

  // ── Enter: toggle game menu (or close any open menu) ─────
  if (escEdge) {
    if (state.showNpcMenu) { state.showNpcMenu = false; }
    else if (state.showInventory) { state.showInventory = false; }
    else if (state.showQuests) { state.showQuests = false; }
    else { state.showMenu = !state.showMenu; state.menuSel = 0; }
  }

  // ── Game menu navigation ─────────────────────────────────
  if (state.showMenu) {
    if (upEdge) state.menuSel = Math.max(0, state.menuSel - 1);
    if (dnEdge) state.menuSel = Math.min(3, state.menuSel + 1);
    if (interactEdge) {
      switch (state.menuSel) {
        case 0: state.showMenu = false; break;                // Continue
        case 1: state.showMenu = false; initGame(); break;    // New Game
        case 2: saveGame(); state.showMenu = false; break;    // Save
        case 3: loadGame(); break;                            // Load
      }
    }
  }
  // ── Inventory toggle + navigation ────────────────────────
  else if (state.showInventory) {
    if (invEdge) { state.showInventory = false; }
    else {
      const GRID_W = 5;
      if (upEdge) state.invSel = Math.max(0, state.invSel - GRID_W);
      if (dnEdge) state.invSel = Math.min(24, state.invSel + GRID_W);
      if (leftEdge && state.invSel % GRID_W > 0) state.invSel--;
      if (rightEdge && state.invSel % GRID_W < GRID_W - 1) state.invSel++;
      if (interactEdge) useItem(player, state.invSel, state.msgs, state.time);
      // Attribute spending (1=STR, 2=AGI, 3=INT)
      if (input.attrStr && player.rpg && player.rpg.attrPoints > 0) {
        if (spendAttrPoint(player, 'str'))
          state.msgs.push({ text: `Сила +1 (${player.rpg.str})`, time: state.time, color: '#f84' });
        input.attrStr = false;
      }
      if (input.attrAgi && player.rpg && player.rpg.attrPoints > 0) {
        if (spendAttrPoint(player, 'agi'))
          state.msgs.push({ text: `Ловкость +1 (${player.rpg.agi})`, time: state.time, color: '#4af' });
        input.attrAgi = false;
      }
      if (input.attrInt && player.rpg && player.rpg.attrPoints > 0) {
        if (spendAttrPoint(player, 'int'))
          state.msgs.push({ text: `Интеллект +1 (${player.rpg.int})`, time: state.time, color: '#a4f' });
        input.attrInt = false;
      }
    }
  }
  // ── Quest log toggle ─────────────────────────────────────
  else if (state.showQuests) {
    if (questEdge) { state.showQuests = false; }
    const totalQ = state.quests.length;
    if (upEdge) state.questPage = Math.max(0, state.questPage - 1);
    if (dnEdge) state.questPage = Math.min(Math.max(0, totalQ - 1), state.questPage + 1);
  }
  // ── NPC menu navigation ──────────────────────────────────
  else if (state.showNpcMenu) {
    const npc = entities.find(e => e.id === state.npcMenuTarget);
    if (state.npcMenuTab === 'main') {
      if (upEdge) state.npcMenuSel = Math.max(0, state.npcMenuSel - 1);
      if (dnEdge) state.npcMenuSel = Math.min(2, state.npcMenuSel + 1);
      if (interactEdge) {
        switch (state.npcMenuSel) {
          case 0: // Talk
            state.npcMenuTab = 'talk';
            state.npcTalkText = npc ? generateTalkText(npc) : '...';
            break;
          case 1: // Quest
            state.npcMenuTab = 'quest';
            state.questPage = 0;
            if (npc) {
              checkTalkQuest(npc, player, entities, state, state.msgs);
              offerQuest(npc, player, world, entities, state, state.msgs);
            }
            break;
          case 2: // Trade
            state.npcMenuTab = 'trade';
            state.tradeSel = 0;
            state.tradeMode = 'npc';
            break;
        }
      }
    } else if (state.npcMenuTab === 'talk') {
      if (interactEdge || escEdge) state.npcMenuTab = 'main';
    } else if (state.npcMenuTab === 'quest') {
      const totalQ = state.quests.filter(q => !q.done).length;
      if (upEdge || leftEdge) state.questPage = Math.max(0, state.questPage - 1);
      if (dnEdge || rightEdge) state.questPage = Math.min(Math.max(0, totalQ - 1), state.questPage + 1);
      if (interactEdge || escEdge) state.npcMenuTab = 'main';
    } else if (state.npcMenuTab === 'trade') {
      if (npc) {
        const npcInv = npc.inventory ?? [];
        const plrInv = player.inventory ?? [];
        const maxItems = state.tradeMode === 'npc' ? npcInv.length : plrInv.length;
        if (upEdge) state.tradeSel = Math.max(0, state.tradeSel - 1);
        if (dnEdge) state.tradeSel = Math.min(Math.max(0, maxItems - 1), state.tradeSel + 1);
        if (leftEdge || rightEdge) {
          state.tradeMode = state.tradeMode === 'npc' ? 'player' : 'npc';
          state.tradeSel = 0;
        }
        if (interactEdge) {
          if (state.tradeMode === 'npc' && npcInv.length > state.tradeSel) {
            // Buy from NPC: take their item, they get a random player item
            const npcSlot = npcInv[state.tradeSel];
            if (plrInv.length > 0) {
              const giveIdx = Math.min(plrInv.length - 1, Math.floor(Math.random() * plrInv.length));
              const giveSlot = plrInv[giveIdx];
              // Swap
              addItem(player, npcSlot.defId, 1);
              npcSlot.count--;
              if (npcSlot.count <= 0) npcInv.splice(state.tradeSel, 1);
              giveSlot.count--;
              if (giveSlot.count <= 0) plrInv.splice(giveIdx, 1);
              state.msgs.push({ text: 'Обмен совершён', time: state.time, color: '#4f4' });
            } else {
              state.msgs.push({ text: 'Нечего предложить', time: state.time, color: '#f84' });
            }
          } else if (state.tradeMode === 'player' && plrInv.length > state.tradeSel) {
            // Sell to NPC
            const plrSlot = plrInv[state.tradeSel];
            addItem(npc, plrSlot.defId, 1);
            plrSlot.count--;
            if (plrSlot.count <= 0) plrInv.splice(state.tradeSel, 1);
            state.msgs.push({ text: 'Предмет передан', time: state.time, color: '#4f4' });
          }
        }
      }
      if (escEdge) state.npcMenuTab = 'main';
    }
  }
  // ── Debug menu navigation ────────────────────────────────
  else if (state.showDebug) {
    const dbgEdge = input.debugScreen && !prevDebug;
    if (escEdge || dbgEdge) { state.showDebug = false; }
    else {
      if (upEdge) state.debugSel = Math.max(0, state.debugSel - 1);
      if (dnEdge) state.debugSel = Math.min(4, state.debugSel + 1);
      if (interactEdge) execDebugCommand(state.debugSel, player, entities, state, nextEntityId);
    }
  }
  // ── Normal gameplay toggles ──────────────────────────────
  else {
    const dbgEdge = input.debugScreen && !prevDebug;
    if (dbgEdge) { state.showDebug = true; state.debugSel = 0; }
    if (invEdge) { state.showInventory = true; state.invSel = 0; }
    if (questEdge) { state.showQuests = true; }
  }

  // Update prev states
  prevEsc = input.escape;
  prevMenuUp = input.invUp;
  prevMenuDn = input.invDn;
  prevMenuLeft = input.invLeft;
  prevMenuRight = input.invRight;
  prevMenuInteract = input.interact;
  prevInvMenu = input.inv;
  prevQuestMenu = input.questLog;
  prevDebug = input.debugScreen;

  // Auto-pause when any menu is open
  state.paused = state.showMenu || state.showInventory || state.showNpcMenu || state.showQuests || state.showDebug;
}

/* ── Game loop ────────────────────────────────────────────────── */
let lastTime = performance.now();

function gameLoop(now: number): void {
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(rawDt, 0.05); // cap delta

  // Menu input always processed (even when paused)
  handleMenuInput();

  // ── Update ───────────────────────────────────────────────
  if (!state.paused && !state.gameOver) {
    state.time += dt;
    state.tick++;

    // Update game clock (1 real second = 1 game minute)
    state.clock.totalMinutes += dt;
    const totalMins = Math.floor(state.clock.totalMinutes);
    state.clock.hour = (8 + Math.floor(totalMins / 60)) % 24;  // start at 8:00
    state.clock.minute = totalMins % 60;

    movePlayer(dt);
    playerActions(dt);
    // Player urination (P key)
    if (input.pee && player.alive && player.needs && player.needs.pee > 5) {
      const range = 1.5;
      const ux = player.x + Math.cos(player.angle) * range;
      const uy = player.y + Math.sin(player.angle) * range;
      const cx = ((Math.floor(ux) % W) + W) % W;
      const cy = ((Math.floor(uy) % W) + W) % W;
      if (!world.solid(cx, cy)) {
        const fx = ((ux % 1) + 1) % 1;
        const fy = ((uy % 1) + 1) % 1;
        world.stamp(cx, cy, fx, fy, 0.15, 60, Math.floor(state.time * 100), 200, 180, 30);
        player.needs.pee = Math.max(0, player.needs.pee - 12 * dt);
        if (player.needs.pee <= 5) {
          state.msgs.push({ text: 'Полегчало.', time: state.time, color: '#da4' });
        }
      }
    }
    updateProjectiles(dt);
    updateDoors(dt);
    updateNeeds(entities, dt, state.time, state.msgs, player.id);
    updateAI(world, entities, dt, state.time, state.msgs, player.id, state.clock, state.samosborActive, nextEntityId);
    updateSamosbor(world, entities, state, dt, nextEntityId);
    // Faction zone capture (cell-based territory control)
    updateFactionCapture(world, entities, dt);
    // Regenerate PSI for player
    regenPsi(player, dt);

    // Blood trails from wounded entities + particle physics
    updateBloodTrails(world, entities, dt);
    updateParticles(world, dt);

    // Cycle slide textures every 5 seconds — left tile=even, right tile=odd
    if (world.slideCells.length >= 2) {
      const pair = Math.floor(state.time / 5) % 4;
      world.wallTex[world.slideCells[0]] = Tex.SLIDE_1 + pair * 2;     // left
      world.wallTex[world.slideCells[1]] = Tex.SLIDE_1 + pair * 2 + 1; // right
    }
    // Check quest completion
    if (state.tick % 30 === 0) {
      checkQuests(player, world, entities, state, state.msgs);
    }

    // Debug samosbor trigger (TAB key)
    if (input.debugSamosbor && !prevSamosbor) {
      state.samosborTimer = 0; // force trigger on next tick
      state.msgs.push({ text: '[DEBUG] Самосбор форсирован', time: state.time, color: '#ff0' });
    }
    prevSamosbor = input.debugSamosbor;

    // Auto-pickup when walking
    if (state.tick % 15 === 0) {
      pickupNearby(world, entities, player, state.msgs, state.time);
    }

    // Check player death
    if (!player.alive && !state.gameOver) {
      state.gameOver = true;
    }

    // Clean up dead entities (except player) — projectiles cleaned every frame, rest every 2s
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (!e.alive && e.type !== EntityType.PLAYER) {
        if (e.type === EntityType.PROJECTILE || state.tick % 120 === 0) {
          entities.splice(i, 1);
        }
      }
    }

    // Trim old messages
    while (state.msgs.length > 50) state.msgs.shift();
  }

  checkRestart();

  // ── Render ───────────────────────────────────────────────
  // Fog density varies by floor level
  let baseFog = 0.065;
  if (state.currentFloor === FloorLevel.MAINTENANCE) baseFog = 0.08;
  if (state.currentFloor === FloorLevel.HELL) baseFog = 0.05; // less fog, more horror visibility
  const fogDensity = state.samosborActive ? baseFog + 0.03 : baseFog;
  const glitch = state.samosborActive ? 0.3 + Math.sin(state.time * 5) * 0.15 : 0;

  renderScene(buf32, world, textures, sprites, entities,
    player.x, player.y, player.angle, player.pitch,
    fogDensity, glitch);

  // Blood particles on top of scene
  {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeLen = Math.tan(HALF_FOV);
    const planeX = -dirY * planeLen;
    const planeY =  dirX * planeLen;
    const horizonShift = Math.floor(player.pitch * SCR_H);
    const halfH = Math.floor(SCR_H / 2) + horizonShift;
    renderParticles(buf32, SCR_W, SCR_H, player.x, player.y, player.angle,
      dirX, dirY, planeX, planeY, halfH, zBuf);
  }

  // Blit low-res buffer to canvas (pixel-perfect upscale)
  screen.data.set(new Uint8ClampedArray(buf32.buffer));

  // Use drawImage for fast upscale
  const offscreen = new OffscreenCanvas(SCR_W, SCR_H);
  const offCtx = offscreen.getContext('2d')!;
  offCtx.putImageData(screen, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

  // Draw HUD on top
  drawHUD(ctx, canvas.width / SCR_W, canvas.height / SCR_H, player, state, world, entities);

  requestAnimationFrame(gameLoop);
}

/* ── Title screen ─────────────────────────────────────────────── */
function showTitle(): void {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#c00';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ГИГАХРУЩ', canvas.width / 2, canvas.height / 2 - 40);
  ctx.fillStyle = '#666';
  ctx.font = '16px monospace';
  ctx.fillText('бесконечный бетонный лабиринт', canvas.width / 2, canvas.height / 2 + 10);
  ctx.fillStyle = '#888';
  ctx.fillText('Нажмите ENTER чтобы войти', canvas.width / 2, canvas.height / 2 + 50);
  ctx.fillStyle = '#555';
  ctx.font = '12px monospace';
  ctx.fillText('WASD — движение  |  Мышь — обзор  |  E — действие  |  F — подобрать  |  I — инвентарь  |  M — карта  |  Пробел — удар  |  TAB — самосбор', canvas.width / 2, canvas.height / 2 + 90);
  ctx.textAlign = 'left';
}

let started = false;
showTitle();

document.addEventListener('keydown', function startHandler(e: KeyboardEvent) {
  if (e.code === 'Enter' && !started) {
    started = true;
    document.removeEventListener('keydown', startHandler);
    canvas.requestPointerLock();
    startAmbientDrone();
    requestAnimationFrame(gameLoop);
  }
});
