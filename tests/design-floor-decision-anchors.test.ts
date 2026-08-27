/* Замок на подключённые развилки этажей.
 *
 * Двадцать авторских функций решения на четырёх этажах были написаны с
 * русскими строками журнала и не имели НИ ОДНОГО вызова: состояние погоды
 * крыши, ритуала подада, служебного этажа и сигнала антенного двора
 * создавалось, печаталось в отладку и навсегда оставалось в исходных нулях.
 *
 * Тест держит именно достижимость: у каждой развилки есть клетка в авторской
 * комнате, у клетки есть визуальная фича (иначе игрок не увидит, куда жать),
 * и вызов авторской функции действительно двигает состояние. Проверять здесь
 * «сколько якорей ровно» бессмысленно — важно, что ни один не потерялся.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Feature, type Entity } from '../src/core/types';
import { makeGameState, makeTestPlayer } from './helpers';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { getRouteCueMarkers } from '../src/systems/route_cues';

import { ROOF_DECISION_SPECS, applyRoofDecision, roofDecisionAnchors, roofWeatherFor } from '../src/gen/roof/decisions';
import { underhellDecisionAnchors, underhellRitualFor } from '../src/gen/underhell/decisions';
import {
  SERVICE_DECISION_SPECS,
  applyServiceDecision,
  serviceDecisionAnchors,
  serviceFloorStateFor,
} from '../src/gen/service_floor/decisions';
import {
  ANTENNA_DECISION_SPECS,
  antennaDecisionAnchors,
  antennaSignalFor,
  applyAntennaDecision,
} from '../src/gen/antenna_court/decisions';

/** Развилки публикуют настоящие события, поэтому состояние берётся общим
 *  помощником тестов, а не собирается заглушкой: `publishEvent` читает часы. */
function stubActors(): { player: Entity; game: ReturnType<typeof makeGameState> } {
  return { player: makeTestPlayer(), game: makeGameState({ currentZ: 0 }) };
}

test('крыша: пять развилок погоды стоят в мире и меняют состояние', () => {
  const gen = generateDesignFloor('roof');
  const anchors = roofDecisionAnchors(gen.world);
  assert.equal(anchors.length, ROOF_DECISION_SPECS.length, 'потерян якорь развилки крыши');

  for (const anchor of anchors) {
    assert.notEqual(gen.world.features[anchor.cell], Feature.NONE, `${anchor.id}: якорь без видимой фичи`);
    const room = gen.world.rooms[gen.world.roomMap[anchor.cell]];
    assert.ok(room, `${anchor.id}: якорь вне комнаты`);
  }

  const weather = roofWeatherFor(gen.world)!;
  assert.equal(weather.antennaRepaired, false);
  const { player, game } = stubActors();
  const mast = anchors.find(a => a.action === 'repair_signal')!;
  // Цена пропускается: тест про достижимость развилки, а не про кошелёк.
  assert.equal(applyRoofDecision(gen.world, game, player, mast, true), true);
  assert.equal(weather.antennaRepaired, true, 'починка мачты не тронула состояние');
  assert.ok(game.msgs.length > 0, 'русская строка журнала не дошла до игрока');
  // Повторный ход закрыт: развилка одноразовая.
  assert.equal(applyRoofDecision(gen.world, game, player, mast, true), false);
});

test('подад: развилки ритуала стоят в авторских комнатах', () => {
  const gen = generateDesignFloor('underhell');
  const anchors = underhellDecisionAnchors(gen.world);
  const ritual = underhellRitualFor(gen.world)!;
  assert.ok(anchors.length >= 6, `слишком мало якорей ритуала: ${anchors.length}`);

  const byId = new Map(anchors.map(a => [a.id, a]));
  // Три платы поста, обе свидетельские клетки, печь долга и идол-якорь.
  assert.ok(byId.has('underhell_threshold_holy_water'));
  assert.ok(byId.has('underhell_threshold_passport_stub'));
  assert.ok(byId.has('underhell_threshold_blood_35hp'));
  assert.ok(byId.has('underhell_debt_burn'));
  assert.ok(byId.has('underhell_void_anchor'));

  const thresholdRoom = gen.world.rooms[ritual.thresholdRoomId];
  for (const id of ['underhell_threshold_holy_water', 'underhell_threshold_blood_35hp']) {
    const anchor = byId.get(id)!;
    assert.equal(gen.world.roomMap[anchor.cell], thresholdRoom.id, `${id}: плата не в палате поста`);
  }
  for (const anchor of anchors) {
    assert.notEqual(gen.world.features[anchor.cell], Feature.NONE, `${anchor.id}: якорь без видимой фичи`);
  }
});

test('служебный С-15: пять развилок доступны и двигают флаги маршрута', () => {
  const gen = generateDesignFloor('service_floor');
  const anchors = serviceDecisionAnchors(gen.world);
  assert.equal(anchors.length, SERVICE_DECISION_SPECS.length, 'потерян якорь развилки служебного этажа');

  const service = serviceFloorStateFor(gen.world)!;
  assert.equal(service.liftMachineState, 'faulty');
  const { player, game } = stubActors();

  const lift = anchors.find(a => a.decision.kind === 'repair_lift')!;
  assert.equal(applyServiceDecision(gen.world, game, player, lift, true), true);
  assert.equal(service.liftMachineState, 'repaired', 'ремонт лебёдки не тронул состояние');
  assert.equal(service.rerouteFlags.lowerStaffRouteOpen, true, 'нижний коридор не открылся');

  const vent = anchors.find(a => a.decision.kind === 'power' && a.decision.zoneId === 'ventilation')!;
  assert.equal(service.powerZones.some(z => z.id === 'ventilation' && z.powered), false);
  assert.equal(applyServiceDecision(gen.world, game, player, vent, true), true);
  assert.equal(service.powerZones.some(z => z.id === 'ventilation' && z.powered), true);
});

test('антенный двор: пять развилок сигнала доступны и меняют эфир', () => {
  const gen = generateDesignFloor('antenna_court');
  const anchors = antennaDecisionAnchors(gen.world);
  assert.equal(anchors.length, ANTENNA_DECISION_SPECS.length, 'потерян якорь развилки антенного двора');

  const signal = antennaSignalFor(gen.world)!;
  const before = signal.signalQuality;
  const { player, game } = stubActors();

  const repair = anchors.find(a => a.kind === 'repair')!;
  assert.equal(applyAntennaDecision(gen.world, game, player, repair, true), true);
  assert.ok(signal.signalQuality >= before, 'ремонт реле не тронул качество сигнала');

  const battery = anchors.find(a => a.kind === 'battery')!;
  assert.equal(applyAntennaDecision(gen.world, game, player, battery, true), true);
  assert.notEqual(signal.recordedAnomalyFlags, 0, 'снятая батарея не оставила следа в эфире');
  // Одноразовая развилка: второй раз батарею не снять.
  assert.equal(applyAntennaDecision(gen.world, game, player, battery, true), false);
});

test('каталоги развилок бюро слышны игроком через маршрутные подсказки', () => {
  for (const [floor, prefix, least] of [
    ['upper_bureau', 'upper_bureau_', 3],
    ['cayley_byuro', 'cayley_byuro_decision_', 3],
  ] as const) {
    const gen = generateDesignFloor(floor);
    const cues = getRouteCueMarkers(gen.world).filter(marker => marker.id.startsWith(prefix));
    assert.ok(cues.length >= least, `${floor}: подсказок каталога ${cues.length}, ожидалось не меньше ${least}`);
    for (const cue of cues) {
      assert.ok(cue.hint.length > 0, `${floor}/${cue.id}: подсказка без текста`);
      assert.ok(cue.routeGroup, `${floor}/${cue.id}: развилка без группы решения`);
    }
  }
});
