import test from 'node:test';
import assert from 'node:assert/strict';

import { ArmorType, Faction, ItemType, Occupation } from '../src/core/types';
import { ITEMS, itemDefHasTag } from '../src/data/items';
import { ALIFE_MAX_LEVEL } from '../src/data/alife_generation';
import { FACTION_LOOT_PROFILES, generateNpcLoadout, npcArmorChance, pickNpcArmor } from '../src/systems/procedural_loot';

/* ── Допуск, а не предпочтение ────────────────────────────────────
 *
 * Одно правило на два слота: чего анкета фракции или занятия НЕ объявила, того
 * человек не получает вовсе. Тег `psi_clot` — допуск к сгусткам, `armorType` —
 * развилка «боевое / рабочее». Оба замка заперты на живых числах таблиц, своих
 * порогов тут нет.
 */

const PSI_CLOTS = Object.values(ITEMS).filter(def => itemDefHasTag(def, 'psi_clot'));

/* Кто объявил допуск — читается из самой таблицы, а не переписывается сюда
 * списком: добавят строку — замок сам переедет на новую границу. Игрок в
 * таблице есть, но снаряжение ему выдаёт не этот генератор. */
const PLAYABLE_FACTIONS = [Faction.CITIZEN, Faction.LIQUIDATOR, Faction.CULTIST, Faction.SCIENTIST, Faction.WILD] as const;
const declaresPsiClot = (faction: Faction): boolean =>
  (FACTION_LOOT_PROFILES[faction]?.tagWeights?.['psi_clot'] ?? 0) > 0;
const LICENSED = PLAYABLE_FACTIONS.filter(declaresPsiClot);
const UNLICENSED = PLAYABLE_FACTIONS.filter(f => !declaresPsiClot(f));

function carriedPsi(faction: Faction, level: number, danger: number, roll: number): string[] {
  const loadout = generateNpcLoadout(faction, level, danger, roll, [roll, 1 - roll]);
  const carried = new Set<string>();
  for (const id of [loadout.weapon, loadout.tool]) {
    if (id && itemDefHasTag(ITEMS[id], 'psi_clot')) carried.add(id);
  }
  for (const slot of loadout.inventory ?? []) {
    if (itemDefHasTag(ITEMS[slot.defId], 'psi_clot')) carried.add(slot.defId);
  }
  return [...carried];
}

test('сгустки объявлены оружием, а не декорацией — иначе замок ниже пуст', () => {
  assert.equal(PSI_CLOTS.length > 0, true);
  assert.equal(PSI_CLOTS.every(def => def.type === ItemType.WEAPON), true);
  // Вес спавна у сгустков и правда выше ликвидаторского железа — ровно та
  // причина, по которой без допуска они уезжали к рядовым.
  assert.equal(PSI_CLOTS.some(def => (def.spawnW ?? 0) >= 0.5), true);
});

test('сгусток достаётся только объявившим допуск — культу и НИИ', () => {
  // Допуск объявляют ровно двое, и обе стороны границы обязаны быть непусты:
  // иначе замок ниже проверяет пустое множество.
  assert.deepEqual([...LICENSED].sort(), [Faction.CULTIST, Faction.SCIENTIST].sort());
  assert.equal(UNLICENSED.length > 0, true);

  // Потолок берём заведомо высокий: глубина 5 и максимальный ранг пропускают
  // даже иглу за 70 000 ₽, так что молчание пула — это допуск, а не цена.
  for (const faction of UNLICENSED) {
    for (let i = 0; i < 200; i++) {
      const roll = (i + 0.5) / 200;
      assert.deepEqual(
        carriedPsi(faction, ALIFE_MAX_LEVEL, 5, roll),
        [],
        `фракция ${faction} не объявляла тег psi_clot, сгусток ей не положен (бросок ${roll})`,
      );
    }
  }

  for (const faction of LICENSED) {
    let withPsi = 0;
    for (let i = 0; i < 200; i++) {
      if (carriedPsi(faction, ALIFE_MAX_LEVEL, 5, (i + 0.5) / 200).length > 0) withPsi++;
    }
    assert.equal(withPsi > 0, true, `фракция ${faction} объявила допуск, но сгустка не носит ни разу`);
  }

  // Культисту сгусток положен почти всегда: у него сверх допуска общий тег `psi`
  // и прямая выдача в генераторе.
  let cultistWithPsi = 0;
  for (let i = 0; i < 200; i++) {
    if (carriedPsi(Faction.CULTIST, ALIFE_MAX_LEVEL, 5, (i + 0.5) / 200).length > 0) cultistWithPsi++;
  }
  assert.equal(cultistWithPsi > 100, true, `культист обязан носить сгусток, носит ${cultistWithPsi}/200`);
});

test('у НИИ пси — инструмент, у культа — вера: вес НИИ строго ниже', () => {
  // Оба объявили допуск, но не наравне. Иначе институт, который эти приборы
  // делает, вооружён как культ, который на них молится.
  const cultist = FACTION_LOOT_PROFILES[Faction.CULTIST].tagWeights!;
  const scientist = FACTION_LOOT_PROFILES[Faction.SCIENTIST].tagWeights!;
  assert.equal(scientist['psi_clot']! < cultist['psi_clot']! * (cultist['psi'] ?? 1), true);
  // Общего множителя `psi` у НИИ нет вовсе: допуск не превращается в склонность.
  assert.equal(scientist['psi'], undefined);
});

test('прилавок держит тот же допуск: сгустки продают только объявившие', () => {
  const rolls: number[] = [];
  for (let i = 0; i < 200; i++) rolls.push((i + 0.5) / 200);
  const psiOnCounter = (faction: Faction): number => generateNpcLoadout(faction, ALIFE_MAX_LEVEL, 5, 0.5, rolls)
    .inventory?.filter(slot => itemDefHasTag(ITEMS[slot.defId], 'psi_clot')).length ?? 0;
  for (const faction of UNLICENSED) assert.equal(psiOnCounter(faction), 0);
  for (const faction of LICENSED) assert.equal(psiOnCounter(faction) > 0, true, `фракция ${faction} допуск объявила, но не торгует`);
});

/* ── Броня: плита боевая, ткань рабочая ───────────────────────────── */

const armorTypeOf = (id: string | undefined): ArmorType | undefined => (id ? ITEMS[id]?.armorType : undefined);

test('гейт брони разведён по armorType: плита боевая, ткань рабочая', () => {
  // Учёный: `weaponMult` у фракции нет вовсе, militarization ноль — плиты ему
  // не положено. Но риск работы (0.38) есть, и ткань он носит.
  assert.equal(npcArmorChance(Faction.SCIENTIST, Occupation.SCIENTIST, ArmorType.PLATE), 0);
  assert.equal(npcArmorChance(Faction.SCIENTIST, Occupation.SCIENTIST, ArmorType.CLOTH) > 0, true);
  // Гарнизон не раздет: у самой вооружённой фракции militarization = 1, и оба
  // порога совпадают — плита ему доступна ровно как прежде.
  assert.equal(
    npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER, ArmorType.PLATE),
    npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER, ArmorType.CLOTH),
  );
  // Работа без риска — не носит ничего ни в какой фракции и по любой ветке.
  for (const type of [ArmorType.PLATE, ArmorType.CLOTH]) {
    assert.equal(npcArmorChance(Faction.LIQUIDATOR, Occupation.COOK, type), 0);
    assert.equal(npcArmorChance(Faction.CITIZEN, Occupation.HOUSEWIFE, type), 0);
    assert.equal(npcArmorChance(Faction.LIQUIDATOR, undefined, type), 0);
  }
});

test('учёный одевается в химзащиту и никогда в плиту', () => {
  const worn: string[] = [];
  for (let i = 0; i < 200; i++) {
    const picked = pickNpcArmor(Faction.SCIENTIST, Occupation.SCIENTIST, ALIFE_MAX_LEVEL, 4, 0, (i + 0.5) / 200);
    if (picked) worn.push(picked.id);
  }
  assert.equal(worn.length > 0, true, 'учёный обязан одеться: риск работы у него объявлен');
  for (const id of worn) {
    assert.equal(armorTypeOf(id), ArmorType.CLOTH, `учёному досталась боевая ${id}`);
  }

  // Повар без риска не одевается даже при нулевом броске.
  assert.equal(pickNpcArmor(Faction.SCIENTIST, Occupation.COOK, ALIFE_MAX_LEVEL, 4, 0, 0.5), undefined);
});

test('гарнизон сохраняет плиту, и она ему достаётся не только тканью', () => {
  const worn: string[] = [];
  for (let i = 0; i < 200; i++) {
    const picked = pickNpcArmor(Faction.LIQUIDATOR, Occupation.HUNTER, ALIFE_MAX_LEVEL, 4, 0, (i + 0.5) / 200);
    if (picked) worn.push(picked.id);
  }
  assert.equal(worn.some(id => armorTypeOf(id) === ArmorType.PLATE), true, 'гарнизон обязан сохранить боевую броню');
  assert.equal(worn.some(id => armorTypeOf(id) === ArmorType.CLOTH), true);
});
