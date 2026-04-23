/* ── Тайная курилка — permanent room (ministry) ───────────────── */
/* Hidden smoking room used by dissident clerks. Журналистка Аврора */
/* gives FETCH quest for compromising notes about samosbor cover-up. */

import {
  Cell, Tex, Feature, RoomType,
  type Room, type Entity,
  EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { stampRoom, protectRoom, connectProtectedRoom, findClearArea } from '../shared';
import { Spr } from '../../render/sprite_index';

/* ── NPC definition ──────────────────────────────────────────── */
const NPC_DEF: PlotNpcDef = {
  name: 'Журналистка Аврора',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 200, maxHp: 200, money: 250, speed: 1.1,
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'cigs', count: 6 },
    { defId: 'note', count: 4 },
    { defId: 'antidep', count: 2 },
  ],
  talkLines: [
    'Тс-с! Закрой дверь. И не оборачивайся. Курилка — единственное место без камер.',
    'Я Аврора. Веду расследование. Самосбор — это не природное явление. Это эксперимент.',
    'Министерство знает. Молчит. Каждый отчёт — фальшивка. И я докажу.',
    'Восемь записок, любых. Из архивов, кабинетов, со столов. Я найду в них коды и сошлю в самиздат.',
    'Если меня не станет — продолжай дело. Курилка останется. Дым не врёт.',
  ],
  talkLinesPost: [
    'Спасибо. Самиздат уже печатает. Министр в ярости — а значит, всё работает.',
    'Закуривай. Сегодня — мы выиграли один день.',
    'Если найдёшь ещё компромат — приноси. Я плачу.',
  ],
};

registerSideQuest('zhurnalistka_avrora', NPC_DEF, [
  {
    id: 'avrora_compromat',
    giverNpcId: 'zhurnalistka_avrora',
    type: QuestType.FETCH,
    desc: 'Аврора: «Восемь записок. Любых. Я найду в них коды и сошлю в самиздат.»',
    targetItem: 'note', targetCount: 8,
    rewardItem: 'psi_madness', rewardCount: 1,
    extraRewards: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 16 },
      { defId: 'antidep', count: 2 },
      { defId: 'cigs', count: 8 },
    ],
    relationDelta: 22, xpReward: 110, moneyReward: 350,
  },
]);

/* ── Generate Тайная курилка ─────────────────────────────────── */
const ROOM_W = 9;
const ROOM_H = 7;

export function generateSecretSmokingRoom(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  spawnX: number, spawnY: number,
): { nextRoomId: number } {
  const cx = Math.floor(spawnX);
  const cy = Math.floor(spawnY);

  const pos = findClearArea(world, cx, cy, ROOM_W, ROOM_H, 35, 90);
  const rx = pos ? pos.x : world.wrap(cx + 60);
  const ry = pos ? pos.y : world.wrap(cy + 60);

  const room: Room = stampRoom(world, nextRoomId, RoomType.SMOKING, rx, ry, ROOM_W, ROOM_H, -1);
  room.name = 'Тайная курилка';
  room.wallTex = Tex.MARBLE;
  room.floorTex = Tex.F_PARQUET;
  protectRoom(world, rx, ry, ROOM_W, ROOM_H, Tex.MARBLE, Tex.F_PARQUET);
  connectProtectedRoom(world, rx, ry, ROOM_W, ROOM_H);

  // Ensure parquet floor everywhere inside
  for (let dy = 0; dy < ROOM_H; dy++) {
    for (let dx = 0; dx < ROOM_W; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      world.floorTex[ci] = Tex.F_PARQUET;
    }
  }

  // Lighting
  const rcx = rx + Math.floor(ROOM_W / 2);
  const rcy = ry + Math.floor(ROOM_H / 2);
  world.features[world.idx(rcx, ry + 1)] = Feature.LAMP;
  world.features[world.idx(rcx, ry + ROOM_H - 2)] = Feature.LAMP;

  // Central low table with chairs around — dissident meeting spot
  const ti = world.idx(rcx, rcy);
  if (world.cells[ti] === Cell.FLOOR) world.features[ti] = Feature.TABLE;
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    const ci = world.idx(rcx + dx, rcy + dy);
    if (world.cells[ci] === Cell.FLOOR && !world.features[ci]) {
      world.features[ci] = Feature.CHAIR;
    }
  }
  // Shelf with samizdat books in a corner
  const shelfPositions: [number, number][] = [
    [rx + 1, ry + 1],
    [rx + ROOM_W - 2, ry + 1],
    [rx + 1, ry + ROOM_H - 2],
  ];
  for (const [sx, sy] of shelfPositions) {
    const ci = world.idx(sx, sy);
    if (world.cells[ci] === Cell.FLOOR && !world.features[ci]) {
      world.features[ci] = Feature.SHELF;
    }
  }

  // Loot scattered on the floor
  const lootPool = ['cigs', 'cigs', 'note', 'note', 'antidep', 'tea', 'book', 'ammo_9mm'];
  for (const defId of lootPool) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const lx = rx + 1 + Math.floor(Math.random() * (ROOM_W - 2));
      const ly = ry + 1 + Math.floor(Math.random() * (ROOM_H - 2));
      const ci = world.idx(lx, ly);
      if (world.cells[ci] !== Cell.FLOOR) continue;
      if (world.features[ci]) continue;
      entities.push({
        id: nextId.v++, type: EntityType.ITEM_DROP,
        x: lx + 0.5, y: ly + 0.5, angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
        inventory: [{ defId, count: 1 }],
      });
      break;
    }
  }

  // NPC: Журналистка Аврора near the table
  const npcX = rcx + 1;
  const npcY = rcy;
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: npcX + 0.5, y: npcY + 0.5,
    angle: Math.PI, pitch: 0,
    alive: true, speed: NPC_DEF.speed, sprite: NPC_DEF.sprite,
    name: NPC_DEF.name, isFemale: NPC_DEF.isFemale,
    needs: freshNeeds(), hp: NPC_DEF.hp, maxHp: NPC_DEF.maxHp, money: NPC_DEF.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: NPC_DEF.inventory.map(i => ({ ...i })),
    weapon: 'makarov',
    faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
    plotNpcId: 'zhurnalistka_avrora', canGiveQuest: true, questId: -1,
  });

  // Two co-conspirator clerks (named, no quests)
  const friends: { name: string; isFemale: boolean; occ: Occupation; x: number; y: number }[] = [
    { name: 'Делопроизводитель Семён', isFemale: false, occ: Occupation.SECRETARY, x: rcx - 1, y: rcy },
    { name: 'Стенографистка Лиза',     isFemale: true,  occ: Occupation.SECRETARY, x: rcx,     y: rcy + 1 },
  ];
  for (const f of friends) {
    const ci = world.idx(f.x, f.y);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    entities.push({
      id: nextId.v++, type: EntityType.NPC,
      x: f.x + 0.5, y: f.y + 0.5,
      angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true, speed: 0.9, sprite: f.occ,
      name: f.name, isFemale: f.isFemale,
      needs: freshNeeds(), hp: 90, maxHp: 90, money: 30,
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [{ defId: 'cigs', count: 2 }, { defId: 'note', count: 1 }],
      faction: Faction.CITIZEN, occupation: f.occ,
      questId: -1,
    });
  }

  console.log(`[SECRET_SMOKING] at (${rx}, ${ry}) room #${room.id}`);
  const usedId = Math.max(nextRoomId, room.id + 1);
  return { nextRoomId: usedId };
}
