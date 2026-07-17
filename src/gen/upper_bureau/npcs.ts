/* ── Design z: Верхнее бюро ──────────────────────────────── */

import {
  Faction,
  Occupation,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import {
  type NextId, spawnAdminNpc, spawnNamedCivilian,
} from '../admin_common';
import {
  ISKRA_DEF,
  LEV_DEF,
  TOLIK_DEF,
  ANNA_DEF,
  TOLL_KEEPER_DEF,
  AMBUSH_DEF,
  UpperBureauRooms,
  NpcIds} from './geometry';

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

export function spawnUpperBureauNpcs(entities: Entity[], nextId: NextId, rooms: UpperBureauRooms): NpcIds {
  const { salon, audit, cleaner, archiveToll, permitAmbush } = rooms;

  const iskraId = nextId.v;
  spawnAdminNpc(entities, nextId, ISKRA_DEF, 'bureau_madam_iskra', salon.x + 6, salon.y + 3);

  const levId = nextId.v;
  spawnAdminNpc(entities, nextId, LEV_DEF, 'bureau_auditor_lev', audit.x + 10, audit.y + 3, true, 'makarov');

  const tolikId = nextId.v;
  spawnAdminNpc(entities, nextId, TOLIK_DEF, 'bureau_cleaner_tolik', cleaner.x + 4, cleaner.y + 4);

  spawnAdminNpc(entities, nextId, ANNA_DEF, 'bureau_visitor_anna', salon.x + 21, salon.y + 13);

  const tollKeeperId = nextId.v;
  spawnAdminNpc(entities, nextId, TOLL_KEEPER_DEF, 'bureau_archive_toll_keeper', archiveToll.x + 4, archiveToll.y + 4);

  const ambushId = nextId.v;
  spawnAdminNpc(entities, nextId, AMBUSH_DEF, 'bureau_permit_ambush_guard', permitAmbush.x + 5, permitAmbush.y + 4, true, 'makarov');

  spawnNamedCivilian(
    entities, nextId, 'Инспектор Главного Поста', false,
    530, 510, Occupation.HUNTER, Faction.LIQUIDATOR,
    [{ defId: 'key', count: 1 }, { defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 10 }],
    'makarov',
  );
  spawnNamedCivilian(
    entities, nextId, 'Понятая у ковра', true,
    salon.x + 9, salon.y + 12, Occupation.SECRETARY, Faction.CITIZEN,
    [{ defId: 'sealed_complaint', count: 1 }, { defId: 'tea', count: 1 }],
  );
  spawnNamedCivilian(
    entities, nextId, 'Младший Засадный', false,
    permitAmbush.x + permitAmbush.w - 5, permitAmbush.y + 7, Occupation.HUNTER, Faction.LIQUIDATOR,
    [{ defId: 'denunciation', count: 1 }, { defId: 'ammo_9mm', count: 6 }],
    'makarov',
  );

  return { iskraId, levId, tolikId, tollKeeperId, ambushId };
}

