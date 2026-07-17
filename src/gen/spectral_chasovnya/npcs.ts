import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Feature,
  MonsterKind,
  W,
  ZoneFaction,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { factionToTerritoryOwner } from '../../data/factions';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { territoryOwnerAtIndex } from '../../systems/territory';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { SPECTRAL_CHASOVNYA_BASE_FLOOR, NextId, SpectralRooms, NPC_ID, SPECTRAL_AMBIENT_NPC_PREFIX, MIRON_DEF } from "./meta";
import { placeFeature } from "./geometry";

export function spawnPlotNpc(entities: Entity[], nextId: NextId, npcId: typeof NPC_ID, _def: PlotNpcDef, x: number, y: number, angle: number): number {
  const px = x + 0.5;
  const py = y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    aiTarget: { x: px, y: py },
  });
  return npc.id;
}

export function spawnSpectralMonster(
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  x: number,
  y: number,
  name: string,
  level: number,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const id = nextId.v++;
  const hp = Math.round(def.hp * (0.9 + level * 0.16));
  entities.push({
    id,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: (id * 0.771) % (Math.PI * 2),
    pitch: 0,
    alive: true,
    speed: def.speed * (1.02 + level * 0.025),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT || kind === MonsterKind.SHADOW || kind === MonsterKind.TONKAYA_TEN || kind === MonsterKind.GLUBINNAYA_TEN,
  });
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(container => container.id === id)) id++;
  return id;
}

export function addSpectralContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  tags: string[],
): void {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x: world.wrap(x),
    y: world.wrap(y),
    z: SPECTRAL_CHASOVNYA_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: 6,
    access,
    lockDifficulty: access === 'locked' ? 4 : undefined,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  placeFeature(world, x, y, kind === ContainerKind.FILING_CABINET ? Feature.SHELF : Feature.APPARATUS);
}

export function placeContent(world: World, entities: Entity[], nextId: NextId, rooms: SpectralRooms): void {
  spawnPlotNpc(entities, nextId, NPC_ID, MIRON_DEF, rooms.quietNorth.x + 5, rooms.quietNorth.y + 7, 0);
  spawnSpectralMonster(entities, nextId, MonsterKind.SLEPOGLAZ, rooms.focusArch.x + rooms.focusArch.w - 6, rooms.focusArch.y + 7, 'Слепоглаз у фокусирующей арки', 7);
  spawnSpectralMonster(entities, nextId, MonsterKind.TUMANNIK, rooms.nave.x + rooms.nave.w - 8, rooms.nave.y + 8, 'Туманник стоячей волны', 6);
  spawnSpectralMonster(entities, nextId, MonsterKind.GLUBINNAYA_TEN, rooms.crypt.x + rooms.crypt.w - 7, rooms.crypt.y + 12, 'Глубинная тень нижнего хора', 7);
  spawnSpectralMonster(entities, nextId, MonsterKind.SPIRIT, rooms.bellCage.x + 6, rooms.bellCage.y + 14, 'Дух с языком колокола', 6);

  addSpectralContainer(world, rooms.radioSacristy, rooms.radioSacristy.x + rooms.radioSacristy.w - 5, rooms.radioSacristy.y + 5, ContainerKind.FILING_CABINET, 'Шкаф радиоризницы с настройками тишины', 'locked', [
    { defId: 'radio_headset_liquidator', count: 1 },
    { defId: 'sound_emitter', count: 1 },
    { defId: 'field_radio_battery', count: 2 },
  ], ['spectral_chasovnya', 'radio', 'hearing_boost', 'locked']);
  addSpectralContainer(world, rooms.bellCage, rooms.bellCage.x + 5, rooms.bellCage.y + rooms.bellCage.h - 5, ContainerKind.SECRET_STASH, 'Ниша под главным колоколом', 'secret', [
    { defId: 'istotit_candle', count: 1 },
    { defId: 'bottled_voice', count: 1 },
  ], ['spectral_chasovnya', 'bell', 'psi', 'secret']);
  addSpectralContainer(world, rooms.crypt, rooms.crypt.x + 4, rooms.crypt.y + rooms.crypt.h - 5, ContainerKind.METAL_CABINET, 'Костяной ящик нижнего хора', 'public', [
    { defId: 'ammo_energy', count: 1 },
    { defId: 'radio_jammer', count: 1 },
  ], ['spectral_chasovnya', 'crypt', 'sound_counterplay']);
}

export function ambientSpectralNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !entity.id &&
    entity.name?.startsWith(SPECTRAL_AMBIENT_NPC_PREFIX) === true &&
    entity.faction !== undefined;
}

export function alignSpectralChasovnyaAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const slots = new Map<TerritoryOwner, number[]>();
  for (let idx = 0; idx < world.cells.length; idx++) {
    if (world.cells[idx] !== Cell.FLOOR || world.features[idx] !== Feature.NONE || world.containerMap.has(idx)) continue;
    const owner = territoryOwnerAtIndex(world, idx);
    if (owner === ZoneFaction.SAMOSBOR) continue;
    let list = slots.get(owner);
    if (!list) {
      list = [];
      slots.set(owner, list);
    }
    list.push(idx);
  }

  const used = new Set<number>();
  for (const entity of entities) {
    if (!ambientSpectralNpc(entity)) continue;
    const owner = factionToTerritoryOwner(entity.faction!);
    const list = slots.get(owner);
    if (!list || list.length === 0) continue;
    let pickIndex = (entity.id * 1103515245 + owner * 97) >>> 0;
    let cell = -1;
    for (let attempt = 0; attempt < Math.min(96, list.length); attempt++) {
      const candidate = list[(pickIndex + attempt * 37) % list.length];
      if (used.has(candidate)) continue;
      cell = candidate;
      break;
    }
    if (cell < 0) cell = list[pickIndex % list.length];
    used.add(cell);
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    if (entity.ai) {
      entity.ai.tx = entity.x;
      entity.ai.ty = entity.y;
      entity.ai.path.length = 0;
      entity.ai.pi = 0;
    }
  }
}

