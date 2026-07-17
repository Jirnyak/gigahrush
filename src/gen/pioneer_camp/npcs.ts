import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Feature,
  MonsterKind,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { PIONEER_CAMP_BASE_FLOOR, CX, CY, NPC_IDS, CampNpcId, CampRooms, NPC_DEFS } from "./meta";
import { setFeature } from "./geometry";

export function spawnCampNpcs(
  entities: Entity[],
  nextId: { v: number },
  rooms: CampRooms,
): Record<CampNpcId, number> {
  return {
    camp_shift_tamara: spawnPlotNpc(entities, nextId, NPC_IDS.shift, NPC_DEFS.camp_shift_tamara, rooms.square.x + 46, rooms.square.y + 36, 0),
    camp_radio_egor: spawnPlotNpc(entities, nextId, NPC_IDS.radio, NPC_DEFS.camp_radio_egor, rooms.radioClub.x + 15, rooms.radioClub.y + 12, Math.PI),
    camp_medic_ira: spawnPlotNpc(entities, nextId, NPC_IDS.medic, NPC_DEFS.camp_medic_ira, rooms.infirmary.x + 8, rooms.infirmary.y + 12, 0),
    camp_canteen_zoya: spawnPlotNpc(entities, nextId, NPC_IDS.cook, NPC_DEFS.camp_canteen_zoya, rooms.canteen.x + 12, rooms.canteen.y + 18, Math.PI / 2, 'knife'),
  };
}

export function placeCampContainers(world: World, rooms: CampRooms, owners: Record<CampNpcId, number>): void {
  addCampContainer(world, rooms.canteen, rooms.canteen.x + rooms.canteen.w - 5, rooms.canteen.y + 6, ContainerKind.FRIDGE, 'Холодильник столовой с подписанным компотом', 'owner', [
    { defId: 'kompot', count: 3 },
    { defId: 'kasha', count: 3 },
    { defId: 'pressed_sugar', count: 2 },
  ], owners.camp_canteen_zoya, NPC_DEFS.camp_canteen_zoya.name, ['pioneer_camp', 'canteen', 'food']);

  addCampContainer(world, rooms.infirmary, rooms.infirmary.x + rooms.infirmary.w - 4, rooms.infirmary.y + rooms.infirmary.h - 5, ContainerKind.MEDICAL_CABINET, 'Аптечный шкаф тихого часа', 'owner', [
    { defId: 'sanitary_kit', count: 1 },
    { defId: 'iodine', count: 2 },
    { defId: 'bandage', count: 2 },
  ], owners.camp_medic_ira, NPC_DEFS.camp_medic_ira.name, ['pioneer_camp', 'medical']);

  addCampContainer(world, rooms.radioClub, rooms.radioClub.x + rooms.radioClub.w - 4, rooms.radioClub.y + 6, ContainerKind.TOOL_LOCKER, 'Ящик радиокружка с мотками', 'owner', [
    { defId: 'wire_coil', count: 2 },
    { defId: 'circuit_board', count: 1 },
    { defId: 'radio', count: 1 },
  ], owners.camp_radio_egor, NPC_DEFS.camp_radio_egor.name, ['pioneer_camp', 'radio', 'repair']);

  addCampContainer(world, rooms.storage, rooms.storage.x + rooms.storage.w - 5, rooms.storage.y + 10, ContainerKind.TOOL_LOCKER, 'Склад смены с проволокой и сахаром', 'room', [
    { defId: 'wire_coil', count: 1 },
    { defId: 'pressed_sugar', count: 1 },
    { defId: 'blank_form', count: 1 },
  ], undefined, undefined, ['pioneer_camp', 'storage', 'loudspeaker', 'canteen']);

  addCampContainer(world, rooms.library, rooms.library.x + rooms.library.w - 5, rooms.library.y + 5, ContainerKind.FILING_CABINET, 'Картотека отрядных дел', 'room', [
    { defId: 'book', count: 4 },
    { defId: 'blank_form', count: 2 },
    { defId: 'child_map', count: 1 },
  ], undefined, undefined, ['pioneer_camp', 'library', 'documents']);

  addCampContainer(world, rooms.oldCabin, rooms.oldCabin.x + rooms.oldCabin.w - 5, rooms.oldCabin.y + rooms.oldCabin.h - 5, ContainerKind.SECRET_STASH, 'Ржавый сейф старого корпуса', 'locked', [
    { defId: 'emergency_roster', count: 1 },
    { defId: 'siren_instruction', count: 1 },
    { defId: 'meat_rune', count: 1 },
  ], undefined, undefined, ['pioneer_camp', 'old_camp', 'samosbor']);
}

export function spawnCampThreats(world: World, entities: Entity[], nextId: { v: number }, rooms: CampRooms): void {
  spawnMonster(world, entities, nextId, MonsterKind.NELYUD, rooms.oldCabin.x + 18, rooms.oldCabin.y + 10, 3);
  spawnMonster(world, entities, nextId, MonsterKind.SHADOW, rooms.oldCabin.x + 7, rooms.oldCabin.y + 6, 3);
  spawnMonster(world, entities, nextId, MonsterKind.EYE, rooms.radioClub.x + rooms.radioClub.w + 8, rooms.radioClub.y + 6, 2);
  spawnMonster(world, entities, nextId, MonsterKind.TUBE_EEL, CX + 112, CY + 188, 3);
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: CampNpcId,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): number {
  const px = x + 0.5;
  const py = y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    weapon,
    aiTarget: { x: px, y: py },
  });
  return npc.id;
}

export function addCampContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  ownerNpcId: number | undefined,
  ownerName: string | undefined,
  tags: string[],
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: world.wrap(x),
    y: world.wrap(y),
    z: PIONEER_CAMP_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 4),
    ownerNpcId,
    ownerName,
    access,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.FRIDGE || kind === ContainerKind.MEDICAL_CABINET ? Feature.SHELF : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (1 + level * 0.18));
  const monster: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (1 + level * 0.04),
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    phasing: kind === MonsterKind.SHADOW,
  };
  entities.push(monster);
}

