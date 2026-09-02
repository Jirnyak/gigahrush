/* ── Intro Atrium — Актовый зал + Оружейная (Стрельбище) ───────── */
/*   Self-contained content module:                               */
/*     • Актовый зал — briefing room with slides & desks          */
/*     • Оружейная — armory / shooting range with targets          */
/*     • NPCs: Ольга Дмитриевна (tutor), Сержант Баринов (armory)           */
/*     • Quest chain: Ольга→сержант Баринов→Ольга                           */
/*     • Item drops: makarov, ammo, supplies near counters         */
/*     • Keybind hint textures for tutorial room walls             */
/*                                                                 */
/*   To add a new hand-crafted room, create a similar file and     */
/*   call it from the living/index.ts orchestrator.                */

import {
  W, Cell, ContainerKind, DoorState, Tex, Feature,
  type Room, type Entity,
  type Item, type Needs, type WorldContainer,
  EntityType,
} from '../../core/types';
import { World } from '../../core/world';
import { protectRoom } from '../shared';
import { stampNamedRoom } from '../named_rooms';
import { LIVING_NAMED_ROOMS } from './rooms';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { postNpcToRoom } from '../../systems/npc_special_routines';
import { Spr } from '../../entities/sprite_index';
import {
  TUTORIAL_START_CLEARANCE,
  addTutorialDoor,
  generateTutorialStart,
  protectTutorialWallsAsHermetic,
} from './tutorial_start';
import { TUTORIAL_START } from '../../data/tutorial_start';

/*
 * Смена начинается сытой.
 *
 * Обоих держит в их комнатах авторский пост (`starter_post_shift`), но пост
 * запрещает выйти за порог, а не жить: тело у них общее со всеми, голод и жажда
 * копятся как у всех. `freshNeeds()` раздаёт разброс — вплоть до мочевого в
 * тридцать пунктов, — и тогда первое же решение уводит инструктора в уборную у
 * игрока на глазах, а на посту он вместо этого просто упрётся в поводок и
 * бросит дело. Полная шкала это гасит: восемь часов поста целиком помещаются в
 * бюджет полного тела, ноль по нуждам не достигается ни разу (счёт — в
 * `data/npc_special_routines.ts`). Что накопится, ядро закроет НА МЕСТЕ из
 * карманов, не сходя с точки (`systems/actor/body.ts`, `consumeCarried`): у
 * Ольги две воды и два хлеба, у Баринова консерва.
 */
const POST_SHIFT_NEEDS: Needs = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };

const STARTER_LOCKER_LOOT: readonly Item[] = [
  { defId: 'water', count: 1 },
  { defId: 'bread', count: 1 },
  { defId: 'bandage', count: 1 },
  // Полный набор настольных игр (решение владельца 2026-09-02): у каждого
  // нового жильца под рукой предметы всех кооп-столов — иначе партию
  // игрок-игроку не собрать, пока набор не выпадет из мира.
  { defId: 'card_deck', count: 1 },
  { defId: 'chess_set', count: 1 },
  { defId: 'checkers_board', count: 1 },
  { defId: 'backgammon_set', count: 1 },
  { defId: 'domino_box', count: 1 },
  { defId: 'go_set', count: 1 },
  { defId: 'dice_bone', count: 1 },
  { defId: 'battleship_pad', count: 1 },
];

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

function starterLockerLoot(): Item[] {
  return STARTER_LOCKER_LOOT.map(item => ({ ...item }));
}

function addStarterLocker(world: World, room: Room, x: number, y: number): WorldContainer {
  const idx = world.idx(x, y);
  world.features[idx] = Feature.SHELF;
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: 0,
    roomId: room.id,
    zoneId: world.zoneMap[idx],
    kind: ContainerKind.EMERGENCY_BOX,
    name: 'Учебный шкафчик вылазки',
    inventory: starterLockerLoot(),
    capacitySlots: STARTER_LOCKER_LOOT.length + 1,
    access: 'public',
    discovered: true,
    tags: ['tutorial', 'starter', 'public', 'low_level_loot'],
  };
  world.addContainer(container);
  return container;
}

export function generateTutorRoom(world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, isTutorial: boolean = false): { room: Room, spawnX: number, spawnY: number, nextRoomId: number } {

  /* ================================================================
   *  A. Актовый зал (briefing hall) — existing tutorial room
   * ================================================================ */
  const hallW = 11, hallH = 9;
  const armW = 7, armH = 14;

  // Find clear position near center — never overwrite apartments (aptMask)
  let hallX = 512 - Math.floor(hallW / 2);
  let hallY = 512 - Math.floor(hallH / 2);
  function areaClear(bx: number, by: number, fw: number, fh: number): boolean {
    for (let dy = -1; dy <= fh; dy++)
      for (let dx = -1; dx <= fw; dx++)
        if (world.aptMask[world.idx((bx + dx + W) % W, (by + dy + W) % W)]) return false;
    return true;
  }
  if (!areaClear(hallX, hallY, hallW + 1 + armW, Math.max(hallH, armH + 1) + TUTORIAL_START_CLEARANCE)) {
    // Spiral search outward from center for a clear spot
    let found = false;
    for (let r = 1; r < 200 && !found; r++)
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = (512 - Math.floor(hallW / 2) + dx + W) % W;
          const ty = (512 - Math.floor(hallH / 2) + dy + W) % W;
          if (areaClear(tx, ty, hallW + 1 + armW, Math.max(hallH, armH + 1) + TUTORIAL_START_CLEARANCE)) {
            hallX = tx; hallY = ty; found = true;
          }
        }
  }

  // Личность зала — из таблицы этажа: одна строка работает и объявлением, и рытьём,
  // и `defId`, которым Ольга Дмитриевна объявила это место своим.
  const room = stampNamedRoom(world, nextRoomId++, 'tutor_hall', LIVING_NAMED_ROOMS.tutor_hall,
    hallX, hallY, hallW, hallH);
  room.wallTex = Tex.TILE_W;
  room.floorTex = Tex.F_TILE;
  room.sealed = false; // Must be false so ensureConnectivity punches an exit to the maze!
  protectRoom(world, hallX, hallY, hallW, hallH, Tex.TILE_W, Tex.F_TILE);
  protectTutorialWallsAsHermetic(world, hallX, hallY, hallW, hallH);

  // Desks: feature layer props, not live entity billboards.
  for (let dy = 2; dy <= hallH - 3; dy += 2)
    for (let dx = 1; dx < hallW - 1; dx++)
      if (dx % 2 === 1) {
        world.features[world.idx(hallX + dx, hallY + dy)] = Feature.DESK;
      }

  // Slide walls: 2 cells on the north wall
  const slideX1 = hallX + Math.floor(hallW / 2) - 1;
  const slideX2 = hallX + Math.floor(hallW / 2);
  const slideY = hallY - 1;
  for (const sx of [slideX1, slideX2]) {
    const si = world.idx(sx, slideY);
    world.wallTex[si] = Tex.SLIDE_1;
    world.features[si] = Feature.SLIDE;
    world.slideCells.push(si);
  }

  // Keybind hint posters: west wall now, east wall after armory (protectRoom overwrites)
  {
    let hi = 0;
    // West wall of hall: x = hallX - 1 (5 textures on dy=0,2,4,6,8)
    for (let dy = 0; dy < hallH && hi < 7; dy += 2) {
      world.wallTex[world.idx(hallX - 1, hallY + dy)] = Tex.HINT_1 + hi;
      hi++;
    }
    // East wall hints are placed after armory section below
  }

  // Lamps
  world.features[world.idx(hallX + Math.floor(hallW / 2), hallY + Math.floor(hallH / 2))] = Feature.LAMP;
  world.features[world.idx(hallX + 2, hallY + 2)] = Feature.LAMP;
  world.features[world.idx(hallX + hallW - 3, hallY + 2)] = Feature.LAMP;
  addStarterLocker(world, room, hallX + 1, hallY + hallH - 2);

  // Пост объявлен анкетой, комнату называет тот, кто ставит человека сюда.
  postNpcToRoom(requireSpawnedPlotNpcFromPackage(entities, nextId, 'olga',
    hallX + Math.floor(hallW / 2) + 0.5,
    hallY + 1.5,
    {
      angle: Math.PI / 2,
      spriteSeed: 90,
      needs: POST_SHIFT_NEEDS,
    }), room.id);

  // Стартовая зона живёт своим модулем: там объявлен весь первый сиквенс и
  // сказано, на каких четырёх знаках он держится. Точку появления игрока
  // возвращает он же — раньше она была тернарником в конце этого файла.
  const start = generateTutorialStart(world, nextRoomId, entities, nextId, room, hallX, hallY, hallW, isTutorial);
  nextRoomId = start.nextRoomId;

  /* ================================================================
   *  B. Оружейная / Стрельбище (armory + shooting range)
   * ================================================================ */
  const armX = hallX + hallW + 1;
  const armY = hallY + 1;

  // То же и здесь: оружейную объявляет таблица этажа, а сержант Баринов ссылается
  // на неё псевдонимом, а не на русское имя, которое пишется для игрока.
  const armory = stampNamedRoom(world, nextRoomId++, 'armory', LIVING_NAMED_ROOMS.armory,
    armX, armY, armW, armH);
  armory.wallTex = Tex.METAL;
  armory.floorTex = Tex.F_CONCRETE;
  armory.sealed = true;
  protectRoom(world, armX, armY, armW, armH, Tex.METAL, Tex.F_CONCRETE);
  protectTutorialWallsAsHermetic(world, armX, armY, armW, armH);

  // ── Connecting corridor (2 cells between halls) + door ──
  const doorY = hallY + Math.floor(hallH / 2);
  const gapX = hallX + hallW;
  // Тем же ключом, что и Столовая: один ключ на всю стартовую зону.
  addTutorialDoor(world, gapX, doorY, room, armory,
    DoorState.LOCKED, Tex.DOOR_METAL, TUTORIAL_START.keyId, true);

  // ── Targets on far (south) wall ──
  for (let dx = 0; dx < armW; dx++) {
    const ci = world.idx(armX + dx, armY + armH);
    if (world.cells[ci] === Cell.WALL) {
      world.wallTex[ci] = Tex.TARGET;
    }
  }

  // ── Counter/barrier line at y offset 3 ──
  const counterY = armY + 3;
  for (let dx = 1; dx < armW - 1; dx++) {
    world.features[world.idx(armX + dx, counterY)] = Feature.DESK;
  }

  // ── Lamps in armory ──
  world.features[world.idx(armX + Math.floor(armW / 2), armY + 1)] = Feature.LAMP;
  world.features[world.idx(armX + Math.floor(armW / 2), armY + armH - 3)] = Feature.LAMP;
  world.features[world.idx(armX + 1, armY + 7)] = Feature.LAMP;
  world.features[world.idx(armX + armW - 2, armY + 7)] = Feature.LAMP;

  // ── Item drops: ammo on counter ──
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: armX + 3 + 0.5, y: armY + 1 + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0,
    sprite: Spr.ITEM_DROP, spriteScale: 1.0,
    inventory: [{ defId: 'ammo_9mm', count: 8 }],
  });

  postNpcToRoom(requireSpawnedPlotNpcFromPackage(entities, nextId, 'barni', armX + 2.5, armY + 1.5, {
    angle: Math.PI,
    needs: POST_SHIFT_NEEDS,
  }), armory.id);

  // ── East wall hint posters ──
  {
    const doorDy = Math.floor(hallH / 2);
    let hi = 5;
    for (let dy = hallH - 1; dy >= 0 && hi < 7; dy -= 2) {
      if (dy === doorDy) continue;
      world.wallTex[world.idx(hallX + hallW, hallY + dy)] = Tex.HINT_1 + hi;
      hi++;
    }
  }

  // ── Lore poster on south wall (center) ──
  world.wallTex[world.idx(hallX + Math.floor(hallW / 2), hallY + hallH)] = Tex.HINT_LORE;

  // ── Re-apply slide textures to guarantee they are never overwritten ──
  for (const sx of [slideX1, slideX2]) {
    const si = world.idx(sx, slideY);
    world.wallTex[si] = Tex.SLIDE_1;
    world.features[si] = Feature.SLIDE;
  }

  // Игрок начинает там, где начинается сиквенс: в туториале это запертая
  // Столовая, и место называет её модуль. Без туториала — здесь, в зале.
  const spawnX = start.spawn?.x ?? hallX + Math.floor(hallW / 2) + 0.5;
  const spawnY = start.spawn?.y ?? hallY + hallH - 2 + 0.5;

  return { room, spawnX, spawnY, nextRoomId };
}
