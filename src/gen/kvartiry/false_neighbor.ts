/* ── Комната чужой очереди — Kvartiry close-reveal encounter ─── */

import {
  AIGoal, EntityType, Faction, FloorLevel, MonsterKind, Occupation, QuestType,
  RoomType, Tex, Feature, type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { MONSTERS, applyMonsterVariant } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import {
  createSocialPoiRoom, placeDropNear, setFeatureIfFloor, spawnAmbientNpc, spawnSocialNpc,
} from './social_helpers';

const RAYA: PlotNpcDef = {
  name: 'Рая Подозрительная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 85, maxHp: 85, money: 12, speed: 0.85,
  inventory: [{ defId: 'note', count: 1 }, { defId: 'fake_pass', count: 1 }],
  talkLines: [
    'В очереди лишний сосед. Он стоит молча, пока к нему не подходят за солью.',
    'Я повесила лампу и оставила проход свободным. Если он дернется - бегите к двери, не к стене.',
    'Фальшивый пропуск у него в кармане как кожа: вроде свой, а шрифт чужой.',
  ],
  talkLinesPost: [
    'Теперь очередь хотя бы человеческая. Это ненадолго, но слышно сразу.',
    'Не смейтесь над моей коробкой. Детектор пищал раньше, чем люди.',
  ],
};

registerSideQuest('kv_raya_podozritelnaya', RAYA, [{
  id: 'kv_false_neighbor_nelyud',
  giverNpcId: 'kv_raya_podozritelnaya',
  type: QuestType.KILL,
  desc: 'Рая Подозрительная: «Убейте тихого соседа в комнате чужой очереди. Близко не подходите, пока не готовы бежать.»',
  targetMonsterKind: MonsterKind.NELYUD,
  killNeeded: 1,
  rewardItem: 'unpeople_detector',
  rewardCount: 1,
  extraRewards: [{ defId: 'fake_pass', count: 1 }],
  relationDelta: 14, xpReward: 85, moneyReward: 45,
}]);

function spawnNelyud(world: World, entities: Entity[], nextId: { v: number }, x: number, y: number): void {
  const def = MONSTERS[MonsterKind.NELYUD];
  const ci = world.idx(x, y);
  const zid = world.zoneMap[ci];
  const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 2) : 2;
  const hp = scaleMonsterHp(def.hp, zoneLevel);
  const monster: Entity = {
    id: nextId.v++, type: EntityType.MONSTER,
    x: x + 0.5, y: y + 0.5,
    angle: Math.PI, pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel),
    sprite: monsterSpr(MonsterKind.NELYUD),
    name: 'Тихий сосед',
    hp, maxHp: hp,
    monsterKind: MonsterKind.NELYUD,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(zoneLevel),
  };
  applyMonsterVariant(monster, FloorLevel.KVARTIRY, true);
  entities.push(monster);
}

export function generateFalseNeighborRoom(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(
    world, nextRoomId, spawnX, spawnY,
    'Комната чужой очереди',
    RoomType.LIVING,
    13, 8,
    Tex.PANEL, Tex.F_LINO,
    70, 190,
    1.8,
  );
  if (!poi) return nextRoomId;

  for (let dx = 2; dx < poi.w - 2; dx += 3) {
    setFeatureIfFloor(world, poi.x + dx, poi.y + 2, Feature.CHAIR);
    setFeatureIfFloor(world, poi.x + dx, poi.y + 5, Feature.TABLE);
  }
  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.LAMP);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + 1, Feature.SHELF);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + poi.h - 2, Feature.BED);
  world.wallTex[world.idx(poi.x + Math.floor(poi.w / 2), poi.y - 1)] = Tex.POSTER_BASE + 28;

  spawnSocialNpc(entities, nextId, RAYA, 'kv_raya_podozritelnaya', poi.x + 2, poi.y + 2);
  spawnAmbientNpc(entities, nextId, 'Леня Очередной', Faction.CITIZEN, Occupation.LOCKSMITH, poi.x + 4, poi.y + 5, [{ defId: 'bread', count: 1 }]);
  spawnNelyud(world, entities, nextId, poi.x + poi.w - 3, poi.y + poi.h - 3);

  for (const defId of ['note', 'fake_pass', 'unpeople_detector', 'bread']) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}
