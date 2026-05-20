/* ── Hell main plot rooms — contact + Herald threshold ───────── */

import {
  W, Cell, Feature, FloorLevel,
  type Room, type Entity, type Item,
  EntityType, AIGoal,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { PLOT_NPCS } from '../../data/plot';
import { PLOT_ROOMS } from '../../data/plot_rooms';
import { registerRouteCue } from '../../systems/route_cues';
import { stampRoom, protectRoom, connectProtectedRoom, findClearArea } from '../shared';
import { Spr } from '../../render/sprite_index';

export function generateHellPlotChain(
  world: World, entities: Entity[], nextId: { v: number },
): void {
  const sx = W >> 1;
  const sy = W >> 1;

  const contactRoom = stampPlotRoom(world, 'hell_contact_cell', sx, sy, 8, 28, 14);
  decorateContactRoom(world, contactRoom);
  spawnPlotNpc(world, contactRoom, 'hell_contact', entities, nextId);
  dropRoomItem(world, contactRoom, entities, nextId, contactRoom.w - 2, contactRoom.h - 2, [
    { defId: 'bandage', count: 2 },
    { defId: 'water', count: 1 },
  ]);

  const thresholdRoom = stampPlotRoom(world, 'herald_threshold', sx, sy, 55, 120, 76);
  decorateThresholdRoom(world, thresholdRoom);
  spawnPlotNpc(world, thresholdRoom, 'herald_clue', entities, nextId);
  registerHeraldThresholdCue(world, contactRoom, thresholdRoom);
  dropRoomNote(world, contactRoom, entities, nextId, 1, contactRoom.h - 2,
    'Порог Вестников впереди: проверь обратный ход от контактной клетки, держи дверь между залпами и забирай награду с края, не из центра.');
  dropRoomItem(world, thresholdRoom, entities, nextId, 1, thresholdRoom.h - 2, [
    { defId: 'holy_water', count: 1 },
    { defId: 'antidep', count: 1 },
  ]);
}

function registerHeraldThresholdCue(world: World, contactRoom: Room, thresholdRoom: Room): void {
  const x = world.wrap(contactRoom.x + Math.floor(contactRoom.w / 2)) + 0.5;
  const y = world.wrap(contactRoom.y + Math.floor(contactRoom.h / 2)) + 0.5;
  const targetX = world.wrap(thresholdRoom.x + Math.floor(thresholdRoom.w / 2)) + 0.5;
  const targetY = world.wrap(thresholdRoom.y + Math.floor(thresholdRoom.h / 2)) + 0.5;
  registerRouteCue(world, {
    id: 'hell_herald_threshold_retreat',
    x,
    y,
    targetX,
    targetY,
    floor: FloorLevel.HELL,
    roomId: contactRoom.id,
    targetRoomId: thresholdRoom.id,
    label: 'порог Вестников',
    hint: 'входи только с отмеченным отходом; награда лежит у края',
    targetName: 'Порог Вестников',
    color: '#f88',
    tags: ['hell', 'herald_threshold', 'retreat', 'reward', 'warning'],
    toneSeed: contactRoom.id * 7301 + thresholdRoom.id,
    radius: 9,
    targetRadius: 5,
    cooldownSec: 45,
    heardText: 'Контактная клетка предупреждает: у порога Вестников сначала найди обратный ход.',
    followedText: 'Порог Вестников отмечен. Держи дверь между залпами и забирай награду с края.',
    ignoredText: 'Порог Вестников остался впереди без проверенного отхода.',
  });
}

function stampPlotRoom(
  world: World,
  roomId: 'hell_contact_cell' | 'herald_threshold',
  ax: number,
  ay: number,
  minDist: number,
  maxDist: number,
  fallbackShift: number,
): Room {
  const spec = PLOT_ROOMS[roomId];
  const pos = findClearArea(world, ax, ay, spec.w, spec.h, minDist, maxDist);
  const x = pos ? pos.x : world.wrap(ax + fallbackShift);
  const y = pos ? pos.y : world.wrap(ay + fallbackShift);
  const room = stampRoom(world, world.rooms.length, spec.roomType, x, y, spec.w, spec.h, -1);
  room.name = spec.name;
  room.wallTex = spec.wallTex;
  room.floorTex = spec.floorTex;
  protectRoom(world, room.x, room.y, room.w, room.h, spec.wallTex, spec.floorTex);
  connectProtectedRoom(world, room.x, room.y, room.w, room.h);
  return room;
}

function decorateContactRoom(world: World, room: Room): void {
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.CANDLE;
  world.features[world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))] = Feature.LAMP;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.SHELF;
}

function decorateThresholdRoom(world: World, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  world.features[world.idx(cx, cy)] = Feature.CANDLE;
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.CANDLE;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.CANDLE;
  world.features[world.idx(room.x + Math.floor(room.w / 2), room.y + room.h - 2)] = Feature.APPARATUS;
}

function spawnPlotNpc(
  world: World,
  room: Room,
  plotNpcId: 'hell_contact' | 'herald_clue',
  entities: Entity[],
  nextId: { v: number },
): void {
  const def = PLOT_NPCS[plotNpcId];
  const x = world.wrap(room.x + Math.floor(room.w / 2));
  const y = world.wrap(room.y + Math.floor(room.h / 2));
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: x + 0.5, y: y + 0.5,
    angle: Math.PI, pitch: 0, alive: true, speed: def.speed,
    sprite: def.sprite,
    name: def.name, isFemale: def.isFemale,
    needs: freshNeeds(), hp: def.hp, maxHp: def.maxHp, money: def.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(i => ({ ...i })),
    faction: def.faction, occupation: def.occupation,
    plotNpcId, canGiveQuest: true, questId: -1,
  });
}

function dropRoomItem(
  world: World,
  room: Room,
  entities: Entity[],
  nextId: { v: number },
  ox: number,
  oy: number,
  inventory: Item[],
): void {
  const x = world.wrap(room.x + ox);
  const y = world.wrap(room.y + oy);
  if (world.cells[world.idx(x, y)] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: x + 0.5, y: y + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory,
  });
}

function dropRoomNote(
  world: World,
  room: Room,
  entities: Entity[],
  nextId: { v: number },
  ox: number,
  oy: number,
  text: string,
): void {
  dropRoomItem(world, room, entities, nextId, ox, oy, [{ defId: 'note', count: 1, data: { text } }]);
}
