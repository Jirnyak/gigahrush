import test from 'node:test';
import assert from 'node:assert/strict';

import { ArmorType, DamageType, Faction, Occupation, RoomType } from '../src/core/types';
import { ITEMS } from '../src/data/items';
import { ALIFE_MAX_LEVEL } from '../src/data/alife_generation';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { occupationProfile, occupationWorkRoomTypeWeight } from '../src/data/occupation_profiles';
import { pickNpcArmor } from '../src/systems/procedural_loot';

/* Специализация не доезжала до мира. Восемь ступеней брони были отгружены, ОЗК
 * держал БИО 70, ТОК-200 — ОГОНЬ 70, среда научилась бить NPC настоящими
 * типами урона, — а на Гармонической бане, где пар выжигает работников, костюм
 * огневых работ носил ОДИН человек из 521, и вся броня населения сводилась к
 * лёгкой (БИО 5).
 *
 * Причин было две, и обе в адресации, а не в лестнице:
 *   1. `pickNpcArmor` спрашивал «какую броню» у ФРАКЦИИ (её `tagWeights`), а у
 *      занятия — только «надеть ли вообще». Внутри пула поэтому решал общий
 *      вес спавна: 50 у лёгкой против 6 у ОЗК и 4 у ТОК-200.
 *   2. Четыре цеховые специальности (слесарь, электрик, токарь, механик) не
 *      объявили `riskTolerance` вовсе, а молчание анкеты читается как ноль. На
 *      бане это 438 человек из 667, которые не носили ничего в принципе.
 *
 * Здесь заперты обе половины замысла и обе стороны механизма адресации:
 * комнаты вещи (`spawnRooms`) против рабочих комнат занятия
 * (`workRoomWeights`). */

const STEAM_FLOOR = 'harmonic_bathhouse';
const CONTROL_FLOOR = 'living';

function floorDanger(id: string): number {
  const route = DESIGN_FLOOR_ROUTES.find(r => r.id === id);
  assert.ok(route, `нет маршрутного этажа ${id}`);
  return route.danger;
}

/** Специализация — та, что держит свою ось много выше общей одежды. */
const SPECIALIST_MIN_RESIST = 35;
function resistOf(defId: string, axis: DamageType): number {
  return ITEMS[defId]?.resistances?.[axis] ?? 0;
}

/** Доля защиты по оси среди тех, кто вообще оделся: полный перебор бросков. */
function suitShare(danger: number, occupation: Occupation, axis: DamageType, faction = Faction.CITIZEN): number {
  let worn = 0;
  let suited = 0;
  const steps = 60;
  for (let level = 1; level <= ALIFE_MAX_LEVEL; level += 7) {
    for (let w = 0; w < steps; w++) {
      for (let p = 0; p < steps; p++) {
        const def = pickNpcArmor(faction, occupation, level, danger, (w + 0.5) / steps, (p + 0.5) / steps);
        if (!def) continue;
        worn++;
        if (resistOf(def.id, axis) >= SPECIALIST_MIN_RESIST) suited++;
      }
    }
  }
  return worn > 0 ? suited / worn : 0;
}

test('на этаже с паром цеховые работники носят огневую защиту, на жилом — никогда', () => {
  const steam = floorDanger(STEAM_FLOOR);
  const control = floorDanger(CONTROL_FLOOR);

  for (const occupation of [Occupation.LOCKSMITH, Occupation.ELECTRICIAN, Occupation.TURNER, Occupation.MECHANIC]) {
    const label = occupationProfile(occupation)?.label ?? String(occupation);
    assert.ok(
      suitShare(steam, occupation, DamageType.FIRE) > 0,
      `${label} на этаже пара обязан иметь огневую защиту хоть на каком-то броске`,
    );
    assert.equal(
      suitShare(control, occupation, DamageType.FIRE), 0,
      `${label} на жилом этаже не носит костюм огневых работ: полоса этажа его не покупает`,
    );
  }
});

test('химзащита идёт к учёному и врачу, а не к патрулю', () => {
  const danger = floorDanger('slime_nii');
  const scientist = suitShare(danger, Occupation.SCIENTIST, DamageType.BIO);
  const medic = suitShare(danger, Occupation.DOCTOR, DamageType.BIO);
  const patrol = suitShare(danger, Occupation.HUNTER, DamageType.BIO);

  assert.ok(scientist > 0.2, `учёный обязан ходить в химзащите, доля ${scientist}`);
  assert.ok(medic > 0.2, `врач обязан ходить в химзащите, доля ${medic}`);
  assert.ok(patrol < scientist / 4, `патруль химзащиту не носит: ${patrol} против ${scientist}`);
});

test('патруль не теряет боевую броню от адресации по рабочему месту', () => {
  const danger = floorDanger('liquidatorbase');
  let plate = 0;
  const steps = 60;
  for (let w = 0; w < steps; w++) {
    for (let p = 0; p < steps; p++) {
      const def = pickNpcArmor(Faction.LIQUIDATOR, Occupation.HUNTER, ALIFE_MAX_LEVEL, danger, (w + 0.5) / steps, (p + 0.5) / steps);
      if (def?.armorType === ArmorType.PLATE) plate++;
    }
  }
  assert.ok(plate > 0, 'гарнизонный охотник обязан сохранить плиту');
});

/* ── Сам механизм адресации ────────────────────────────────────────── */

test('комнаты брони и рабочие комнаты занятия сходятся там, где положено', () => {
  // СИЗ живёт на рабочем месте: цех у огневого комплекта, медблок у химзащиты.
  const fireRooms = ITEMS.armor_tok200.spawnRooms;
  const chemRooms = ITEMS.armor_ozk.spawnRooms;
  assert.ok(fireRooms.includes(RoomType.PRODUCTION), 'ТОК-200 обязан водиться в цехе');
  assert.ok(chemRooms.includes(RoomType.MEDICAL), 'ОЗК обязан водиться в медблоке');

  for (const occupation of [Occupation.LOCKSMITH, Occupation.ELECTRICIAN, Occupation.TURNER, Occupation.MECHANIC]) {
    const label = occupationProfile(occupation)?.label ?? String(occupation);
    assert.ok(
      fireRooms.some(room => occupationWorkRoomTypeWeight(occupation, room) > 0),
      `${label} обязан работать там, где водится ТОК-200`,
    );
    // Анкета обязана отвечать про риск: молчание читается как «не одевается».
    assert.ok(
      (occupationProfile(occupation)?.riskTolerance ?? 0) > 0,
      `${label} без riskTolerance не наденет вообще ничего`,
    );
  }
  for (const occupation of [Occupation.SCIENTIST, Occupation.DOCTOR]) {
    assert.ok(chemRooms.some(room => occupationWorkRoomTypeWeight(occupation, room) > 0));
  }

  // Боевая одежда цех не занимает: иначе её вес спавна забирает его у СИЗ.
  for (const defId of ['armor_light', 'armor_medium', 'armor_heavy', 'armor_liquidator']) {
    assert.ok(
      !ITEMS[defId].spawnRooms.includes(RoomType.PRODUCTION),
      `${defId} числится в цехе и отбирает его у комплекта огневых работ`,
    );
  }
});
