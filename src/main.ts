/* ── ГИГАХРУЩ — main entry point ──────────────────────────────── */
import './index.css';

import {
  W, Cell, DoorState, FloorLevel, Feature, Tex, RoomType, LiftDirection,
  type Entity, type GameState,
  EntityType, Faction, MonsterKind, ProjType, QuestType, AIGoal,
} from './core/types';
import { World } from './core/world';
import { generateWorld } from './gen/living';
import { generateMaintenance } from './gen/maintenance';
import { generateHell, updateHellPopulation, resetHellPopulationState } from './gen/hell';
import { generateVoid } from './gen/void';
import { generateTextures } from './render/textures';
import { generateSprites } from './render/sprites';
import { Spr, monsterSpr } from './render/sprite_index';
import { SCR_W, SCR_H, initWebGL, renderSceneGL, updateWorldData, updateDynamicData, disposeWebGL } from './render/webgl';
import { drawHUD } from './render/hud';
import { spawnBloodHit, spawnDeathPool, updateBloodTrails, updateParticles, particles } from './render/blood';
import { stampMark, MarkType } from './render/marks';
import { updateNeeds } from './systems/needs';
import { updateAI } from './systems/ai';
import { generateTalkText, generateNpcTradeItems } from './data/dialogue';
import { updateSamosbor, rebuildWorld, clearFogInZone } from './systems/samosbor';
import {
  pickupNearby, useItem, dropItem, getWeaponStats, addItem,
  consumeDurability, consumeAmmo, consumeToolDurability, getEquippedToolDurability,
} from './systems/inventory';
import { createInput, bindInput } from './input';
import { freshNeeds, ITEMS } from './data/catalog';
import { entityDisplayName } from './entities/monster';
import {
  playFootstep, playAttack, playDoor,
  playGunshot, playShotgun, playNailgun, playBreak,
  playFleshHit, playPsiCast,
  playPPSh, playChainsaw, playMachinegun, playExplosion,
  playGauss, playPlasma, playBFG, playFlame, playPsiBeam,
  startAmbientDrone, setListenerPos,
} from './systems/audio';
import { offerQuest, checkQuests, checkTalkQuest, notifyKill } from './systems/quests';
import {
  freshRPG, awardXP, xpForMonsterKill, xpForNpcKill,
  strMeleeDmgMult, agiSpeedMult, agiAttackSpeedMult,
  spendAttrPoint,
} from './systems/rpg';
import { execDebugCommand } from './systems/debug';
import {
  castInstantSpell, updatePsiEffects, psiAoeExplosion,
  isNoClipActive, resetPsiState,
} from './systems/psi';
import {
  applyDamageRelationPenalty,
  updateFactionCapture, initFactionControl, countFactionTerritory, spawnPatrolSquads,
  zoneFactionToFaction, spawnTerritoryReinforcements,
} from './systems/factions';
import { addFactionRel, addFactionRelMutual, initFactionRelations } from './data/relations';
import { type DeathCam, initDeathCam, updateDeathCam, getDeathCamAngle, getDeathCamPitch } from './systems/death';
import { onHeraldKilled, onCreatorKilled, onHellArrival, tryCreateVoiceQuest, onVoidEntry } from './data/plot_events';

/* ── Canvas setup ─────────────────────────────────────────────── */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;
const ctx = hudCanvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  hudCanvas.width = window.innerWidth;
  hudCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* ── Generate assets ──────────────────────────────────────────── */
const textures = generateTextures();
const sprites  = generateSprites();

/* ── Game initialization ──────────────────────────────────────── */
let world: World;
let entities: Entity[];
let player: Entity;
let state: GameState;
let nextEntityId = { v: 1 };
let prevPlayerHp = 100; // track HP changes for damage flash
let deathCam: DeathCam | null = null;
let pendingLoad: (() => void) | null = null; // deferred heavy generation callback
let pendingLoadDrawn = false; // true = loading screen was painted, next frame runs the callback

function drawLoading(): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  ctx.fillStyle = '#aaa';
  ctx.font = `${Math.round(hudCanvas.height / 20)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('ЗАГРУЗКА...', hudCanvas.width / 2, hudCanvas.height / 2);
  ctx.textAlign = 'left';
}

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
    tool: '',
    name: 'Вы',
    rpg: freshRPG(1),
    faction: Faction.PLAYER,
  };
  entities.push(player);
  prevPlayerHp = player.hp ?? 100;

  // Initialize faction relations and per-cell faction control
  initFactionRelations();
  initFactionControl(world);
  const fStats = countFactionTerritory(world);
  spawnPatrolSquads(world, entities, nextEntityId, fStats);
  resetHellPopulationState();

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
    tradeCursorX: 0,
    tradeCursorY: 0,
    tradeSide: 'npc',
    showDebug: false,
    debugSel: 0,
    showFactions: false,
    showLog: false,
    logScroll: 0,
    msgLog: [{ text: 'Добро пожаловать в ГИГАХРУЩ. Закройте дверь.', color: '#aaa', day: 0, hour: 8, minute: 0 }],
    dmgFlash: 0,
    dmgSeed: 0,
    deathTimer: 0,
    sleeping: false,
    beamFx: 0,
    beamAngle: 0,
    beamLen: 0,
    gameWon: false,
  };
  resetPsiState();

  // Initialize / reinitialize WebGL with current world data
  disposeWebGL();
  initWebGL(canvas, textures, sprites, world);
  updateWorldData(world);
}

drawLoading();
setTimeout(() => {
  initGame();
  showTitle();
}, 0);

/* ── Input ────────────────────────────────────────────────────── */
const input = createInput();
bindInput(input, canvas);

/* ── Toggles (edge-detect) ────────────────────────────────────── */
let prevMap = false, prevDebug = false; // eslint-disable-line
let stepAccum = 0; // footstep sound accumulator
let _prevMsgCount = 0; // for syncing msgs → msgLog

/** Sync new msgs to persistent msgLog with clock timestamps */
function syncMsgLog(): void {
  const msgs = state.msgs;
  if (msgs.length > _prevMsgCount) {
    const day = Math.floor(state.clock.totalMinutes / 1440);
    for (let i = _prevMsgCount; i < msgs.length; i++) {
      state.msgLog.push({
        text: msgs[i].text,
        color: msgs[i].color,
        day,
        hour: state.clock.hour,
        minute: state.clock.minute,
      });
    }
    if (state.msgLog.length > 500) state.msgLog.splice(0, state.msgLog.length - 500);
  }
  _prevMsgCount = msgs.length;
}

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
  if (state.sleeping) return; // no movement while sleeping

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
    const canClip = isNoClipActive();
    // X movement – check all 4 AABB corners (skip if noclip effect is active)
    const nx = player.x + mx;
    if (canClip || (
        !world.solid(Math.floor(nx + r), Math.floor(player.y + r)) &&
        !world.solid(Math.floor(nx + r), Math.floor(player.y - r)) &&
        !world.solid(Math.floor(nx - r), Math.floor(player.y + r)) &&
        !world.solid(Math.floor(nx - r), Math.floor(player.y - r)))) {
      player.x = ((nx % W) + W) % W;
    }
    // Y movement – check all 4 AABB corners (use updated X)
    const ny = player.y + my;
    if (canClip || (
        !world.solid(Math.floor(player.x + r), Math.floor(ny + r)) &&
        !world.solid(Math.floor(player.x + r), Math.floor(ny - r)) &&
        !world.solid(Math.floor(player.x - r), Math.floor(ny + r)) &&
        !world.solid(Math.floor(player.x - r), Math.floor(ny - r)))) {
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

/* ── Weapon sound dispatch ─────────────────────────────────────── */
function playWeaponSound(weaponId: string, ws: import('./data/weapons').WeaponStats): void {
  const sid = ws.soundId ?? weaponId;
  switch (sid) {
    case 'shotgun':    playShotgun(); break;
    case 'nailgun':    playNailgun(); break;
    case 'ppsh':       playPPSh(); break;
    case 'chainsaw':   playChainsaw(); break;
    case 'machinegun': playMachinegun(); break;
    case 'grenade':    playGunshot(); break; // throw sound; explosion plays on impact
    case 'gauss':      playGauss(); break;
    case 'plasma':     playPlasma(); break;
    case 'bfg':        playBFG(); break;
    case 'flame':      playFlame(); break;
    default:           playGunshot(); break;
  }
}

/* ── Player actions ───────────────────────────────────────────── */
function playerActions(_dt: number): void {
  if (!player.alive) return;
  if (state.sleeping) return; // no actions while sleeping

  // Toggle map
  if (input.map && !prevMap) state.mapMode = (state.mapMode + 1) % 3;
  prevMap = input.map;

  // Pickup (on interact key E, if looking at item drop)
  // Auto-pickup handles walking over items (see tick%15 below)

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
        const dir = world.liftDir[lci] as LiftDirection;
        switchFloor(dir);
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

    if (ws.psiCost) {
      // ── PSI spell: consume PSI instead of ammo ──────────
      if (!player.rpg || player.rpg.psi < ws.psiCost) {
        state.msgs.push({ text: 'Недостаточно ПСИ!', time: state.time, color: '#f84' });
        player.attackCd = 0.5;
      } else {
        player.rpg.psi -= ws.psiCost;
        if (ws.isRanged) {
          // Projectile PSI spell
          const cos = Math.cos(player.angle);
          const sin = Math.sin(player.angle);
          const spd = ws.projSpeed ?? 14;
          const proj: Entity = {
            id: nextEntityId.v++,
            type: EntityType.PROJECTILE,
            x: player.x + cos * 0.5,
            y: player.y + sin * 0.5,
            angle: player.angle,
            pitch: 0,
            alive: true,
            speed: 0,
            sprite: ws.projSprite ?? Spr.PSI_BOLT,
            vx: Math.cos(player.angle) * spd,
            vy: Math.sin(player.angle) * spd,
            vz: player.pitch * spd * 0.5,
            projDmg: ws.dmg,
            projLife: 3.0,
            ownerId: player.id,
            spriteScale: 0.3,
            spriteZ: 0.5,
          };
          if (ws.aoeRadius) {
            proj.aoeRadius = ws.aoeRadius;
            proj.aoeDmg = ws.dmg;
          }
          entities.push(proj);
        } else {
          // Instant PSI spell
          const psiResult = castInstantSpell(
            ws.psiEffect ?? '', player, entities, world,
            state.msgs, state.time,
            (e) => handleKill(e, true),
          );
          if (psiResult.beamLen) {
            state.beamFx = 0.35;
            state.beamAngle = player.angle;
            state.beamLen = psiResult.beamLen;
          }
        }
        if (ws.psiEffect === 'beam') playPsiBeam(); else playPsiCast();
        player.attackCd = ws.speed * atkSpeedMod;
      }
    } else if (ws.isRanged) {
      // ── Ranged attack: spawn projectile(s) ──────────────
      if (consumeAmmo(player)) {
        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const pellets = ws.pellets ?? 1;
        const spread = ws.spread ?? 0;
        const pt = ws.projType ?? ProjType.NORMAL;
        for (let p = 0; p < pellets; p++) {
          const ang = player.angle + (Math.random() - 0.5) * spread;
          const spd = ws.projSpeed ?? 15;
          const proj: Entity = {
            id: nextEntityId.v++,
            type: EntityType.PROJECTILE,
            x: player.x + cos * 0.5,
            y: player.y + sin * 0.5,
            angle: ang,
            pitch: 0,
            alive: true,
            speed: 0,
            sprite: ws.projSprite ?? Spr.BULLET,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            vz: player.pitch * spd * 0.5 + (pt === ProjType.FLAME ? (Math.random() - 0.5) * 0.8 : 0),
            projDmg: ws.dmg,
            projLife: pt === ProjType.GRENADE ? 1.5 : pt === ProjType.FLAME ? 0.7 : 3.0,
            ownerId: player.id,
            spriteScale: pt === ProjType.BFG ? 0.6 : pt === ProjType.FLAME ? (0.55 + Math.random() * 0.25) : pt === ProjType.GRENADE ? 0.35 : 0.25,
            spriteZ: 0.5,
            projType: pt,
            projGore: pt === ProjType.GRENADE || pt === ProjType.BFG ? 3
              : (player.weapon === 'shotgun' || player.weapon === 'chainsaw') ? 3
              : (player.weapon === 'ak47' || player.weapon === 'machinegun' || player.weapon === 'nailgun' || player.weapon === 'gauss' || player.weapon === 'plasma') ? 2
              : pt === ProjType.FLAME ? 1 : 1,
          };
          if (ws.aoeRadius) {
            proj.aoeRadius = ws.aoeRadius;
            proj.aoeDmg = ws.dmg;
          }
          entities.push(proj);
        }
        // Play weapon-specific sound
        playWeaponSound(player.weapon ?? '', ws);
        player.attackCd = ws.speed * atkSpeedMod;
      } else {
        state.msgs.push({ text: 'Нет патронов!', time: state.time, color: '#f84' });
        player.attackCd = 0.5;
      }
    } else {
      // ── Melee attack: range check + durability ──────────
      // Fist base damage = player level; other melee uses ws.dmg
      const baseDmg = (!player.weapon && player.rpg) ? player.rpg.level : ws.dmg;
      // STR bonus to melee damage
      const strMult = player.rpg ? strMeleeDmgMult(player.rpg) : 1;
      const dmg = Math.round(baseDmg * strMult);
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
              applyDamageRelationPenalty(player.faction, e.faction, dmg);
            }
            // Blood splatter on hit — use player facing as velocity direction
            const meleeSpd = 6;
            const mVx = Math.cos(player.angle) * meleeSpd;
            const mVy = Math.sin(player.angle) * meleeSpd;
            spawnBloodHit(world, e.x, e.y, player.angle, dmg, e.type === EntityType.MONSTER, mVx, mVy, 0.5);
            state.msgs.push({ text: `Удар! ${entityDisplayName(e)} -${dmg}`, time: state.time, color: '#fc4' });
            if (e.hp <= 0) {
              e.alive = false;
              const meleeGore = (player.weapon === 'chainsaw' || player.weapon === 'axe') ? 3
                : (player.weapon === 'rebar' || player.weapon === 'pipe') ? 2 : 1;
              handleKill(e, true, mVx, mVy, meleeGore);
            }
          }
          hitSomething = true;
          break;
        }
      }
      if (player.weapon === 'chainsaw') playChainsaw(); else playAttack();
      // Consume durability on melee hit
      if (hitSomething) {
        const broke = consumeDurability(player, state.msgs, state.time);
        if (broke) playBreak();
      }
      player.attackCd = ws.speed * atkSpeedMod;
    }
  }
}

/* ── Drop inventory as ITEM_DROP entities at death position ──── */
function dropEntityInventory(e: Entity): void {
  if (!e.inventory || e.inventory.length === 0) return;
  for (const item of e.inventory) {
    if (!item || item.count <= 0) continue;
    entities.push({
      id: nextEntityId.v++, type: EntityType.ITEM_DROP,
      x: e.x + (Math.random() - 0.5) * 0.5,
      y: e.y + (Math.random() - 0.5) * 0.5,
      angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
      inventory: [{ defId: item.defId, count: item.count, data: item.data }],
    });
  }
  e.inventory = [];
}

/* ── Defense quest continuous monster spawner (step 8) ─────────── */
let _defenseSpawnAccum = 0;
function updateDefenseQuestSpawn(dt: number): void {
  const quest = state.quests.find(q => q.plotStepIndex === 8 && !q.done && q.type === QuestType.KILL);
  if (!quest) { _defenseSpawnAccum = 0; return; }

  // Find Major Grom's position as spawn anchor
  const grom = entities.find(e => e.plotNpcId === 'major_grom' && e.alive);
  if (!grom) return;

  _defenseSpawnAccum += dt;
  if (_defenseSpawnAccum < 3.0) return; // spawn wave every 3 seconds
  _defenseSpawnAccum -= 3.0;

  // Count active monsters near Grom
  let nearbyMonsters = 0;
  for (const e of entities) {
    if (e.type === EntityType.MONSTER && e.alive) {
      if (world.dist(grom.x, grom.y, e.x, e.y) < 25) nearbyMonsters++;
    }
  }
  if (nearbyMonsters >= 8) return; // enough already

  // Spawn 2-3 monsters at ~3-8 cells from Grom (tight corridors)
  const kinds = [MonsterKind.TVAR, MonsterKind.SBORKA, MonsterKind.ZOMBIE, MonsterKind.SHADOW, MonsterKind.POLZUN];
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 5;
    let mx = -1, my = -1;
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = angle + (attempt > 0 ? (Math.random() - 0.5) * 1.5 : 0);
      const d = dist + (attempt > 0 ? (Math.random() - 0.5) * 4 : 0);
      const tx = ((Math.floor(grom.x) + Math.round(Math.cos(a) * d)) % W + W) % W;
      const ty = ((Math.floor(grom.y) + Math.round(Math.sin(a) * d)) % W + W) % W;
      if (world.cells[world.idx(tx, ty)] === Cell.FLOOR) {
        mx = tx; my = ty; break;
      }
    }
    if (mx < 0) continue;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const ci = world.idx(mx, my);
    const zid = world.zoneMap[ci];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 6) : 6;
    const mRpg = freshRPG(zoneLevel);
    const baseHp: Record<number, number> = {
      [MonsterKind.TVAR]: 40, [MonsterKind.SBORKA]: 5,
      [MonsterKind.ZOMBIE]: 25, [MonsterKind.SHADOW]: 45, [MonsterKind.POLZUN]: 80,
    };
    const hp = Math.round((baseHp[kind] ?? 40) * (1 + 0.12 * (zoneLevel - 1)));
    entities.push({
      id: nextEntityId.v++, type: EntityType.MONSTER,
      x: mx + 0.5, y: my + 0.5,
      angle: Math.atan2(grom.y - my - 0.5, grom.x - mx - 0.5),
      pitch: 0, alive: true,
      speed: 1.5 + Math.random() * 0.8,
      sprite: monsterSpr(kind),
      hp, maxHp: hp,
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: Math.floor(grom.x), ty: Math.floor(grom.y), path: [], pi: 0, stuck: 0, timer: 0 },
      rpg: mRpg,
    });
  }
}

/* ── Shared kill handling (melee + projectile) ────────────────── */
function handleKill(e: Entity, killerIsPlayer: boolean, pvx = 0, pvy = 0, goreLevel = 1): void {
  // Death blood pool — directional + gore-scaled
  spawnDeathPool(world, e.x, e.y, e.type === EntityType.MONSTER, goreLevel, pvx, pvy);
  state.msgs.push({ text: `${entityDisplayName(e)} ${e.isFemale ? 'повержена' : 'повержен'}!`, time: state.time, color: '#4f4' });
  // Drop NPC inventory as loot
  if (e.type === EntityType.NPC) dropEntityInventory(e);
  if (e.isFogBoss && e.fogBossZone !== undefined) {
    clearFogInZone(world, e.fogBossZone, state.msgs, state.time);
  }
  if (e.monsterKind !== undefined) {
    notifyKill(e.monsterKind, state);
    // Drop strange_clot from Shadow when plot KILL quest for shadows is active
    if (e.monsterKind === MonsterKind.SHADOW && killerIsPlayer) {
      const hasPlotShadowQuest = state.quests.some(q => !q.done && q.plotStepIndex !== undefined && q.targetMonsterKind === MonsterKind.SHADOW);
      if (hasPlotShadowQuest) {
        entities.push({
          id: nextEntityId.v++, type: EntityType.ITEM_DROP,
          x: e.x + (Math.random() - 0.5) * 0.3,
          y: e.y + (Math.random() - 0.5) * 0.3,
          angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
          inventory: [{ defId: 'strange_clot', count: 1 }],
        });
        state.msgs.push({ text: 'Теневик выронил странный пульсирующий сгусток!', time: state.time, color: '#c8f' });
      }
    }
    if (killerIsPlayer) {
      awardXP(player, xpForMonsterKill(e.monsterKind, e.rpg?.level ?? 1), state.msgs, state.time);
    }
    // Herald killed — check if voice quest (kill 3 heralds) is now complete → spawn portal
    if (e.monsterKind === MonsterKind.HERALD && killerIsPlayer && state.currentFloor === FloorLevel.HELL) {
      if (onHeraldKilled(e, world, state)) updateWorldData(world);
    }
    // Creator killed — spawn return portal
    if (e.monsterKind === MonsterKind.CREATOR && killerIsPlayer && state.currentFloor === FloorLevel.VOID) {
      if (onCreatorKilled(e, world, state)) updateWorldData(world);
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
    const pt = p.projType ?? ProjType.NORMAL;

    // Grenade explodes on timer expiry
    if (p.projLife! <= 0) {
      if (pt === ProjType.GRENADE || pt === ProjType.BFG) {
        triggerExplosion(p, pt);
      }
      p.alive = false;
      continue;
    }

    // ── 3D vertical physics: update vz → spriteZ ──
    const vz = p.vz ?? 0;
    const gravity = pt === ProjType.FLAME ? 1.8 : pt === ProjType.GRENADE ? 2.5 : pt === ProjType.BFG ? 0.3 : 1.2;
    p.vz = vz - gravity * dt;
    p.spriteZ = (p.spriteZ ?? 0.5) + vz * dt;

    // Floor impact (spriteZ ≤ 0)
    if ((p.spriteZ ?? 0) <= 0) {
      p.spriteZ = 0;
      const fx = Math.floor(p.x), fy = Math.floor(p.y);
      if (pt === ProjType.GRENADE || pt === ProjType.BFG) {
        triggerExplosion(p, pt);
      } else if (pt === ProjType.FLAME) {
        if (!world.solid(fx, fy)) {
          const seed = Math.floor(Math.random() * 99999);
          stampMark(world, fx, fy, (p.x % 1 + 1) % 1, (p.y % 1 + 1) % 1,
            0.3, MarkType.BURN, seed, 8, 5, 2, 180);
        }
      } else {
        if (!world.solid(fx, fy)) {
          const seed = Math.floor(Math.random() * 99999);
          stampMark(world, fx, fy, (p.x % 1 + 1) % 1, (p.y % 1 + 1) % 1,
            0.08, MarkType.BULLET, seed, 20, 18, 14, 140);
        }
      }
      if (p.aoeRadius)
        psiAoeExplosion(p, entities, world, state.msgs, state.time, (e) => handleKill(e, p.ownerId === player.id));
      p.alive = false;
      continue;
    }
    // Ceiling impact (spriteZ ≥ 1)
    if ((p.spriteZ ?? 0) >= 1.0) {
      p.spriteZ = 1.0;
      p.vz = 0;
      if (pt === ProjType.GRENADE || pt === ProjType.BFG) {
        triggerExplosion(p, pt);
        p.alive = false;
        continue;
      }
      // Bounce off ceiling — reverse vz with damping
      p.vz = -Math.abs(vz) * 0.3;
    }

    // Flame: leave charred burn marks on floor while flying low
    if (pt === ProjType.FLAME && (p.spriteZ ?? 0.5) < 0.2) {
      const fx = Math.floor(p.x), fy = Math.floor(p.y);
      if (!world.solid(fx, fy)) {
        const seed = Math.floor(Math.random() * 99999);
        stampMark(world, fx, fy, (p.x % 1 + 1) % 1, (p.y % 1 + 1) % 1,
          0.25, MarkType.BURN, seed, 8, 5, 2, 160);
      }
    }

    const nx = p.x + (p.vx ?? 0) * dt;
    const ny = p.y + (p.vy ?? 0) * dt;

    // Wrap toroidal
    const wx = ((nx % W) + W) % W;
    const wy = ((ny % W) + W) % W;

    // Wall collision → leave bullet hole decal
    if (world.solid(Math.floor(wx), Math.floor(wy))) {
      const cellX = Math.floor(wx), cellY = Math.floor(wy);
      const bvx = p.vx ?? 0, bvy = p.vy ?? 0;
      const avx = Math.abs(bvx), avy = Math.abs(bvy);
      let impactU: number;
      if (avx > avy) {
        const faceX = bvx > 0 ? cellX : cellX + 1;
        const t = avx > 0.01 ? (wx - faceX) / bvx : 0;
        impactU = ((wy - bvy * t) % 1 + 1) % 1;
      } else {
        const faceY = bvy > 0 ? cellY : cellY + 1;
        const t = avy > 0.01 ? (wy - faceY) / bvy : 0;
        impactU = ((wx - bvx * t) % 1 + 1) % 1;
      }
      const impactV = 1.0 - (p.spriteZ ?? 0.5);
      if (pt === ProjType.GRENADE || pt === ProjType.BFG) {
        // Explode on wall impact
        triggerExplosion(p, pt);
      } else if (pt === ProjType.FLAME) {
        // Flame: charred burn mark on wall
        const seed = Math.floor(Math.random() * 99999);
        stampMark(world, cellX, cellY, impactU, impactV, 0.25, MarkType.BURN, seed, 5, 3, 1, 190, true);
      } else {
        // Normal bullet hole decal
        const seed = Math.floor(Math.random() * 99999);
        stampMark(world, cellX, cellY, impactU, impactV, 0.1, MarkType.BULLET, seed, 30, 25, 18, 160, true);
        stampMark(world, cellX, cellY, impactU, impactV, 0.05, MarkType.BULLET, seed + 1, 8, 8, 8, 255, true);
      }
      if (p.aoeRadius && pt !== ProjType.GRENADE && pt !== ProjType.BFG)
        psiAoeExplosion(p, entities, world, state.msgs, state.time, (e) => handleKill(e, p.ownerId === player.id));
      p.alive = false;
      continue;
    }

    p.x = wx;
    p.y = wy;

    // Entity collision — check monsters and NPCs
    const dmg = p.projDmg ?? 0;
    for (const e of entities) {
      if (!e.alive || e.id === p.ownerId) continue;
      if (e.type !== EntityType.MONSTER && e.type !== EntityType.NPC && e.type !== EntityType.PLAYER) continue;
      const hitRadius = pt === ProjType.FLAME ? 0.8 : 0.6;
      if (world.dist(p.x, p.y, e.x, e.y) < hitRadius) {
        if (e.hp !== undefined) {
          e.hp -= dmg;
          if (e.type === EntityType.NPC && p.ownerId === player.id) {
            applyDamageRelationPenalty(player.faction, e.faction, dmg);
          }
          const hitAngle = Math.atan2(p.vy ?? 0, p.vx ?? 0);
          // Use projectile position as blood origin — blood at impact point, not feet
          const bloodX = (p.x + e.x) * 0.5;  // midpoint between projectile and entity
          const bloodY = (p.y + e.y) * 0.5;
          const hitZ = p.spriteZ ?? 0.5;
          spawnBloodHit(world, bloodX, bloodY, hitAngle, dmg, e.type === EntityType.MONSTER, p.vx ?? 0, p.vy ?? 0, hitZ);
          if (e.hp <= 0) {
            e.alive = false;
            e.hp = 0;
            handleKill(e, p.ownerId === player.id, p.vx ?? 0, p.vy ?? 0, p.projGore ?? 1);
          }
        }
        if (pt === ProjType.GRENADE || pt === ProjType.BFG) {
          triggerExplosion(p, pt);
        } else if (p.aoeRadius) {
          psiAoeExplosion(p, entities, world, state.msgs, state.time, (e2) => handleKill(e2, p.ownerId === player.id));
        }
        // Flame projectiles pierce through (don't die on hit)
        if (pt !== ProjType.FLAME) {
          p.alive = false;
          break;
        }
      }
    }
  }
}

/* ── Explosion (grenade / BFG) — AoE damage + scorch decals ──── */
function triggerExplosion(p: Entity, pt: ProjType): void {
  const radius = p.aoeRadius ?? 4;
  const dmg = p.aoeDmg ?? p.projDmg ?? 80;
  const isPlayer = p.ownerId === player.id;

  // AoE damage to all entities in radius
  let hits = 0;
  for (const e of entities) {
    if (!e.alive || e.id === p.ownerId) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER && e.type !== EntityType.PLAYER) continue;
    const dx = ((e.x - p.x + W / 2) % W + W) % W - W / 2;
    const dy = ((e.y - p.y + W / 2) % W + W) % W - W / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) continue;
    if (e.hp !== undefined) {
      const falloff = 1 - (dist / radius) * 0.6;
      const finalDmg = Math.round(dmg * falloff);
      e.hp -= finalDmg;
      // Explosion blast pushes blood outward from epicenter
      const blastVx = dist > 0.1 ? (dx / dist) * 12 : 0;
      const blastVy = dist > 0.1 ? (dy / dist) * 12 : 0;
      spawnBloodHit(world, e.x, e.y, Math.atan2(dy, dx), finalDmg, e.type === EntityType.MONSTER, blastVx, blastVy, 0.4);
      if (e.type === EntityType.NPC && isPlayer) {
        applyDamageRelationPenalty(player.faction, e.faction, finalDmg);
      }
      if (e.hp <= 0) {
        e.alive = false;
        handleKill(e, isPlayer, blastVx, blastVy, 3);
      }
      hits++;
    }
  }

  // Scorch: one large coherent mark centered at explosion
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  const fx = (p.x % 1 + 1) % 1, fy = (p.y % 1 + 1) % 1;
  const seed = Math.floor(Math.random() * 99999);
  stampMark(world, cx, cy, fx, fy, radius * 1.2, MarkType.SCORCH, seed, 15, 10, 5, 230);

  // Radial debris marks around explosion center
  const debrisCount = pt === ProjType.BFG ? 12 : 8;
  for (let i = 0; i < debrisCount; i++) {
    const ang = (i / debrisCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 0.5 + Math.random() * (radius * 0.5);
    const debX = p.x + Math.cos(ang) * dist;
    const debY = p.y + Math.sin(ang) * dist;
    const dcx = Math.floor(((debX % W) + W) % W);
    const dcy = Math.floor(((debY % W) + W) % W);
    if (!world.solid(dcx, dcy)) {
      const dfx = ((debX % 1) + 1) % 1, dfy = ((debY % 1) + 1) % 1;
      const markType = pt === ProjType.BFG ? MarkType.PSI : MarkType.BURN;
      const debrisR = pt === ProjType.BFG ? 10 : 15;
      const debrisG = pt === ProjType.BFG ? 30 : 10;
      const debrisB = pt === ProjType.BFG ? 10 : 5;
      stampMark(world, dcx, dcy, dfx, dfy, 0.12 + Math.random() * 0.15, markType,
        seed + i + 100, debrisR, debrisG, debrisB, 150 + Math.floor(Math.random() * 60));
    }
  }

  // Sounds
  playExplosion();

  // Screen flash for ALL explosions
  if (pt === ProjType.BFG) {
    state.dmgFlash = 0.8;
    state.dmgSeed = 2; // green tint marker
    state.msgs.push({ text: `БФГ! Уничтожено целей: ${hits}`, time: state.time, color: '#4f4' });
  } else {
    state.dmgFlash = Math.max(state.dmgFlash, 0.4);
    state.dmgSeed = 3; // orange tint marker for explosions
    state.msgs.push({ text: `Взрыв! Поражено: ${hits}`, time: state.time, color: '#fa0' });
  }
}

/* ── Restart check ────────────────────────────────────────────── */
function checkRestart(): void {
  if (state.gameOver && input.use) {
    deathCam = null;
    pendingLoad = () => { initGame(); };
    input.use = false;
  }
}

/* ── Floor switching via lift ─────────────────────────────────── */
const FLOOR_NAMES: Record<FloorLevel, string> = {
  [FloorLevel.LIVING]:      'Жилая зона',
  [FloorLevel.MAINTENANCE]: 'Коллекторы',
  [FloorLevel.HELL]:        'Преисподняя',
  [FloorLevel.VOID]:        'Пустота',
};

function switchFloor(direction: LiftDirection): void {
  // Determine target floor based on direction
  let nextFloor: FloorLevel;
  if (direction === LiftDirection.DOWN) {
    if (state.currentFloor >= FloorLevel.HELL) return; // already at bottom
    nextFloor = (state.currentFloor + 1) as FloorLevel;
  } else {
    if (state.currentFloor <= FloorLevel.LIVING) return; // already at top
    nextFloor = (state.currentFloor - 1) as FloorLevel;
  }

  // Save player position for same-xy spawn
  const savedX = player.x;
  const savedY = player.y;
  const savedAngle = player.angle;

  // Save player state
  const savedInventory = player.inventory ? [...player.inventory] : [];
  const savedNeeds = player.needs ? { ...player.needs } : freshNeeds();
  const savedHp = player.hp ?? 100;
  const savedMaxHp = player.maxHp ?? 100;
  const savedWeapon = player.weapon ?? '';
  const savedTool = player.tool ?? '';
  const savedRpg = player.rpg ? { ...player.rpg } : freshRPG(1);
  const savedMoney = player.money ?? 100;

  state.currentFloor = nextFloor;

  // Defer heavy generation — game loop will show loading screen first
  pendingLoad = () => {
    resetHellPopulationState();
    // Generate new floor
    let gen: { world: World; entities: Entity[]; spawnX: number; spawnY: number };
    if (nextFloor === FloorLevel.LIVING) {
      gen = generateWorld();
    } else if (nextFloor === FloorLevel.MAINTENANCE) {
      gen = generateMaintenance();
    } else if (nextFloor === FloorLevel.VOID) {
      gen = generateVoid();
    } else {
      gen = generateHell();
    }

    world = gen.world;
    entities = gen.entities;
    nextEntityId.v = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

    // Find a valid spawn near the saved x,y position
    let spawnX = savedX;
    let spawnY = savedY;
    const sx = Math.floor(savedX), sy = Math.floor(savedY);
    if (world.cells[world.idx(sx, sy)] !== Cell.FLOOR) {
      let found = false;
      for (let r = 1; r <= 30 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const ci = world.idx(sx + dx, sy + dy);
            if (world.cells[ci] === Cell.FLOOR) {
              spawnX = world.wrap(sx + dx) + 0.5;
              spawnY = world.wrap(sy + dy) + 0.5;
              found = true;
            }
          }
        }
      }
      if (!found) {
        spawnX = gen.spawnX;
        spawnY = gen.spawnY;
      }
    }
    player = {
      id: nextEntityId.v++,
      type: EntityType.PLAYER,
      x: spawnX,
      y: spawnY,
      angle: savedAngle,
      pitch: 0,
      alive: true,
      speed: 3.0,
      sprite: 0,
      needs: savedNeeds,
      hp: savedHp,
      maxHp: savedMaxHp,
      inventory: savedInventory,
      weapon: savedWeapon,
      tool: savedTool,
      money: savedMoney,
      rpg: savedRpg,
      name: 'Вы',
      faction: Faction.PLAYER,
    };
    entities.push(player);
    prevPlayerHp = player.hp ?? 100;

    initFactionRelations();
    initFactionControl(world);
    const fStats = countFactionTerritory(world);
    if (nextFloor !== FloorLevel.HELL) {
      spawnPatrolSquads(world, entities, nextEntityId, fStats);
    }

    if (nextFloor === FloorLevel.HELL) {
      state.samosborTimer = 60 + Math.random() * 240;
    } else if (nextFloor === FloorLevel.VOID) {
      state.samosborTimer = 40 + Math.random() * 120;
    } else if (nextFloor === FloorLevel.MAINTENANCE) {
      state.samosborTimer = 180 + Math.random() * 240;
    } else {
      state.samosborTimer = 300 + Math.random() * 300;
    }
    state.samosborActive = false;

    resetPsiState();

    state.msgs.push({
      text: `Лифт прибыл: ${FLOOR_NAMES[nextFloor]}`,
      time: state.time,
      color: nextFloor === FloorLevel.HELL ? '#f44' : nextFloor === FloorLevel.VOID ? '#0f8' : '#4af',
    });

    // Auto-trigger voice quest when entering Hell with step 9 (kill Mancobus) done
    if (nextFloor === FloorLevel.HELL) {
      onHellArrival(player, state);
      tryCreateVoiceQuest(world, entities, state);
    }

    // Update WebGL world data after floor change
    updateWorldData(world);
  };
}

/* ── Portal transition to Void floor ──────────────────────────── */
function enterVoidFloor(): void {
  const savedInventory = player.inventory ? [...player.inventory] : [];
  const savedNeeds = player.needs ? { ...player.needs } : freshNeeds();
  const savedHp = player.hp ?? 100;
  const savedMaxHp = player.maxHp ?? 100;
  const savedWeapon = player.weapon ?? '';
  const savedTool = player.tool ?? '';
  const savedRpg = player.rpg ? { ...player.rpg } : freshRPG(1);
  const savedMoney = player.money ?? 100;
  const savedAngle = player.angle;

  state.currentFloor = FloorLevel.VOID;

  pendingLoad = () => {
    resetHellPopulationState();
    const gen = generateVoid();
    world = gen.world;
    entities = gen.entities;
    nextEntityId.v = entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

    player = {
      id: nextEntityId.v++,
      type: EntityType.PLAYER,
      x: gen.spawnX,
      y: gen.spawnY,
      angle: savedAngle,
      pitch: 0,
      alive: true,
      speed: 3.0,
      sprite: 0,
      needs: savedNeeds,
      hp: savedHp,
      maxHp: savedMaxHp,
      inventory: savedInventory,
      weapon: savedWeapon,
      tool: savedTool,
      money: savedMoney,
      rpg: savedRpg,
      name: 'Вы',
      faction: Faction.PLAYER,
    };
    entities.push(player);
    prevPlayerHp = player.hp ?? 100;

    initFactionRelations();
    initFactionControl(world);
    resetPsiState();

    state.samosborTimer = 40 + Math.random() * 120;
    state.samosborActive = false;

    onVoidEntry(state);

    updateWorldData(world);
  };
}

/* ── NPC interaction menu ──────────────────────────────────────── */
function openNpcMenu(npc: Entity): void {
  state.showNpcMenu = true;
  state.npcMenuSel = 0;
  state.npcMenuTarget = npc.id;
  state.npcMenuTab = 'main';
  state.npcTalkText = '';
  state.tradeCursorX = 0;
  state.tradeCursorY = 0;
  state.tradeSide = 'npc';
  // Generate NPC trade inventory if empty
  if (!npc.inventory || npc.inventory.length === 0) {
    npc.inventory = generateNpcTradeItems(npc);
  }
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
        tool: player.tool,
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
    const floor = data.state.currentFloor ?? FloorLevel.LIVING;

    state.showMenu = false;
    pendingLoad = () => {
      resetHellPopulationState();
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
        tool: data.player.tool ?? '',
        money: data.player.money ?? 100,
        rpg: data.player.rpg ?? freshRPG(1),
        name: 'Вы',
        faction: Faction.PLAYER,
      };
      entities.push(player);
      prevPlayerHp = player.hp ?? 100;

      initFactionRelations();
      initFactionControl(world);
      const fStats = countFactionTerritory(world);
      if (floor !== FloorLevel.HELL) {
        spawnPatrolSquads(world, entities, nextEntityId, fStats);
      }

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

      // Update WebGL world data after load
      updateWorldData(world);
    };
    return true;
  } catch {
    state.msgs.push({ text: 'Ошибка загрузки!', time: state.time, color: '#f44' });
    return false;
  }
}

/* ── Urination faction penalty ─────────────────────────────────── */
let _urinePenaltyAccum = 0;
let _urinePenaltyStarted = false;
let _prevToolUse = false;
let _toolActionCd = 0;
let _cleanRelAccum = 0;

function applyUrinationPenalty(dt: number): void {
  const room = world.roomAt(player.x, player.y);
  if (room && room.type === RoomType.BATHROOM) return; // toilet — no penalty

  const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
  const zid = world.zoneMap[pci];
  const zone = world.zones[zid];
  if (!zone) return;
  const ownerFaction = zoneFactionToFaction(zone.faction);
  if (ownerFaction === null) return;

  // Immediate penalty when urination starts
  if (!_urinePenaltyStarted) {
    _urinePenaltyStarted = true;
    addFactionRel(ownerFaction, Faction.PLAYER, -1);
    addFactionRel(Faction.PLAYER, ownerFaction, -1);
    state.msgs.push({ text: 'Местные недовольны...', time: state.time, color: '#f84' });
  }

  // Ongoing penalty: -1 per game minute (= per real second)
  _urinePenaltyAccum += dt;
  if (_urinePenaltyAccum >= 1.0) {
    _urinePenaltyAccum -= 1.0;
    addFactionRel(ownerFaction, Faction.PLAYER, -1);
    addFactionRel(Faction.PLAYER, ownerFaction, -1);
  }
}

function setCellToFloor(x: number, y: number): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.FLOOR;
  if (!world.floorTex[ci]) {
    const room = world.roomAt(x + 0.5, y + 0.5);
    world.floorTex[ci] = room?.floorTex ?? Tex.F_CONCRETE;
  }
}

function cleanSurfaceArea(cx: number, cy: number, radiusCells: number): number {
  const minX = Math.floor(cx - radiusCells) - 1;
  const maxX = Math.floor(cx + radiusCells) + 1;
  const minY = Math.floor(cy - radiusCells) - 1;
  const maxY = Math.floor(cy + radiusCells) + 1;
  let removed = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const wx = world.wrap(x);
      const wy = world.wrap(y);
      const ci = world.idx(wx, wy);
      const cell = world.surfaceMap.get(ci);
      if (!cell) continue;

      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const wxf = wx + (px + 0.5) / 16;
          const wyf = wy + (py + 0.5) / 16;
          if (world.dist(wxf, wyf, cx, cy) > radiusCells) continue;
          const ai = ((py * 16 + px) << 2) + 3;
          const a = cell[ai];
          if (a <= 0) continue;
          const dec = Math.max(24, Math.floor(a * 0.45));
          const na = Math.max(0, a - dec);
          removed += a - na;
          cell[ai] = na;
        }
      }
    }
  }

  return removed;
}

function updateEquippedTool(dt: number): void {
  if (!player.alive) {
    _prevToolUse = input.use;
    return;
  }
  if (_toolActionCd > 0) _toolActionCd = Math.max(0, _toolActionCd - dt);
  const toolId = player.tool ?? '';
  const useEdge = input.use && !_prevToolUse;
  _prevToolUse = input.use;
  if (!toolId) return;

  const hasTool = (player.inventory ?? []).some(s => s.defId === toolId);
  if (!hasTool) { player.tool = ''; return; }

  // Flashlight is passive while equipped.
  if (toolId === 'flashlight') {
    consumeToolDurability(player, dt, state.msgs, state.time);
    return;
  }

  const lookRange = 1.4;
  const tx = player.x + Math.cos(player.angle) * lookRange;
  const ty = player.y + Math.sin(player.angle) * lookRange;
  const cx = Math.floor(tx);
  const cy = Math.floor(ty);
  const ci = world.idx(cx, cy);

  if (toolId === 'jackhammer') {
    if (!input.use || _toolActionCd > 0) return;
    if (world.hermoWall[ci] || world.aptMask[ci]) {
      state.msgs.push({ text: 'Гермостена неразрушима', time: state.time, color: '#f44' });
      _toolActionCd = 0.2;
      return;
    }
    if (world.cells[ci] !== Cell.WALL) {
      state.msgs.push({ text: 'Отбойнику нужна стена перед вами', time: state.time, color: '#f84' });
      _toolActionCd = 0.25;
      return;
    }
    setCellToFloor(cx, cy);
    consumeToolDurability(player, 1, state.msgs, state.time);
    state.msgs.push({ text: 'Стена разрушена', time: state.time, color: '#fc4' });
    playBreak();
    _toolActionCd = 0.2;
    return;
  }

  if (toolId === 'door_kit') {
    if (!useEdge) return;
    if (world.aptMask[ci]) {
      state.msgs.push({ text: 'В защищенных укрытиях строительство запрещено', time: state.time, color: '#f44' });
      return;
    }
    if (world.cells[ci] !== Cell.FLOOR) {
      state.msgs.push({ text: 'Дверь ставится на проход (пол)', time: state.time, color: '#f84' });
      return;
    }
    const l = world.cells[world.idx(cx - 1, cy)];
    const r = world.cells[world.idx(cx + 1, cy)];
    const u = world.cells[world.idx(cx, cy - 1)];
    const d = world.cells[world.idx(cx, cy + 1)];
    const horizontal = (l === Cell.WALL && r === Cell.WALL && u !== Cell.WALL && d !== Cell.WALL);
    const vertical = (u === Cell.WALL && d === Cell.WALL && l !== Cell.WALL && r !== Cell.WALL);
    if (!horizontal && !vertical) {
      state.msgs.push({ text: 'Нужен проём типа стена-дверь-стена', time: state.time, color: '#f84' });
      return;
    }
    const roomA = world.roomMap[world.idx(cx - 1, cy)] >= 0 ? world.roomMap[world.idx(cx - 1, cy)] : world.roomMap[world.idx(cx, cy - 1)];
    const roomB = world.roomMap[world.idx(cx + 1, cy)] >= 0 ? world.roomMap[world.idx(cx + 1, cy)] : world.roomMap[world.idx(cx, cy + 1)];
    world.cells[ci] = Cell.DOOR;
    world.doors.set(ci, { idx: ci, state: DoorState.CLOSED, roomA, roomB, keyId: '', timer: 0 });
    consumeToolDurability(player, 1, state.msgs, state.time);
    state.msgs.push({ text: 'Дверь установлена', time: state.time, color: '#6cf' });
    playDoor();
    return;
  }

  if (toolId === 'block_kit') {
    if (!useEdge) return;
    const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
    if (ci === pci) {
      state.msgs.push({ text: 'Нельзя замуровать себя', time: state.time, color: '#f84' });
      return;
    }
    if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.DOOR) {
      state.msgs.push({ text: 'Блок ставится на пол/дверь', time: state.time, color: '#f84' });
      return;
    }
    if (world.aptMask[ci] || world.hermoWall[ci]) {
      state.msgs.push({ text: 'В защищенных укрытиях строительство запрещено', time: state.time, color: '#f44' });
      return;
    }
    if (world.cells[ci] === Cell.DOOR) world.doors.delete(ci);
    world.cells[ci] = Cell.WALL;
    const room = world.roomAt(player.x, player.y);
    world.wallTex[ci] = room?.wallTex ?? Tex.CONCRETE;
    consumeToolDurability(player, 1, state.msgs, state.time);
    state.msgs.push({ text: 'Блок стены установлен', time: state.time, color: '#6cf' });
    return;
  }

  if (toolId === 'cleaning_kit') {
    if (!input.use || _toolActionCd > 0) return;
    const cleaned = cleanSurfaceArea(tx, ty, 1.0);
    consumeToolDurability(player, 1, state.msgs, state.time);
    if (cleaned > 0) {
      _cleanRelAccum += 1;
      if (_cleanRelAccum >= 5) {
        _cleanRelAccum = 0;
        const z = world.zones[world.zoneMap[world.idx(Math.floor(player.x), Math.floor(player.y))]];
        const owner = z ? zoneFactionToFaction(z.faction) : null;
        if (owner !== null) {
          addFactionRelMutual(Faction.PLAYER, owner, 1);
          state.msgs.push({ text: 'Местные ценят вашу уборку (+отношения)', time: state.time, color: '#8f8' });
        }
      }
    }
    _toolActionCd = 0.08;
  }
}

/* ── Menu input handling (runs regardless of pause state) ─────── */
let prevEsc = false, prevInvMenu = false, prevQuestMenu = false;
let prevMenuUp = false, prevMenuDn = false, prevMenuLeft = false, prevMenuRight = false;
let prevMenuInteract = false, prevDrop = false;
let prevFactionMenu = false;
let prevLogMenu = false;

function handleMenuInput(): void {
  const escEdge = input.escape && !prevEsc;
  const upEdge = input.invUp && !prevMenuUp;
  const dnEdge = input.invDn && !prevMenuDn;
  const leftEdge = input.invLeft && !prevMenuLeft;
  const rightEdge = input.invRight && !prevMenuRight;
  const interactEdge = input.interact && !prevMenuInteract;
  const dropEdge = input.drop && !prevDrop;
  const invEdge = input.inv && !prevInvMenu;
  const questEdge = input.questLog && !prevQuestMenu;
  const factionEdge = input.factionMenu && !prevFactionMenu;
  const logEdge = input.logMenu && !prevLogMenu;

  // ── Enter: toggle game menu (or close any open menu) ─────
  if (escEdge) {
    if (state.showNpcMenu) { state.showNpcMenu = false; }
    else if (state.showInventory) { state.showInventory = false; }
    else if (state.showQuests) { state.showQuests = false; }
    else if (state.showFactions) { state.showFactions = false; }
    else if (state.showLog) { state.showLog = false; }
    else { state.showMenu = !state.showMenu; state.menuSel = 0; }
  }

  // ── Game menu navigation ─────────────────────────────────
  if (state.showMenu) {
    if (upEdge) state.menuSel = Math.max(0, state.menuSel - 1);
    if (dnEdge) state.menuSel = Math.min(3, state.menuSel + 1);
    if (interactEdge) {
      switch (state.menuSel) {
        case 0: state.showMenu = false; break;                // Continue
        case 1: state.showMenu = false; pendingLoad = () => { initGame(); }; break;    // New Game
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
      if (dropEdge) dropItem(player, state.invSel, entities, state.msgs, state.time, nextEntityId);
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
            if (npc) {
              checkTalkQuest(npc, player, entities, state, state.msgs);
              offerQuest(npc, player, world, entities, state, state.msgs, nextEntityId);
              // Only switch to quest tab if this NPC has an active quest
              const active = state.quests.filter(q => !q.done);
              const npcQIdx = active.findIndex(q => q.giverId === npc.id);
              if (npcQIdx >= 0) {
                state.npcMenuTab = 'quest';
                state.questPage = npcQIdx;
              }
              // Otherwise stay on 'main' — message already shown in HUD
            }
            break;
          case 2: // Trade
            state.npcMenuTab = 'trade';
            state.tradeCursorX = 0;
            state.tradeCursorY = 0;
            state.tradeSide = 'npc';
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
        const GRID = 5;
        // W/S — move cursor up/down
        if (upEdge) state.tradeCursorY = Math.max(0, state.tradeCursorY - 1);
        if (dnEdge) state.tradeCursorY = Math.min(GRID - 1, state.tradeCursorY + 1);
        // A/D — move cursor left/right, crossing between panels
        if (leftEdge) {
          if (state.tradeCursorX > 0) {
            state.tradeCursorX--;
          } else if (state.tradeSide === 'npc') {
            state.tradeSide = 'player';
            state.tradeCursorX = GRID - 1;
          }
        }
        if (rightEdge) {
          if (state.tradeCursorX < GRID - 1) {
            state.tradeCursorX++;
          } else if (state.tradeSide === 'player') {
            state.tradeSide = 'npc';
            state.tradeCursorX = 0;
          }
        }
        // E — buy or sell
        if (interactEdge) {
          const idx = state.tradeCursorY * GRID + state.tradeCursorX;
          const npcInv = npc.inventory ?? [];
          const plrInv = player.inventory ?? [];
          if (state.tradeSide === 'npc' && idx < npcInv.length) {
            // Buy from NPC
            const slot = npcInv[idx];
            const def = ITEMS[slot.defId];
            const price = def?.value ?? 0;
            if ((player.money ?? 0) >= price) {
              addItem(player, slot.defId, 1);
              player.money = (player.money ?? 0) - price;
              npc.money = (npc.money ?? 0) + price;
              slot.count--;
              if (slot.count <= 0) npcInv.splice(idx, 1);
              state.msgs.push({ text: `Куплено: ${def?.name ?? slot.defId} (−${price}₽)`, time: state.time, color: '#4f4' });
            } else {
              state.msgs.push({ text: 'Не хватает денег', time: state.time, color: '#f84' });
            }
          } else if (state.tradeSide === 'player' && idx < plrInv.length) {
            // Sell to NPC
            const slot = plrInv[idx];
            const def = ITEMS[slot.defId];
            const price = def?.value ?? 0;
            if ((npc.money ?? 0) >= price) {
              addItem(npc, slot.defId, 1);
              npc.money = (npc.money ?? 0) - price;
              player.money = (player.money ?? 0) + price;
              slot.count--;
              if (slot.count <= 0) plrInv.splice(idx, 1);
              state.msgs.push({ text: `Продано: ${def?.name ?? slot.defId} (+${price}₽)`, time: state.time, color: '#4f4' });
            } else {
              state.msgs.push({ text: 'У торговца нет денег', time: state.time, color: '#f84' });
            }
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
      if (dnEdge) state.debugSel = Math.min(6, state.debugSel + 1);
      if (interactEdge) execDebugCommand(state.debugSel, player, entities, state, nextEntityId);
    }
  }
  // ── Faction relations menu ───────────────────────────────
  else if (state.showFactions) {
    if (factionEdge || escEdge) { state.showFactions = false; }
  }
  // ── Message log menu ─────────────────────────────────────
  else if (state.showLog) {
    if (logEdge || escEdge) { state.showLog = false; }
    const maxScroll = Math.max(0, state.msgLog.length * 3); // generous; draw clamps
    if (upEdge) state.logScroll = Math.min(maxScroll, state.logScroll + 3);
    if (dnEdge) state.logScroll = Math.max(0, state.logScroll - 3);
  }
  // ── Normal gameplay toggles ──────────────────────────────
  else {
    const dbgEdge = input.debugScreen && !prevDebug;
    if (dbgEdge) { state.showDebug = true; state.debugSel = 0; }
    if (invEdge) { state.showInventory = true; state.invSel = 0; }
    if (questEdge) { state.showQuests = true; }
    if (factionEdge) { state.showFactions = true; }
    if (logEdge) { state.showLog = true; state.logScroll = 0; }
  }

  // Update prev states
  prevEsc = input.escape;
  prevMenuUp = input.invUp;
  prevMenuDn = input.invDn;
  prevMenuLeft = input.invLeft;
  prevMenuRight = input.invRight;
  prevMenuInteract = input.interact;
  prevDrop = input.drop;
  prevInvMenu = input.inv;
  prevQuestMenu = input.questLog;
  prevDebug = input.debugScreen;
  prevFactionMenu = input.factionMenu;
  prevLogMenu = input.logMenu;

  // Auto-pause when any menu is open
  state.paused = state.showMenu || state.showInventory || state.showNpcMenu || state.showQuests || state.showDebug || state.showFactions || state.showLog;
}

/* ── Game loop ────────────────────────────────────────────────── */
let lastTime = performance.now();

function gameLoop(now: number): void {
  // Two-phase deferred loading:
  // Phase 1: pendingLoad exists but not drawn yet → draw loading screen, yield to browser
  // Phase 2: pendingLoad exists and was drawn → execute heavy generation
  if (pendingLoad) {
    if (!pendingLoadDrawn) {
      // Phase 1: paint "ЗАГРУЗКА..." and yield so the browser can composite it
      drawLoading();
      pendingLoadDrawn = true;
      requestAnimationFrame(gameLoop);
      return;
    }
    // Phase 2: loading screen is visible, now do the heavy work
    const fn = pendingLoad;
    pendingLoad = null;
    pendingLoadDrawn = false;
    fn();
    lastTime = performance.now(); // reset dt so we don't get a huge spike
    requestAnimationFrame(gameLoop);
    return;
  }

  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  let dt = Math.min(rawDt, 0.05); // cap delta

  // ── Sleep: hold Z to sleep (time acceleration ×10) ───────
  const SLEEP_TIME_MULT = 10;
  // Restore rate: 100 sleep in 5 game-hours (300 game-min = 300 real-sec at 1x)
  // → 100/300 ≈ 0.333 per real-sec at 1x, but with 10x accel → ~30 real-sec full restore
  const SLEEP_RESTORE_RATE = 100 / 300; // per simulated second
  const wantSleep = input.sleep && !state.paused && !state.gameOver
    && player.alive && player.needs !== undefined;
  state.sleeping = wantSleep && (player.needs?.sleep ?? 100) < 100;
  if (state.sleeping) dt *= SLEEP_TIME_MULT;

  // Menu input always processed (even when paused)
  handleMenuInput();
  // If menu triggered new game / load, bail out to show loading screen
  if (pendingLoad) { requestAnimationFrame(gameLoop); return; }

  // ── Update ───────────────────────────────────────────────
  // Decay damage flash
  if (state.dmgFlash > 0) state.dmgFlash = Math.max(0, state.dmgFlash - dt * 1.2);
  // Decay beam visual
  if (state.beamFx > 0) state.beamFx = Math.max(0, state.beamFx - dt * 2.5);

  // Rolling head physics after death
  if (state.gameOver && deathCam) {
    state.deathTimer += dt;
    updateDeathCam(deathCam, world, dt);
  }

  if (!state.paused && !state.gameOver) {
    state.time += dt;
    state.tick++;

    // Update game clock (1 real second = 1 game minute)
    state.clock.totalMinutes += dt;
    const totalMins = Math.floor(state.clock.totalMinutes);
    state.clock.hour = (8 + Math.floor(totalMins / 60)) % 24;  // start at 8:00
    state.clock.minute = totalMins % 60;

    // ── Sleep restoration while holding Z ──
    if (state.sleeping && player.needs) {
      player.needs.sleep = Math.min(100, player.needs.sleep + SLEEP_RESTORE_RATE * dt);
      if (player.needs.sleep >= 100) {
        state.msgs.push({ text: 'Вы выспались.', time: state.time, color: '#a8f' });
      }
    }

    movePlayer(dt);
    playerActions(dt);
    // If switchFloor was triggered, pendingLoad is set — skip the rest of this frame
    if (pendingLoad) { requestAnimationFrame(gameLoop); return; }
    updateEquippedTool(dt);
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
        stampMark(world, cx, cy, fx, fy, 0.15, MarkType.DRIP, Math.floor(state.time * 100), 200, 180, 30, 60);
        // Faction penalty for urinating outside bathroom
        applyUrinationPenalty(dt);
        player.needs.pee = Math.max(0, player.needs.pee - 12 * dt);
        if (player.needs.pee <= 5) {
          state.msgs.push({ text: 'Полегчало.', time: state.time, color: '#da4' });
        }
      }
    } else {
      // Reset urination penalty tracking when not peeing
      _urinePenaltyStarted = false;
      _urinePenaltyAccum = 0;
    }
    updateProjectiles(dt);
    updateDoors(dt);
    updateNeeds(entities, dt, state.time, state.msgs, player.id, nextEntityId);
    setListenerPos(player.x, player.y, (ax, ay, bx, by) => world.dist2(ax, ay, bx, by));
    updateAI(world, entities, dt, state.time, state.msgs, player.id, state.clock, state.samosborActive, nextEntityId);
    if (updateSamosbor(world, entities, state, dt, nextEntityId)) {
      pendingLoad = () => {
        rebuildWorld(world, entities, nextEntityId, state.samosborCount, state.currentFloor);
        initFactionControl(world);
        const fStats = countFactionTerritory(world);
        if (state.currentFloor !== FloorLevel.HELL) {
          spawnPatrolSquads(world, entities, nextEntityId, fStats);
          spawnTerritoryReinforcements(world, entities, nextEntityId, fStats);
        }
        updateWorldData(world);
      };
      requestAnimationFrame(gameLoop);
      return;
    }
    // Faction zone capture (cell-based territory control)
    updateFactionCapture(world, entities, dt);
    if (state.currentFloor === FloorLevel.HELL) {
      updateHellPopulation(world, entities, nextEntityId, dt, state.samosborCount);
    }
    // Continuous monster spawn for Grom's defense quest (step 8)
    if (state.currentFloor === FloorLevel.MAINTENANCE) {
      updateDefenseQuestSpawn(dt);
    }
    // PSI does NOT auto-regenerate — only restored via items (pills, antidepressant)
    // Update ongoing PSI spell effects (phase shift, madness, control)
    updatePsiEffects(entities, dt);

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

    // Portal step-on check — teleport to Void floor
    if (state.currentFloor === FloorLevel.HELL && state.tick % 10 === 0) {
      const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
      if (world.floorTex[pci] === Tex.PORTAL) {
        // Transition to Void — use switchFloor-like mechanism
        enterVoidFloor();
        // Bail out: currentFloor is already VOID but old world still has the portal;
        // continuing would trigger the "return portal" check and freeze the game.
        requestAnimationFrame(gameLoop);
        return;
      }
    }

    // Return portal in Void — end game
    if (state.currentFloor === FloorLevel.VOID && state.tick % 10 === 0) {
      const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
      if (world.floorTex[pci] === Tex.PORTAL) {
        state.gameWon = true;
        state.gameOver = true;
        state.deathTimer = 0;
      }
    }

    // Auto-pickup when walking
    if (state.tick % 15 === 0) {
      pickupNearby(world, entities, player, state.msgs, state.time);
    }

    // Detect player damage for vignette flash
    const curHp = player.hp ?? 100;
    if (curHp < prevPlayerHp) {
      const lost = prevPlayerHp - curHp;
      const maxHp = player.maxHp ?? 100;
      state.dmgFlash = Math.min(1, 0.3 + (lost / maxHp) * 1.5);
      state.dmgSeed = Math.random() * 10000;
      playFleshHit();
    }
    prevPlayerHp = curHp;

    // Check player death
    if (!player.alive && !state.gameOver) {
      state.gameOver = true;
      state.deathTimer = 0;
      deathCam = initDeathCam(player.x, player.y, player.angle);
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

    // Sync new messages to persistent log, then trim
    syncMsgLog();
    while (state.msgs.length > 50) state.msgs.shift();
    _prevMsgCount = state.msgs.length;
  }

  // ── World simulation continues after death (NPC, monsters, samosbor keep running) ──
  if (!state.paused && state.gameOver) {
    state.time += dt;
    state.tick++;
    state.clock.totalMinutes += dt;
    const totalMins = Math.floor(state.clock.totalMinutes);
    state.clock.hour = (8 + Math.floor(totalMins / 60)) % 24;
    state.clock.minute = totalMins % 60;
    updateProjectiles(dt);
    updateDoors(dt);
    updateNeeds(entities, dt, state.time, state.msgs, player.id, nextEntityId);
    setListenerPos(player.x, player.y, (ax, ay, bx, by) => world.dist2(ax, ay, bx, by));
    updateAI(world, entities, dt, state.time, state.msgs, player.id, state.clock, state.samosborActive, nextEntityId);
    if (updateSamosbor(world, entities, state, dt, nextEntityId)) {
      pendingLoad = () => {
        rebuildWorld(world, entities, nextEntityId, state.samosborCount, state.currentFloor);
        initFactionControl(world);
        const fStats = countFactionTerritory(world);
        if (state.currentFloor !== FloorLevel.HELL) {
          spawnPatrolSquads(world, entities, nextEntityId, fStats);
          spawnTerritoryReinforcements(world, entities, nextEntityId, fStats);
        }
        updateWorldData(world);
      };
      requestAnimationFrame(gameLoop);
      return;
    }
    updateFactionCapture(world, entities, dt);
    if (state.currentFloor === FloorLevel.HELL) {
      updateHellPopulation(world, entities, nextEntityId, dt, state.samosborCount);
    }
    updateBloodTrails(world, entities, dt);
    updateParticles(world, dt);
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (!e.alive && e.type !== EntityType.PLAYER) {
        if (e.type === EntityType.PROJECTILE || state.tick % 120 === 0) {
          entities.splice(i, 1);
        }
      }
    }
    syncMsgLog();
    while (state.msgs.length > 50) state.msgs.shift();
    _prevMsgCount = state.msgs.length;
  }

  checkRestart();
  if (pendingLoad) { requestAnimationFrame(gameLoop); return; }

  // ── Render ───────────────────────────────────────────────
  // Fog density varies by floor level
  let baseFog = 0.065;
  if (state.currentFloor === FloorLevel.MAINTENANCE) baseFog = 0.08;
  if (state.currentFloor === FloorLevel.HELL) baseFog = 0.05; // less fog, more horror visibility
  const fogDensity = state.samosborActive ? baseFog + 0.03 : baseFog;
  const glitch = state.samosborActive ? 0.3 + Math.sin(state.time * 5) * 0.15 : 0;

  // Use death cam position/angle when dead, otherwise player
  const camX     = deathCam ? deathCam.x              : player.x;
  const camY     = deathCam ? deathCam.y              : player.y;
  const camAngle = deathCam ? getDeathCamAngle(deathCam) : player.angle;
  const camPitch = deathCam ? getDeathCamPitch(deathCam) : player.pitch;

  const camH = deathCam ? deathCam.height : 0.5;
  let flashlight = 0;
  if (!state.gameOver && player.tool === 'flashlight') {
    const d = getEquippedToolDurability(player);
    if (d && d.max > 0 && d.cur > 0) flashlight = Math.max(0.25, Math.min(1, d.cur / d.max));
  }

  // Update dynamic world data (fog, door states, wallTex for slides)
  updateDynamicData(world, camX, camY);

  // WebGL raycaster + sprites
  renderSceneGL(world, textures, sprites, entities,
    camX, camY, camAngle, camPitch,
    fogDensity, glitch, camH, flashlight, state.time, particles, state.samosborActive);

  // Draw HUD on 2D overlay canvas
  ctx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  drawHUD(ctx, hudCanvas.width / SCR_W, hudCanvas.height / SCR_H, player, state, world, entities);

  requestAnimationFrame(gameLoop);
}

/* ── Title screen ─────────────────────────────────────────────── */
function showTitle(): void {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  ctx.fillStyle = '#c00';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ГИГАХРУЩ', hudCanvas.width / 2, hudCanvas.height / 2 - 40);
  ctx.fillStyle = '#666';
  ctx.font = '16px monospace';
  ctx.fillText('бесконечный бетонный лабиринт', hudCanvas.width / 2, hudCanvas.height / 2 + 10);
  ctx.fillStyle = '#888';
  ctx.fillText('Нажмите ENTER чтобы войти', hudCanvas.width / 2, hudCanvas.height / 2 + 50);
  ctx.fillStyle = '#555';
  ctx.font = '12px monospace';
  ctx.fillText('WASD — движение  |  Мышь — обзор  |  E — действие  |  R — инструмент  |  F — фракции  |  I — инвентарь  |  M — карта  |  Пробел — удар', hudCanvas.width / 2, hudCanvas.height / 2 + 90);
  ctx.textAlign = 'left';
}

let started = false;

document.addEventListener('keydown', function startHandler(e: KeyboardEvent) {
  if (e.code === 'Enter' && !started) {
    started = true;
    document.removeEventListener('keydown', startHandler);
    canvas.requestPointerLock();
    startAmbientDrone();
    requestAnimationFrame(gameLoop);
  }
});
