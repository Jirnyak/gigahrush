/* ── Информаторий — библиотека (zone 7 content module) ────────── */
/* Большая читальня с полками, лампой и библиотекаршей.            */
/* Self-contained: NPC + FETCH quest + room generator.             */

import {
  Cell, Tex, Feature, RoomType,
  type Room, type Entity, EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { registerZoneContent } from './zone_content';
import { Spr } from '../../render/sprite_index';

const NPC_DEF: PlotNpcDef = {
  name: 'Маргарита Павловна',
  isFemale: true,
  faction: Faction.SCIENTIST,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 90, maxHp: 90, money: 40, speed: 0.6,
  inventory: [
    { defId: 'book', count: 8 },
    { defId: 'note', count: 4 },
    { defId: 'tea', count: 2 },
  ],
  talkLines: [
    'Тс-с-с… В Информатории не шумят. Здесь ещё хранится разум хруща.',
    'Я — Маргарита Павловна. Тридцать лет каталогизирую то, что бетон не успел сожрать.',
    'Книги пропадают. Полки пустеют каждый самосбор. Если бы вы могли вернуть хотя бы пять томов…',
    'Взамен я отдам вам одну из моих записей. Они… бывают полезны. Особенно про пси.',
  ],
  talkLinesPost: [
    'Спасибо, читатель. Полки снова дышат.',
    'Если найдёте редкое издание — несите. Я узнаю.',
    'Тише. Бетон слышит шёпот.',
  ],
};

registerSideQuest('margarita_librarian', NPC_DEF, [
  {
    id: 'margarita_books',
    giverNpcId: 'margarita_librarian',
    type: QuestType.FETCH,
    desc: 'Маргарита Павловна: «Принесите мне пять книг. Любых. Полки голодают.»',
    targetItem: 'book', targetCount: 5,
    rewardItem: 'psi_strike', rewardCount: 1,
    extraRewards: [
      { defId: 'note', count: 3 },
      { defId: 'antidep', count: 1 },
      { defId: 'tea', count: 2 },
    ],
    relationDelta: 20, xpReward: 50, moneyReward: 80,
  },
]);

/* Library: large reading hall (15 wide × 11 tall). */
const LIB_W = 15;
const LIB_H = 11;

function generateLibrary(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  zcx: number, zcy: number,
): { nextRoomId: number } {
  // top-left interior corner
  const rx = world.wrap(zcx - Math.floor(LIB_W / 2));
  const ry = world.wrap(zcy - Math.floor(LIB_H / 2));

  // Phase 1: bulldoze bounding box (ring +1)
  for (let dy = -1; dy <= LIB_H; dy++) {
    for (let dx = -1; dx <= LIB_W; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci]) continue;
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = Tex.PANEL;
      world.floorTex[ci] = Tex.F_PARQUET;
      world.roomMap[ci] = -1;
      world.features[ci] = 0;
    }
  }

  // Phase 2: carve room
  const roomId = nextRoomId++;
  const room: Room = {
    id: roomId, type: RoomType.COMMON,
    x: rx, y: ry, w: LIB_W, h: LIB_H,
    name: 'Информаторий',
    wallTex: Tex.PANEL, floorTex: Tex.F_PARQUET,
    doors: [], sealed: false, apartmentId: -1,
  };
  world.rooms[roomId] = room;

  for (let dy = 0; dy < LIB_H; dy++) {
    for (let dx = 0; dx < LIB_W; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci]) continue;
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = Tex.F_PARQUET;
      world.roomMap[ci] = roomId;
    }
  }

  // Phase 3: protect with aptMask (room interior + 1-cell wall ring)
  for (let dy = -1; dy <= LIB_H; dy++) {
    for (let dx = -1; dx <= LIB_W; dx++) {
      world.aptMask[world.idx(rx + dx, ry + dy)] = 1;
    }
  }

  // Phase 4: features — bookshelves along long walls + reading tables/chairs in center
  // Bookshelves: every cell next to north & south walls except middle entrance gap
  for (let dx = 1; dx < LIB_W - 1; dx++) {
    if (dx === Math.floor(LIB_W / 2)) continue; // entrance row gap
    world.features[world.idx(rx + dx, ry + 1)]        = Feature.SHELF;
    world.features[world.idx(rx + dx, ry + LIB_H - 2)] = Feature.SHELF;
  }
  // Reading tables (3 across the middle row), chairs around them
  const midY = ry + Math.floor(LIB_H / 2);
  for (let i = 0; i < 3; i++) {
    const tx = rx + 3 + i * 4;
    world.features[world.idx(tx, midY)]     = Feature.TABLE;
    world.features[world.idx(tx, midY - 1)] = Feature.CHAIR;
    world.features[world.idx(tx, midY + 1)] = Feature.CHAIR;
  }
  // Lamps in 4 corners of interior + center
  world.features[world.idx(rx + 1, ry + 1)]                = Feature.LAMP;
  world.features[world.idx(rx + LIB_W - 2, ry + 1)]        = Feature.LAMP;
  world.features[world.idx(rx + 1, ry + LIB_H - 2)]        = Feature.LAMP;
  world.features[world.idx(rx + LIB_W - 2, ry + LIB_H - 2)] = Feature.LAMP;
  world.features[world.idx(rx + Math.floor(LIB_W / 2), midY)] = Feature.LAMP;

  // Phase 5: door at south wall middle
  const doorX = rx + Math.floor(LIB_W / 2);
  const doorY = ry + LIB_H;
  const doorI = world.idx(doorX, doorY);
  world.cells[doorI] = Cell.DOOR;
  world.aptMask[doorI] = 1;

  // Phase 6: connect to maze — short southward corridor
  let cx = doorX, cy = world.wrap(doorY + 1);
  for (let s = 0; s < 60; s++) {
    const ci = world.idx(cx, cy);
    if (world.cells[ci] === Cell.FLOOR && !world.aptMask[ci]) break;
    if (!world.aptMask[ci]) {
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = Tex.F_LINO;
      world.roomMap[ci] = -1;
    }
    cy = world.wrap(cy + 1);
  }

  // Phase 7: scatter a few books on floor (loot)
  for (let i = 0; i < 6; i++) {
    const bx = rx + 1 + Math.floor(Math.random() * (LIB_W - 2));
    const by = ry + 1 + Math.floor(Math.random() * (LIB_H - 2));
    if (world.features[world.idx(bx, by)]) continue;
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: bx + 0.5, y: by + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: Math.random() < 0.3 ? 'note' : 'book', count: 1 }],
    });
  }

  // Phase 8: NPC — librarian behind central reading row
  const npcX = rx + Math.floor(LIB_W / 2) + 0.5;
  const npcY = ry + 1 + 0.5;
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: npcX, y: npcY,
    angle: Math.PI / 2, pitch: 0,
    alive: true, speed: NPC_DEF.speed, sprite: NPC_DEF.sprite,
    name: NPC_DEF.name, isFemale: NPC_DEF.isFemale,
    needs: freshNeeds(), hp: NPC_DEF.hp, maxHp: NPC_DEF.maxHp, money: NPC_DEF.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: NPC_DEF.inventory.map(i => ({ ...i })),
    faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
    plotNpcId: 'margarita_librarian', canGiveQuest: true, questId: -1,
  });

  console.log(`[LIBRARY] Информаторий at (${rx}, ${ry}) room #${roomId}`);
  return { nextRoomId };
}

registerZoneContent(7, 'Информаторий (библиотека)', generateLibrary);
