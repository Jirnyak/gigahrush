import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, RoomType } from '../src/core/types';
import { designFloorById } from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';
import { SIDE_QUESTS } from '../src/data/plot';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';

test('registry morgue is a monster-heavy bureaucratic horror floor with bounded staff', () => {
  const route = designFloorById('registry_morgue');
  assert.ok(route);
  const profile = designFloorPopulationProfile(route);
  assert.equal(profile.npcTarget, 480);
  assert.equal(profile.monsterTarget, 1150);

  const gen = generateDesignFloor('registry_morgue');
  const npcs = gen.entities.filter(e => e.type === EntityType.NPC);
  const monsters = gen.entities.filter(e => e.type === EntityType.MONSTER);

  assert.equal(npcs.length >= 250 && npcs.length <= 700, true, `npc count ${npcs.length}`);
  assert.equal(monsters.length >= 700 && monsters.length <= 1600, true, `monster count ${monsters.length}`);
  assert.equal(monsters.length > npcs.length * 2, true, `monsters ${monsters.length}, npcs ${npcs.length}`);
  assert.equal(gen.world.rooms.some(room => room.type === RoomType.MEDICAL && room.name.includes('Зараженная камера')), true);
  assert.equal(gen.world.rooms.some(room => room.type === RoomType.STORAGE && room.name.includes('Холодная')), true);
});

test('registry morgue gates valuable records and medicine behind owned or locked containers', () => {
  const gen = generateDesignFloor('registry_morgue');
  const bodyStorage = gen.world.containers.find(c => c.name === 'Холодная картотека без номера');
  const medCabinet = gen.world.containers.find(c => c.name === 'Опечатанный медицинский шкаф Крутова');
  const deathSafe = gen.world.containers.find(c => c.name === 'Сейф свидетельств о смерти');

  assert.ok(bodyStorage);
  assert.equal(bodyStorage.access, 'owner');
  assert.equal(bodyStorage.tags.includes('body_storage'), true);
  assert.equal(bodyStorage.tags.includes('morgue_theft'), true);
  assert.equal(bodyStorage.inventory.some(item => item.defId === 'missing_record_file'), true);
  assert.equal(bodyStorage.inventory.some(item => item.defId === 'container_key_label'), true);

  assert.ok(medCabinet);
  assert.equal(medCabinet.access, 'owner');
  assert.equal(medCabinet.tags.includes('quarantine'), true);
  assert.equal(medCabinet.tags.includes('morgue_theft'), true);
  assert.equal(medCabinet.inventory.filter(item => item.defId === 'morphine_ampoule').length, 1);

  assert.ok(deathSafe);
  assert.equal(deathSafe.access, 'locked');
  assert.equal(deathSafe.tags.includes('false_death'), true);
  assert.equal(deathSafe.inventory.some(item => item.defId === 'record_exposure_notice'), true);
});

test('registry morgue side quests publish record, false-death, theft, and quarantine hooks', () => {
  generateDesignFloor('registry_morgue');
  const byId = new Map(SIDE_QUESTS.map(quest => [quest.id, quest]));

  assert.equal(byId.get('morgue_find_tag')?.eventTags?.includes('record_correction'), true);
  assert.equal(byId.get('morgue_find_tag')?.targetRoute?.designFloorId, 'registry_morgue');
  assert.equal(byId.get('morgue_swap_certificate')?.eventTags?.includes('false_death'), true);
  assert.equal(byId.get('morgue_missing_body')?.eventTags?.includes('false_body'), true);
  assert.equal(byId.get('morgue_medicine_lock')?.eventTags?.includes('quarantine_paper_use'), true);
});
