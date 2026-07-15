/* ── Living floor generator (Floor 0) — orchestrator ─────────── */
/*   PARADIGM: Apartments are PERMANENT. Everything else is      */
/*   VOLATILE — regenerated every samosbor.                      */
/*                                                               */
/*   generateWorld()  = apartments(once) + volatile maze + NPCs  */
/*   regrowMaze()     = wipe volatile + regenerate volatile maze  */
/*                                                               */
/*   Content modules live in sibling files:                      */
/*     apartments.ts  — permanent apartment clusters             */
/*     volatile.ts    — volatile gigastructure maze              */
/*     tutor_room.ts  — tutorial briefing room (Актовый зал)     */
/*     yakov_lab.ts   — Yakov's lab (PSI researcher, story quest)*/
/*     vanka_den.ts   — Vanka's den (cultist zone)              */
/*     slides.ts      — slide texture generation                 */
/*     npcs.ts        — NPC & item spawning                      */
/*     side_quests.ts — side quest NPC registry & spawning       */
/*     zone_content.ts — zone content module registry            */
/*     geometry.ts    — readable hub districts and routes        */
/*     temple.ts      — Orthodox temple (zone 3 content module)  */
/*     soviet_housing_pack.ts — concierge/radio/kitchen POIs      */
/*                                                               */
/*   To add a new hand-crafted room, create a .ts file here      */
/*   and call it from generateWorld() below.                     */

import { type Entity, FloorLevel, Cell, Tex, EntityType, AIGoal, W, MonsterKind, RoomType, ZoneFaction } from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { sampleNaturalPopulationCells } from '../population_placement';
import { baseMonsterPopulationAtDefaultSoftLimit } from '../../data/population_profiles';
import { activeActorCountAtDefaultSoftLimit } from '../../data/entity_limits';
import { chooseFloorMonsterKind } from '../../data/monster_ecology';
import { reassignQuestGivers } from '../../systems/quests';
import { calcZoneLevel, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { generateZones, stampHQRooms } from '../shared';
import { placeProceduralScreens } from '../procedural_screens';
import { generateApartments } from './apartments';
import { generateVolatileMaze, wipeVolatile } from './volatile';
import { generateTutorRoom } from './tutor_room';
import { generateYakovLab } from './yakov_lab';
import { generateVankaDen, spawnVankaShadows } from './vanka_den';
import './content_manifest';
import { runZoneContentModules } from './zone_content';
import { buildLivingHubGeometry } from './geometry';
import { spawnRoomItems, spawnFamilies, spawnTravelers } from './npcs';
import { spawnSideQuestNpcs } from './side_quests';

export { generateSlideTextures } from './slides';
export { generateHintTextures } from '../../render/hint_textures';
export { generatePosterTextures, pickPosterTex } from './posters';

/* ── generateWorld — called once at game start ───────────────── */
export function generateWorld(_seed?: number, isTutorial: boolean = false): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  let nextId = 1;

  /* ── A: Permanent apartments ───────────────────────── */
  const apartments = generateApartments(world);

  /* ── A1: Start room (briefing hall) ─────────────── */
  const tutorRoomStartIndex = world.rooms.length;
  const startRoom = generateTutorRoom(world, world.rooms.length, entities, { v: nextId }, isTutorial);
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

  /* ── A1b: Yakov's lab (at distance from spawn) ──── */
  generateYakovLab(world, world.rooms.length, entities, { v: nextId }, startRoom.spawnX, startRoom.spawnY);
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

  /* ── A1c: Vanka's den (cultist zone) ────────── */
  generateVankaDen(world, world.rooms.length, entities, { v: nextId }, startRoom.spawnX, startRoom.spawnY);
  nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

  world.apartmentRoomCount = world.rooms.length;

  /* ── A2: Permanent zones (64 macro-regions) ─────── */
  generateZones(world);  // Assign zone levels for living floor
  for (const z of world.zones) z.level = calcZoneLevel(z.cx, z.cy, FloorLevel.LIVING);

  /* Update apartmentRoomCount to include all permanent rooms */
  world.apartmentRoomCount = world.rooms.length;

  /* ── A3: HQ rooms for faction zones ─────────────── */
  stampHQRooms(world);

  /* ── B: Volatile gigastructure ─────────────────────── */
  generateVolatileMaze(world);

  // The user strictly wants the cafeteria (tutorRoomStartIndex + 1) and 
  // bathroom (tutorRoomStartIndex + 2) to only connect to each other 
  // and the cafeteria to the hall (tutorRoomStartIndex).
  // Any other doors from these two inner rooms to the outside must be removed and replaced with walls.
  const cafeId = tutorRoomStartIndex + 1;
  const bathId = tutorRoomStartIndex + 2;
  const hallId = tutorRoomStartIndex;

  for (const doorData of Array.from(world.doors.values())) {
    const isInnerA = doorData.roomA === cafeId || doorData.roomA === bathId;
    const isInnerB = doorData.roomB === cafeId || doorData.roomB === bathId;
    const isOutsideA = doorData.roomA !== cafeId && doorData.roomA !== bathId && doorData.roomA !== hallId;
    const isOutsideB = doorData.roomB !== cafeId && doorData.roomB !== bathId && doorData.roomB !== hallId;
    
    if ((isInnerA && isOutsideB) || (isInnerB && isOutsideA)) {
      world.cells[doorData.idx] = Cell.WALL;
      world.wallTex[doorData.idx] = Tex.TILE_W;
      world.doors.delete(doorData.idx);
      
      if (doorData.roomA >= 0 && world.rooms[doorData.roomA]) {
        const roomA = world.rooms[doorData.roomA];
        roomA.doors = roomA.doors.filter(d => d !== doorData.idx);
      }
      if (doorData.roomB >= 0 && world.rooms[doorData.roomB]) {
        const roomB = world.rooms[doorData.roomB];
        roomB.doors = roomB.doors.filter(d => d !== doorData.idx);
      }
    }
  }

  /* ── B0: Zone content modules (after maze — bulldoze & stamp over corridors) ── */
  if (!isTutorial) {
    const nid = { v: nextId };
    runZoneContentModules(world, entities, nid);
    nextId = nid.v;
  }

  /* ── B1: Readable hub routes and district motifs ─────────────── */
  buildLivingHubGeometry(world);

  if (!isTutorial) {
    /* ── B2: Shadows near Vanka (needs corridors to exist) */
    spawnVankaShadows(world, entities, { v: nextId });
    nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;

    /* ── B2.5: Ambient Monsters ───────────────────────── */
    const livingMonsterProfile = {
      noiseScale: 96,
      noiseStrength: 0.2,
      openWeight: 1.0,
      roomWeights: {
        [RoomType.STORAGE]: 1.5,
        [RoomType.CORRIDOR]: 1.2,
        [RoomType.BATHROOM]: 1.1,
        [RoomType.SMOKING]: 1.1,
      },
      zoneWeights: {
        [ZoneFaction.WILD]: 1.8,
        [ZoneFaction.CULTIST]: 1.2,
        [ZoneFaction.CITIZEN]: 0.2,
      },
    };
    const monsterCount = Math.floor(activeActorCountAtDefaultSoftLimit(baseMonsterPopulationAtDefaultSoftLimit(0)));
    const monsterCells = sampleNaturalPopulationCells(world, monsterCount, livingMonsterProfile, 0x1234);
    for (const cell of monsterCells) {
      const kind = chooseFloorMonsterKind({ floor: FloorLevel.LIVING, rng });
      const m = MONSTERS[kind];
      if (!m) continue;
      const hp = scaleMonsterHp(m.hp, 5); // Base level 5
      const speed = scaleMonsterSpeed(m.speed, 5);
      entities.push({
        id: nextId++, type: EntityType.MONSTER, monsterKind: kind,
        x: (cell % W) + 0.5, y: Math.floor(cell / W) + 0.5,
        angle: rng() * Math.PI * 2, pitch: 0, alive: true,
        hp, maxHp: hp, speed, sprite: monsterSpr(kind),
        attackCd: 0,
        ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        phasing: kind === MonsterKind.SPIRIT,
      });
    }

    /* ── B3: Side quest NPCs (random encounters, need FLOOR cells) */
    spawnSideQuestNpcs(world, entities, { v: nextId });
    nextId = entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;
  }

  /* ── B4: Rare procedural TV/monitor walls in suitable rooms ─── */
  placeProceduralScreens(world, FloorLevel.LIVING);

  /* ── C: Items in all rooms ─────────────────────────── */
  nextId = spawnRoomItems(world, entities, nextId);

  /* ── D: NPCs — families + travelers ────────────────── */
  nextId = spawnFamilies(world, apartments, entities, nextId);
  nextId = spawnTravelers(world, entities, nextId);

  /* ── E: Quest givers + spawn ───────────────────────── */
  reassignQuestGivers(entities);
  return {
    world, entities,
    spawnX: startRoom.spawnX,
    spawnY: startRoom.spawnY,
  };
}

/* ── regrowMaze — called every samosbor ──────────────────────── */
export function regrowMaze(world: World): void {
  wipeVolatile(world);
  generateVolatileMaze(world);
  placeProceduralScreens(world, FloorLevel.LIVING);
  buildLivingHubGeometry(world);
}
