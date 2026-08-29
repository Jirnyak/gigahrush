import { ArmorType, Faction, type ItemDef, ItemType, type Item, MonsterKind, type Occupation } from '../core/types';
import { getMonsterEcology } from '../data/monster_ecology';
import { ITEMS, itemEquipSlot, itemDefHasTag, spawnCount } from '../data/items';
import { occupationProfile, occupationWorkRoomTypeWeight } from '../data/occupation_profiles';
import { ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER } from '../data/economics';
import { ALIFE_MAX_LEVEL } from '../data/alife_generation';
import { WEAPON_STATS } from '../data/catalog';
import { shuffleWith } from '../core/rand';

export interface LootProfile {
  weaponMult?: number;
  ammoMult?: number;
  toolMult?: number;
  medicineMult?: number;
  foodMult?: number;
  drinkMult?: number;
  miscMult?: number;
  tagWeights?: Record<string, number>;
}

export const FACTION_LOOT_PROFILES: Record<Faction, LootProfile> = {
  [Faction.LIQUIDATOR]: { weaponMult: 3, ammoMult: 4, toolMult: 2, tagWeights: { 'liquidator': 5, 'firearm': 4, 'military': 3 } },
  /* `psi_clot` объявлен весом 1: это не предпочтение, а ДОПУСК — см.
   * `LOOT_LICENSE_TAGS`. Множитель у культистов уже несёт общий тег `psi`,
   * второй поверх него дал бы им ×25 и перекосил бы прилавок культа. */
  [Faction.CULTIST]: { weaponMult: 1, medicineMult: 2, tagWeights: { 'psi': 5, 'psi_clot': 1, 'psi_restore': 4, 'cult': 3 } },
  /* `psi_clot` весом 1 — тот же ДОПУСК, что у культистов, и вчетверо ниже их
   * веса намеренно. Пси-инструменты подписаны НИИ прямо в тексте («Полевой
   * ПСИ-инструмент НИИ», «Точный лабораторный импульс»), а претендовать на них
   * не мог никто: слова `psi` не было ни в одной из 23 анкет занятий. Институт,
   * который их делает, вправе их иметь. Но у культистов пси — вера и оружие
   * (общий тег `psi` весом 5 сверху), у НИИ — инструмент. */
  [Faction.SCIENTIST]: { toolMult: 3, medicineMult: 3, tagWeights: { 'science': 5, 'energy': 4, 'nii': 3, 'psi_clot': 1 } },
  [Faction.WILD]: { weaponMult: 2, tagWeights: { 'melee': 4, 'homemade': 3, 'pipe': 5 } },
  [Faction.CITIZEN]: { foodMult: 3, drinkMult: 3, miscMult: 2, tagWeights: { 'resident_good': 5, 'trash': 3 } },
  [Faction.PLAYER]: {},
};

/* Лестница ценовых полос экономики, по одной ступени на класс опасности этажа:
 * 90 / 450 / 4 000 / 45 000 / 250 000 (`ECONOMY_MONEY_BANDS`, `economics.md` §5).
 * Своих чисел здесь нет и быть не должно — перепишут полосы, поедет и снаряжение. */
const GEAR_CAP_LADDER: readonly number[] = ([1, 2, 3, 4, 5] as const)
  .map(danger => ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[danger]);

export function calculateMaxLootValue(level: number, danger: number, faction: Faction): number {
  /* Потолок снаряжения — это ступень на лестнице полос, и стоят на ней В ДВА
   * ШАГА: глубина даёт целую ступень, ранг — дробную.
   *
   * Новобранец этажа опасности d стоит на полосе ЭТАЖОМ НИЖЕ (d-1), ветеран
   * дотягивается до полосы своего этажа. Между ступенями интерполяция
   * геометрическая, потому что сама лестница полос геометрическая (×5, ×9, ×11,
   * ×5.6). Так ветеран-ликвидатор на глубине несёт настоящее оружие, а
   * уборщица жилого этажа (d=1, ранг 1) остаётся на полосе E0 — ножи и трубы.
   *
   * Ранг нормируется на `ALIFE_MAX_LEVEL`: это и есть верх лестницы уровней
   * обычного населения, отдельного числа для «ветерана» не заводим.
   *
   * До 2026-08-27 здесь стоял пол `Math.max(1000, …)`, который перебивал
   * собственную кривую до 49-го уровня: потолок был константой 1000 на любой
   * глубине и любом ранге, и вся оружейная лестница выше ~2 000 ₽ была для NPC
   * невидима, а носимая броня схлопнулась в 100 % лёгкой. */
  const rank = Math.max(0, Math.min(1, (level - 1) / (ALIFE_MAX_LEVEL - 1)));
  const top = GEAR_CAP_LADDER.length - 1;
  const step = Math.max(0, Math.min(top, danger - 2 + rank));
  const lower = Math.floor(step);
  const upper = Math.min(top, lower + 1);
  let base = GEAR_CAP_LADDER[lower] * Math.pow(GEAR_CAP_LADDER[upper] / GEAR_CAP_LADDER[lower], step - lower);
  if (faction === Faction.LIQUIDATOR) base *= 1.8;
  if (faction === Faction.SCIENTIST) base *= 1.4;
  return Math.floor(base);
}

const ITEMS_ARRAY = Object.freeze(Object.values(ITEMS));

/* Теги-лицензии: предмет с таким тегом достаётся только профилю, который тег
 * ОБЪЯВИЛ. Обычный тег в анкете — предпочтение («берёт чаще прочих»), лицензия —
 * допуск («ему это свойственно вообще»). Закон тот же, по которому фракция без
 * `weaponMult` не носит брони (`npcArmorChance`): молчание анкеты читается как
 * ноль, а не как «как у всех».
 *
 * Лицензия пока одна — сгустки. Сгусток не «дорогой ствол», а способность:
 * заряд тратится из ПСИ носителя, и владеет им тот, кого этому учит культ
 * (`TERRITORY_OWNER_DEFS`: `psi_strike` в оружии культистов), либо тот, кто эти
 * приборы делает: половина сгустков подписана НИИ прямо в названии («Полевой
 * ПСИ-инструмент НИИ», «Точный лабораторный импульс»).
 * Без допуска рядовой инженер гарнизона выкатывался с ПСИ-лучом за 45 000 ₽:
 * вес спавна у сгустков (0.15…1) на порядок выше ликвидаторского железа
 * (0.02…0.28), и как только ценовой потолок глубины перестал быть заперт на
 * 1000, сгустки поехали к каждому четырнадцатому.
 *
 * Гасится именно `psi_clot`, а не общий `psi`: под общим ходят улики и трофеи
 * (осколок сирены за 90 ₽ — «НИИ и ликвидаторы берут как улику»), и они к
 * допуску отношения не имеют. */
const LOOT_LICENSE_TAGS = ['psi_clot'] as const;

export function buildLootPool(profile: LootProfile, maxAllowedValue: number): { item: ItemDef, weight: number }[] {
  const pool: { item: ItemDef, weight: number }[] = [];
  const tagEntries = profile.tagWeights ? Object.entries(profile.tagWeights) : undefined;

  for (const item of ITEMS_ARRAY) {
    let baseWeight = item.spawnW || 0;
    if (baseWeight <= 0) continue;

    if (LOOT_LICENSE_TAGS.some(tag => itemDefHasTag(item, tag) && !((profile.tagWeights?.[tag] ?? 0) > 0))) continue;

    // Soft exponential decay for items above tier — no hard gates
    if (item.value > maxAllowedValue) {
      baseWeight *= Math.exp(-(item.value / maxAllowedValue - 1) * 3);
    }

    if (profile.weaponMult && item.type === ItemType.WEAPON) baseWeight *= profile.weaponMult;
    if (profile.ammoMult && item.type === ItemType.AMMO) baseWeight *= profile.ammoMult;
    if (profile.toolMult && item.type === ItemType.TOOL) baseWeight *= profile.toolMult;
    if (profile.medicineMult && item.type === ItemType.MEDICINE) baseWeight *= profile.medicineMult;
    if (profile.foodMult && item.type === ItemType.FOOD) baseWeight *= profile.foodMult;
    if (profile.drinkMult && item.type === ItemType.DRINK) baseWeight *= profile.drinkMult;
    if (profile.miscMult && item.type === ItemType.MISC) baseWeight *= profile.miscMult;

    if (tagEntries) {
      for (const [tag, weight] of tagEntries) {
        if (itemDefHasTag(item, tag)) {
          baseWeight *= weight;
        }
      }
    }

    if (baseWeight > 0) {
      pool.push({ item, weight: baseWeight });
    }
  }
  return pool;
}

export function pickLootFromPool(pool: { item: ItemDef, weight: number }[], roll: number): ItemDef | undefined {
  if (pool.length === 0) return undefined;
  let totalWeight = 0;
  for (const p of pool) totalWeight += p.weight;
  
  let target = roll * totalWeight;
  let selected = pool[pool.length - 1].item;

  for (const p of pool) {
    target -= p.weight;
    if (target <= 0) {
      selected = p.item;
      break;
    }
  }
  return selected;
}

/* ── Носимая броня ────────────────────────────────────────────────
 *
 * Броня — такой же выдаваемый слот, как оружие, и берётся тем же механизмом:
 * `buildLootPool` под тем же ценовым потолком `calculateMaxLootValue`. Ничего
 * своего она не заводит — экономическая полоса уже гасит дорогие пластины
 * (4500 у брони ликвидатора против потолка 1800), а редкость несёт `spawnW`.
 *
 * Кому её выдают, решают два уже существующих числа, и РАЗДЕЛЬНО — по тому же
 * `armorType`, который броня и так объявляет, а таблица резистов уже читает:
 *
 *   ПЛИТА (`ArmorType.PLATE`: средняя, тяжёлая, ликвидаторская, СЗК-9) —
 *     снаряжение боевое, и гейт у неё militarization × `riskTolerance`.
 *     militarization — `weaponMult` строки фракции в этой же таблице,
 *     нормированный на самую вооружённую фракцию таблицы. Своего числа тут нет:
 *     перепишут таблицу — доля поедет за ней. Фракция без `weaponMult`
 *     (гражданские, учёные) объявила, что оружие ей не свойственно, — плиты
 *     она не носит тоже.
 *
 *   ТКАНЬ (`ArmorType.CLOTH`: лёгкая, ОЗК, ТОК-200, ряса) — одежда рабочая и
 *     защитная, а не штурмовая. Гейт у неё ОДИН `riskTolerance`, без
 *     militarization: химкомплект надевают не потому, что ты военный, а потому
 *     что твоя РАБОТА опасна. Иначе учёный НИИ слизи (risk 0.38, `weaponMult`
 *     нет вовсе) не мог одеться ни при каком наполнении лестницы — множитель
 *     ноль перебивал готовность идти в опасность.
 *
 * `riskTolerance` в обоих случаях — анкета занятия, и отсутствие поля читается
 * как ноль: «эта работа не ходит в опасность». Повар и домохозяйка не носят
 * НИЧЕГО ни в какой фракции; охотник гарнизона (0.78) носит почти всегда.
 *
 * Порог тканевый всегда не ниже плитного (militarization ≤ 1), поэтому один
 * бросок `rollWear` раскладывает три исхода без второго броска и без своего
 * числа: ниже плитного — доступно всё, между порогами — только ткань, выше
 * тканевого — ничего. Броня без `armorType` считается плитой: молчание анкеты
 * читается по строгой ветке.
 */
const MAX_FACTION_WEAPON_MULT = Math.max(
  ...Object.values(FACTION_LOOT_PROFILES).map(p => p.weaponMult ?? 0),
);

/* Цена самой дешёвой брони, которая вообще может выпасть (`spawnW > 0`). Своего
 * числа здесь нет: перекрасят лестницу цен в `items.ts` — поедет и это.
 * Зачем нужно — см. `AFFORDABILITY` в `pickNpcArmor`. */
const CHEAPEST_ARMOR_VALUE = Math.min(
  ...ITEMS_ARRAY.filter(def => (def.spawnW ?? 0) > 0 && itemEquipSlot(def) === 'armor').map(def => def.value),
);

/* МЕСТО И ЗАНЯТИЕ. Какую броню надеть, знает работа, а не фракция: фракция
 * говорит, чем тебя вооружат, работа — от чего тебя должно защищать.
 *
 * До 2026-08-27 пул брони строился ровно на `tagWeights` ФРАКЦИИ, а занятие
 * решало только «надеть ли вообще». Внутри пула поэтому побеждал общий вес:
 * `armor_light` (`spawnW` 50) против ОЗК (6) и ТОК-200 (4) выигрывал в 8–12
 * раз у кого угодно, и на Гармонической бане, где пар жжёт работников, костюм
 * огневых работ носил один человек из 521.
 *
 * Адрес берётся из двух УЖЕ объявленных сторон и своих чисел не заводит:
 * у вещи `spawnRooms` — «где она водится», у занятия `workRoomWeights` —
 * «сколько моей работы происходит в такой комнате». Совпало — вес самого
 * занятия, не совпало — единица, ровно как несовпавший тег в `buildLootPool`.
 * Слесарь работает в цехе (35) и на складе (12), и ТОК-200 водится ровно там;
 * учёный — в медблоке и лаборатории (26), где лежит ОЗК; охотник ходит по
 * коридорам, где не лежит ни тот ни другой, и остаётся в лёгкой.
 *
 * Правило одно на всю броню, включая плиты: у тяжёлой и ликвидаторской свой
 * цех в `spawnRooms`, и патрульный к ним равнодушен так же, как к химзащите. */
function armorWorkRoomAffinity(item: ItemDef, occupation: Occupation | undefined): number {
  let weight = 0;
  for (const room of item.spawnRooms) weight += occupationWorkRoomTypeWeight(occupation, room);
  return weight > 0 ? weight : 1;
}

export function npcArmorChance(
  faction: Faction,
  occupation: Occupation | undefined,
  armorType: ArmorType = ArmorType.PLATE,
): number {
  const risk = occupationProfile(occupation)?.riskTolerance ?? 0;
  if (armorType === ArmorType.CLOTH) return risk;
  const militarization = (FACTION_LOOT_PROFILES[faction]?.weaponMult ?? 0) / MAX_FACTION_WEAPON_MULT;
  return militarization * risk;
}

export function pickNpcArmor(
  faction: Faction,
  occupation: Occupation | undefined,
  level: number,
  danger: number,
  rollWear: number,
  rollPick: number,
): ItemDef | undefined {
  /* ДОСТУПНОСТЬ. Ценовой потолок глубины гасил дорогую броню только ВНУТРИ
   * пула — а `pickLootFromPool` нормируется по остатку, и из пула, где всё
   * задавлено одинаково, всё равно кто-то выбирается. Значит потолок решал
   * ТОЛЬКО «какая броня», и никогда — «броня вообще». Для гражданина жилого
   * этажа потолок 90 ₽ при дешевейшей броне 12 000 ₽ (0.7 % цены) не гасил
   * ничего: циркач ходил в бронежилете в 41 % случаев, уборщица в 32 %,
   * ребёнок в 18 %.
   *
   * Отношение «потолок / цена дешевейшей брони» и есть недостающий ответ:
   * ниже единицы человеку не по карману даже самое дешёвое, и склонность
   * надеть падает пропорционально тому, насколько не по карману. Своих чисел
   * нет — оба уже существуют. Один множитель на обе ветки: порядок порогов
   * (ткань ≥ плита) от общего множителя не меняется, и три исхода
   * по-прежнему раскладывает один бросок. */
  const maxValue = calculateMaxLootValue(level, danger, faction);
  const affordability = Math.min(1, maxValue / CHEAPEST_ARMOR_VALUE);
  if (rollWear >= npcArmorChance(faction, occupation, ArmorType.CLOTH) * affordability) return undefined;
  const platesAllowed = rollWear < npcArmorChance(faction, occupation, ArmorType.PLATE) * affordability;
  const profile = FACTION_LOOT_PROFILES[faction] || {};
  // Множители по типу предмета сняты: вся броня — MISC, они одинаковы для всех
  // и в отборе всё равно сокращаются. Веса тегов оставлены: появится у брони
  // тег — она сама встанет в строй фракции без правки этого места.
  const pool = buildLootPool({ tagWeights: { ...profile.tagWeights } }, maxValue)
    .filter(p => itemEquipSlot(p.item) === 'armor'
      && (platesAllowed || p.item.armorType === ArmorType.CLOTH));
  for (const p of pool) p.weight *= armorWorkRoomAffinity(p.item, occupation);
  return pickLootFromPool(pool, rollPick);
}

export interface NpcArmorRolls {
  occupation?: Occupation;
  rollWear: number;
  rollPick: number;
}

/**
 * Сколько магазинов носит вооружённый человек — от одного до этого числа.
 *
 * Единица измерения боезапаса в проекте одна и она не абсолютная: магазин
 * СВОЕГО ствола. Ни одна существующая константа этого не выражает, поэтому
 * число заведено здесь, а не выведено. Три — потому что один магазин (как было)
 * означает «расстрелялся в первой же стычке и больше не боец», а стрелку нужен
 * запас на дорогу до ящика: рейс за патронами в игре есть
 * (`npc_work.ts`, `npcStoreErrandRoomId` — «за патронами туда, где они лежат»),
 * и он должен успевать сработать.
 */
const NPC_CARRIED_MAGAZINES = 3;

export function generateNpcLoadout(
  faction: Faction,
  level: number,
  danger: number,
  rollWeapon: number,
  rollPockets: number[],
  armorRolls?: NpcArmorRolls,
): { weapon?: string; tool?: string; armorDefId?: string; inventory?: Item[] } {
  const profile = FACTION_LOOT_PROFILES[faction] || {};
  const maxVal = calculateMaxLootValue(level, danger, faction);
  
  // 1. Pick weapon
  const weaponProfile = { ...profile, tagWeights: { ...profile.tagWeights } };
  weaponProfile.foodMult = 0; weaponProfile.drinkMult = 0; weaponProfile.medicineMult = 0; weaponProfile.miscMult = 0; weaponProfile.ammoMult = 0; weaponProfile.toolMult = 0;
  weaponProfile.weaponMult = (weaponProfile.weaponMult || 1) * 10; 
  
  const weaponPool = buildLootPool(weaponProfile, maxVal).filter(p => p.item.type === ItemType.WEAPON || itemEquipSlot(p.item) === 'tool');
  let weaponDef = pickLootFromPool(weaponPool, rollWeapon);

  let weaponId: string | undefined;
  let toolId: string | undefined;
  const inventory: Item[] = [];

  // Explicitly give cultists a PSI clot, regardless of maxVal limits
  // But we use rollWeapon directly to simulate the pick.
  if (faction === Faction.CULTIST && rollWeapon > 0.02) {
    const clotId = rollWeapon > 0.85 ? 'psi_storm' : 'psi_strike';
    weaponDef = ITEMS[clotId];
  }

  if (weaponDef) {
    if (itemEquipSlot(weaponDef) === 'tool') toolId = weaponDef.id;
    else weaponId = weaponDef.id;
    
    inventory.push({ defId: weaponDef.id, count: 1 });
    
    /* Боезапас меряется МАГАЗИНАМИ своего же ствола, а не абсолютным числом
     * патронов: у дробовика магазин на шесть, у автомата на тридцать, и «десять
     * штук» значило для них противоположное. Отдельная ветка под дробовик была
     * ровно этим — заплатой на месте недостающей единицы измерения, — и она
     * снята.
     *
     * Замерено до правки на всём маршруте: у стрелка медиана ОДИН магазин
     * (на министерстве — один патрон), а в мире 0.5–2.7 патрона на стрелка.
     * Стрелок отстреливался досуха 442 раза за 600 секунд на базе ликвидаторов,
     * и пополнял его единственный настоящий источник — досыпка из воздуха. */
    const wStats = WEAPON_STATS[weaponDef.id];
    if (wStats?.ammoType && wStats.ammoType !== weaponDef.id) {
      const magSize = wStats.magazineSize ?? 1;
      /* Пол в десять патронов сохранён из прежней формулы и не случаен: у
       * винтовки магазин на пять, и «три магазина» дали бы ей пятнадцать
       * патронов вместо прежних двадцати восьми — щедрость обернулась бы
       * урезанием. Полоса носимого задаётся не размером магазина, а тем,
       * сколько человек успевает истратить. */
      const perMag = Math.max(10, magSize);
      const ammoCount = magSize === Infinity ? 0
        : perMag * NPC_CARRIED_MAGAZINES + Math.floor(rollWeapon * perMag);
      if (ammoCount > 0) inventory.push({ defId: wStats.ammoType, count: ammoCount });
    }
  }

  // 2. Pick armor — тем же способом, что и оружие, и в тот же карман: броня
  // обязана выпасть с трупа и лечь на прилавок наравне со стволом.
  let armorDefId: string | undefined;
  if (armorRolls) {
    const armorDef = pickNpcArmor(faction, armorRolls.occupation, level, danger, armorRolls.rollWear, armorRolls.rollPick);
    if (armorDef) {
      armorDefId = armorDef.id;
      inventory.push({ defId: armorDef.id, count: 1 });
    }
  }

  // 3. Pick pockets. Броня из карманов исключена: она выдаётся слотом выше и
  // только тем, кому положена. Пока её никто не носил, лёгкая броня (MISC,
  // spawnW 50) была для карманов обычным хламом — и на жилом этаже её случайно
  // таскала половина населения. Одетые домохозяйки — это карман, а не замысел.
  const pocketProfile = { ...profile };
  pocketProfile.weaponMult = 0;
  const pocketPool = buildLootPool(pocketProfile, Math.max(5, maxVal * 0.5))
    .filter(p => itemEquipSlot(p.item) !== 'armor');

  for (const r of rollPockets) {
    const item = pickLootFromPool(pocketPool, r);
    if (item) {
      inventory.push({ defId: item.id, count: 1 });
    }
  }

  return { weapon: weaponId, tool: toolId, armorDefId, inventory: inventory.length > 0 ? inventory : undefined };
}

export function generateContainerLoot(tags: readonly string[], proceduralValueCap: number | undefined, level: number, rollItems: number[]): Item[] {
  const profile: LootProfile = { tagWeights: {} };
  
  if (tags.includes('food')) { profile.foodMult = 3; profile.drinkMult = 2; }
  if (tags.includes('medical')) { profile.medicineMult = 4; }
  if (tags.includes('weapon')) { profile.weaponMult = 3; profile.ammoMult = 3; }
  if (tags.includes('ammo')) { profile.ammoMult = 4; }
  if (tags.includes('tools')) { profile.toolMult = 4; }
  if (tags.includes('paper') || tags.includes('valuable')) { profile.miscMult = 3; }
  
  for (const tag of tags) {
    if (!profile.tagWeights) profile.tagWeights = {};
    profile.tagWeights[tag] = 5;
  }

  const maxVal = proceduralValueCap ?? (10 + level * 10);
  const pool = buildLootPool(profile, maxVal);
  
  const inventory: Item[] = [];
  for (const r of rollItems) {
    const itemDef = pickLootFromPool(pool, r);
    if (itemDef) {
      /* Ящик отдаёт СТОПКУ, а не штуку. `spawnCount` — канон проекта ровно на
       * этот вопрос («дешёвое — больше, дорогое — меньше, но не выше правил
       * стопки»), и он здесь просто не звался: ящик с боеприпасом содержал один
       * патрон, а торговец продавал один патрон. Своего правила не завожу. */
      inventory.push({ defId: itemDef.id, count: spawnCount(itemDef) });
    }
  }
  return inventory;
}

export function generateMerchantStock(faction: Faction | undefined, level: number, danger: number, rollItems: number[]): Item[] {
  const baseFaction = faction ?? Faction.CITIZEN;
  const profile = FACTION_LOOT_PROFILES[baseFaction] || {};
  const maxVal = calculateMaxLootValue(level, danger, baseFaction) * 3; // Merchants sell higher-tier items
  
  const pool = buildLootPool(profile, maxVal);
  
  const inventory: Item[] = [];
  for (const r of rollItems) {
    const itemDef = pickLootFromPool(pool, r);
    if (itemDef) {
      // Прилавок тем же каноном: торговать поштучно патронами бессмысленно.
      inventory.push({ defId: itemDef.id, count: spawnCount(itemDef) });
    }
  }
  return inventory;
}


export interface GeneratedLoot {
    itemDefId: string;
    amount: number;
}

export function generateMonsterLoot(kind: MonsterKind, rand: () => number): GeneratedLoot[] {
    const ecology = getMonsterEcology(kind);
    if (!ecology || !ecology.lootTable) return [];

    const results = [];
    for (const entry of ecology.lootTable) {
        if (rand() <= entry.chance) {
            const min = entry.minCount ?? 1;
            const max = entry.maxCount ?? 1;
            const amount = Math.floor(rand() * (max - min + 1)) + min;
            if (amount > 0) {
                results.push({ itemDefId: entry.itemDefId, amount });
            }
        }
    }

    // Hard cap at 3 items to avoid clutter
    shuffleWith(rand, results);
    return results.slice(0, 3);
}
