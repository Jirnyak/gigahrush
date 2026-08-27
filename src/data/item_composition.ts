import { ArmorType, ItemType, type ItemDef } from '../core/types';
import { PHYS_WEAPON_ROLE_TIERS, type WeaponRoleTier } from './weapons';
import { PSI_WEAPON_ROLE_TIERS } from './psi';
import { ITEMS } from './items';
import {
  CRAFT_MATERIAL_IDS,
  type CraftMaterialId,
  type CraftVector,
  type MutableCraftVector,
  craftMaterialIndex,
  emptyCraftVector,
} from './craft_materials';

const RARE_MATERIALS = ['cybernetics', 'psimatter', 'metamatter'] as const satisfies readonly CraftMaterialId[];
const WEAPON_ROLE_TIERS: Record<string, WeaponRoleTier> = {
  ...PHYS_WEAPON_ROLE_TIERS,
  ...PSI_WEAPON_ROLE_TIERS,
};

/* Ступени ценовой лестницы `totalForItem`, получившие имя, потому что редкий
   бит — ресурс крафта, а не товар, и его редкость обязана быть ценовым фактом.

   RARE_UNIT_VALUE — авторская цена вещи, которую стоит ОДНА единица редкого бита.
   Вещь дешевле неё не содержит редкого вовсе: бумажка, свечка и патрон отдают
   расходники и химию, а не метаматерию. Так закрыта дыра, где ордер Пустоты за
   120 ₽ нёс 34 единицы метаматерии (4 ₽/ед) и был самым дешёвым её источником
   в игре — дешевле обычного металла.

   RARE_GEAR_VALUE — порог дорогой снаряги. Выше него вещь не бывает собрана
   целиком из общедоступного бита: у ствола это прицельная электроника и приводы,
   у ключа — электронная часть замка. Так закрыта обратная дыра, где ленточный
   дробовик за 220 000 ₽ собирался из 128 обычных единиц ценой 847 ₽ — выгода 260×.

   ENDGAME_TOTAL — состав вещи финала. Метаматерия и он неразделимы. */
const RARE_UNIT_VALUE = 400;
const RARE_GEAR_VALUE = 5_000;
const RARE_GEAR_TOTAL = 35;
const ENDGAME_TOTAL = 90;

const AUTHORED_RARE_MATERIAL_ITEMS: Record<string, readonly CraftMaterialId[]> = {
  gauss: ['cybernetics'],
  plasma: ['cybernetics'],
  bfg: ['cybernetics', 'metamatter'],
  gravity_beam_emitter: ['cybernetics', 'metamatter'],
  grn420_gravizhernov: ['cybernetics', 'metamatter'],
  ato41_atomic_flamer: ['cybernetics', 'metamatter'],
  ammo_energy: ['cybernetics'],
  psi_strike: ['psimatter'],
  psi_rupture: ['psimatter'],
  psi_storm: ['psimatter'],
  psi_brainburn: ['psimatter'],
  psi_madness: ['psimatter'],
  psi_control: ['psimatter'],
  psi_shield: ['psimatter'],
  psi_possession: ['psimatter', 'metamatter'],
  psi_phase: ['psimatter', 'metamatter'],
  psi_mark: ['psimatter'],
  psi_recall: ['psimatter'],
  psi_beam: ['psimatter'],
  psi_concrete_splinter: ['psimatter'],
  psi_shadow_lance: ['psimatter'],
  psi_order_seal: ['psimatter'],
  psi_void_needle: ['psimatter', 'metamatter'],
  psi_meat_hook: ['psimatter'],
  psi_siren_pulse: ['psimatter'],
  strange_clot: ['psimatter'],
  psi_dust: ['psimatter'],
  meat_rune: ['psimatter'],
  bottled_voice: ['psimatter'],
  siren_shard: ['psimatter'],
  void_spike: ['psimatter', 'metamatter'],
  idol_chernobog: ['psimatter'],
  holy_water: ['psimatter'],
  istotit_candle: ['psimatter'],
  blue_glow_sample_sealed: ['psimatter'],
  blue_glow_sample_open: ['psimatter'],
  slime_sample_silver: ['psimatter'],
  slime_sample_silver_open: ['psimatter'],
  slime_sample_seroburmaline: ['psimatter'],
  void_archive_warrant: ['metamatter'],
  chernobog_redacted_central_note: ['metamatter'],
};

/* Сколько единиц редкого бита вещь способна оплатить собственной ценой. */
function rareBudget(def: ItemDef): number {
  return Math.floor(def.value / RARE_UNIT_VALUE);
}

/* Какие редкие биты вещь несёт: авторский замысел, если он ей по карману, иначе
   производное правило дорогой снаряги. Функция НЕ зовёт `totalForItem`: тот сам
   спрашивает её про метаматерию. */
function rareMaterialsFor(def: ItemDef): readonly CraftMaterialId[] {
  const budget = rareBudget(def);
  if (budget < 1) return [];
  const authored = AUTHORED_RARE_MATERIAL_ITEMS[def.id];
  if (!authored) return def.value > RARE_GEAR_VALUE ? ['cybernetics'] : [];
  /* Метаматерия и потолок состава в ENDGAME_TOTAL — один и тот же факт: вещь
     финала. Пустотный шип за 1500 ₽ этого не тянет, а был самым дешёвым
     источником метаматерии после ордера Пустоты. */
  return budget >= ENDGAME_TOTAL ? authored : authored.filter(material => material !== 'metamatter');
}

/* Доля редкого в дорогой снаряге растёт со ступенью цены и с ролью ствола:
   точное и скорострельное огнестрельное несёт лишний шаг прицельной электроники,
   огнемёт и подствольник — только приводы. */
function derivedRareWeight(def: ItemDef, total: number): number {
  const role = WEAPON_ROLE_TIERS[def.id];
  const precise = role === 'ammo_burn' || role === 'rifle_precision' || role === 'shotgun_corridor_stop';
  return Math.ceil(total / RARE_GEAR_TOTAL) + (precise ? 1 : 0);
}

const MATERIAL_TAGS: Readonly<Record<CraftMaterialId, readonly string[]>> = {
  mechanics: ['tool', 'repair', 'machine', 'weapon_part', 'breach', 'door_work', 'pump', 'filter', 'seal'],
  electronics: ['electronics', 'battery', 'radio', 'terminal', 'detector', 'lamp', 'circuit', 'wire', 'signal', 'screen'],
  consumables: ['document', 'paper', 'permit', 'coupon', 'receipt', 'form', 'resident_good', 'hygiene', 'bait', 'ration', 'trade'],
  bio: ['bait_meat', 'bait_fungal', 'zhelemish', 'mold', 'fungus', 'slime', 'sample', 'tissue', 'corpse', 'blood_plant', 'meat'],
  chemical: ['medicine', 'reagent', 'decon', 'fuel', 'acid', 'alkali', 'napalm', 'incendiary', 'smoke', 'contaminant', 'cleanup'],
  metal: ['metal', 'weapon', 'ammo', 'rifle', 'shotgun', 'grenade', 'bayonet', 'rail', 'armor', 'serial'],
  cybernetics: ['cybernetics', 'rare_energy', 'net', 'safeguard', 'silicon_net_well'],
  psimatter: ['psi', 'cult', 'istotit', 'siren', 'void'],
  metamatter: ['metamatter', 'void', 'chernobog', 'deletion_beam', 'gravity_aoe'],
};

function cv(
  mechanics = 0,
  electronics = 0,
  consumables = 0,
  bio = 0,
  chemical = 0,
  metal = 0,
  cybernetics = 0,
  psimatter = 0,
  metamatter = 0,
): CraftVector {
  return [mechanics, electronics, consumables, bio, chemical, metal, cybernetics, psimatter, metamatter];
}

function tagsOf(def: ItemDef): readonly string[] {
  return def.tags ?? [];
}

function hasAnyTag(def: ItemDef, tags: readonly string[]): boolean {
  const current = tagsOf(def);
  return tags.some(tag => current.includes(tag));
}

function idHasAny(id: string, parts: readonly string[]): boolean {
  return parts.some(part => id.includes(part));
}

function add(weights: MutableCraftVector, material: CraftMaterialId, amount: number): void {
  weights[craftMaterialIndex(material)] += amount;
}

function totalForItem(def: ItemDef): number {
  const v = def.value;
  let total = v <= 2 ? 1
    : v <= 8 ? 2
      : v <= 20 ? 3
        : v <= 60 ? 5
          : v <= 150 ? 8
            : v <= RARE_UNIT_VALUE ? 11
              : v <= 1_200 ? 16
                : v <= RARE_GEAR_VALUE ? 24
                  : v <= 15_000 ? RARE_GEAR_TOTAL
                    : v <= 50_000 ? 58
                      : v <= 100_000 ? 82
                        : v <= 250_000 ? 128
                          : 180;

  if (def.type === ItemType.AMMO) total = Math.max(2, Math.round(total * 0.55));
  if (def.type === ItemType.FOOD || def.type === ItemType.DRINK) total = Math.min(total, v >= 30 ? 6 : 4);
  /* Бумажный потолок — только для бумаги. Тег `permit` у ствола значит «нужно
     разрешение на ношение», а не «сделан из бумаги»: Автомат Ералашникова за
     5200 ₽ из-за него имел состав документа в 8 единиц вместо 35. */
  const paperLike = def.type === ItemType.NOTE
    || (def.type === ItemType.MISC && hasAnyTag(def, ['document', 'permit', 'coupon', 'receipt', 'form']));
  if (paperLike) total = Math.min(total, v >= 100 ? 8 : 5);
  if (def.type === ItemType.KEY) total = Math.max(total, 3);
  if (WEAPON_ROLE_TIERS[def.id] === 'rare_energy' || WEAPON_ROLE_TIERS[def.id] === 'psi') total = Math.max(total, RARE_GEAR_TOTAL);
  if (rareMaterialsFor(def).includes('metamatter')) total = Math.max(total, ENDGAME_TOTAL);
  return total;
}

function baseWeights(def: ItemDef): MutableCraftVector {
  const weights = emptyCraftVector();
  const role = WEAPON_ROLE_TIERS[def.id];

  switch (def.type) {
    case ItemType.FOOD:
      add(weights, 'bio', 5);
      add(weights, 'consumables', 2);
      if (hasAnyTag(def, ['contaminant', 'experimental', 'bait_risky', 'zhelemish']) || idHasAny(def.id, ['infected', 'govnyak'])) add(weights, 'chemical', 2);
      break;
    case ItemType.DRINK:
      add(weights, 'consumables', 4);
      add(weights, 'chemical', 2);
      if (idHasAny(def.id, ['brew', 'kompot', 'coffee', 'energy'])) add(weights, 'bio', 1);
      break;
    case ItemType.MEDICINE:
      add(weights, 'chemical', 5);
      add(weights, 'consumables', 3);
      if (hasAnyTag(def, ['medical', 'zhelemish']) || idHasAny(def.id, ['bandage', 'morphine', 'syringe', 'cotton'])) add(weights, 'bio', 1);
      break;
    case ItemType.AMMO:
      add(weights, 'metal', 4);
      add(weights, 'chemical', 3);
      add(weights, 'consumables', 1);
      if (hasAnyTag(def, ['energy']) || idHasAny(def.id, ['energy'])) add(weights, 'electronics', 2);
      if (hasAnyTag(def, ['chemical', 'incendiary', 'fuel', 'foam'])) add(weights, 'chemical', 2);
      break;
    case ItemType.WEAPON:
      if (role === 'psi') {
        add(weights, 'psimatter', 6);
        add(weights, 'bio', 2);
        add(weights, 'chemical', 2);
        break;
      }
      if (role === 'rare_energy') {
        add(weights, 'electronics', 5);
        add(weights, 'mechanics', 3);
        add(weights, 'metal', 4);
        add(weights, 'chemical', 1);
        break;
      }
      if (role === 'grenade' || hasAnyTag(def, ['grenade', 'explosive', 'breach'])) {
        add(weights, 'chemical', 5);
        add(weights, 'metal', 3);
        add(weights, 'mechanics', 2);
        if (def.value >= 2_000) add(weights, 'electronics', 1);
        break;
      }
      if (role === 'fuel_clear' || hasAnyTag(def, ['flame', 'fuel_clear'])) {
        add(weights, 'mechanics', 3);
        add(weights, 'metal', 3);
        add(weights, 'chemical', 5);
        add(weights, 'electronics', 1);
        break;
      }
      add(weights, 'metal', 5);
      add(weights, 'mechanics', 4);
      if (role === 'ammo_burn' || role === 'pistol_sidegrade' || role === 'makarov_precise' || role === 'rifle_precision' || role === 'shotgun_corridor_stop') {
        add(weights, 'electronics', def.value >= 5_000 ? 2 : 1);
        add(weights, 'chemical', 1);
      }
      break;
    case ItemType.TOOL:
      add(weights, 'mechanics', 5);
      add(weights, 'metal', 3);
      add(weights, 'consumables', 1);
      if (hasAnyTag(def, ['electronics', 'battery', 'light', 'radio']) || idHasAny(def.id, ['flashlight', 'vacuum', 'detector', 'radio'])) add(weights, 'electronics', 4);
      if (hasAnyTag(def, ['cleanup', 'decon', 'filter'])) add(weights, 'chemical', 1);
      break;
    case ItemType.KEY:
      add(weights, 'metal', 3);
      add(weights, 'mechanics', 1);
      add(weights, 'consumables', 1);
      break;
    case ItemType.NOTE:
      add(weights, 'consumables', 4);
      if (hasAnyTag(def, ['terminal', 'electronics'])) add(weights, 'electronics', 1);
      break;
    case ItemType.MISC:
      applyMiscWeights(def, weights);
      break;
  }

  for (const material of CRAFT_MATERIAL_IDS) {
    if (hasAnyTag(def, MATERIAL_TAGS[material])) add(weights, material, 1);
  }

  const rare = rareMaterialsFor(def);
  const authored = !!AUTHORED_RARE_MATERIAL_ITEMS[def.id];
  for (const material of rare) {
    add(weights, material, authored ? (material === 'metamatter' ? 3 : 2) : derivedRareWeight(def, totalForItem(def)));
  }

  for (const material of RARE_MATERIALS) {
    if (!rare.includes(material)) weights[craftMaterialIndex(material)] = 0;
  }

  return weights;
}

function applyMiscWeights(def: ItemDef, weights: MutableCraftVector): void {
  if (hasAnyTag(def, ['document', 'permit', 'coupon', 'receipt', 'form', 'paper', 'audit']) || idHasAny(def.id, ['note', 'book', 'pass', 'permit', 'coupon', 'receipt', 'order', 'warrant', 'form', 'card', 'stamp', 'tag', 'label', 'roster', 'docket', 'index'])) {
    add(weights, 'consumables', 5);
    if (idHasAny(def.id, ['stamp', 'tag', 'key', 'plate', 'seal'])) add(weights, 'metal', 1);
    if (idHasAny(def.id, ['terminal', 'screen', 'mail'])) add(weights, 'electronics', 1);
  }
  if (hasAnyTag(def, ['slime', 'sample', 'zhelemish', 'fungus', 'mold', 'blood_plant']) || idHasAny(def.id, ['sample', 'slime', 'mold', 'zhelemish', 'tissue', 'swab', 'corpse'])) {
    add(weights, 'bio', 5);
    add(weights, 'chemical', 3);
    add(weights, 'consumables', 1);
  }
  if (hasAnyTag(def, ['reagent', 'fuel', 'decon', 'acid', 'alkali', 'paint', 'brewing']) || idHasAny(def.id, ['acid', 'alcohol', 'spirit', 'fluid', 'powder', 'lime', 'paint', 'fuel', 'napalm'])) {
    add(weights, 'chemical', 5);
    add(weights, 'consumables', 2);
  }
  if (hasAnyTag(def, ['electronics', 'battery', 'wire', 'terminal', 'lamp', 'screen']) || idHasAny(def.id, ['battery', 'circuit', 'wire', 'relay', 'lamp', 'keyboard', 'screen', 'emitter'])) {
    add(weights, 'electronics', 5);
    add(weights, 'mechanics', 1);
    add(weights, 'consumables', 1);
  }
  if (hasAnyTag(def, ['metal', 'repair_input', 'weapon_component', 'rail']) || idHasAny(def.id, ['metal', 'gear', 'spring', 'barrel', 'magazine', 'plate', 'bolt', 'spike', 'rail'])) {
    add(weights, 'metal', 5);
    add(weights, 'mechanics', 3);
  }
  /* Броня опознаётся собственным полем стойкостей, а не тегом: у всех четырёх
     комплектов тегов нет вовсе, и они падали в общий хвост «две бумажки», то
     есть Броня Ликвидатора за 4500 ₽ собиралась из шестнадцати расходников.
     ИЗ ЧЕГО она сделана, решает уже объявленный `armorType`, а не одна общая
     строка: пластина — это металл и приводы, ткань — полотно, резина и
     пропитка. Общий металлический состав врал сразу в обе стороны — ряса
     культиста собиралась из стали, и прорезиненный ОЗК собирался бы из неё же. */
  if (def.resistances) {
    if (def.armorType === ArmorType.CLOTH) {
      add(weights, 'chemical', 4);
      add(weights, 'consumables', 3);
      add(weights, 'mechanics', 1);
    } else {
      add(weights, 'metal', 5);
      add(weights, 'mechanics', 3);
      add(weights, 'chemical', 1);
    }
  }
  if (hasAnyTag(def, ['contraband', 'govnyak']) || idHasAny(def.id, ['govnyak', 'cigs', 'shaving'])) {
    add(weights, 'consumables', 2);
    add(weights, 'bio', 2);
    add(weights, 'chemical', 2);
  }
  if (weights.every(value => value === 0)) {
    add(weights, 'consumables', 2);
    if (def.value >= 20) add(weights, 'mechanics', 1);
  }
}

function allocate(total: number, weights: MutableCraftVector): CraftVector {
  const positive = weights.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
  if (positive === 0) return cv(0, 0, Math.max(1, total), 0, 0, 0, 0, 0, 0);

  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const out = emptyCraftVector();
  const remainders = weights.map((weight, index) => {
    const raw = weight > 0 ? total * weight / weightTotal : 0;
    const base = Math.floor(raw);
    out[index] = base;
    return { index, remainder: raw - base, weight };
  });

  let assigned = out.reduce((sum, value) => sum + value, 0);
  remainders.sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.index - b.index);
  for (const entry of remainders) {
    if (assigned >= total) break;
    if (entry.weight <= 0) continue;
    out[entry.index]++;
    assigned++;
  }

  if (assigned === 0) out[remainders.find(entry => entry.weight > 0)?.index ?? 2] = 1;
  return out;
}

function ensureIntentionalRareMinimum(def: ItemDef, vector: CraftVector): CraftVector {
  const intended = rareMaterialsFor(def);
  if (intended.length === 0) return vector;
  const out: MutableCraftVector = [...vector];
  for (const material of intended) {
    const index = craftMaterialIndex(material);
    if (out[index] > 0) continue;
    const donor = out
      .map((value, donorIndex) => ({ value, donorIndex }))
      .filter(entry => entry.value > 1 && !RARE_MATERIALS.includes(CRAFT_MATERIAL_IDS[entry.donorIndex] as typeof RARE_MATERIALS[number]))
      .sort((a, b) => b.value - a.value)[0];
    if (donor) out[donor.donorIndex]--;
    out[index]++;
  }
  return out;
}

/* Потолок редкого по цене вещи. Общий размер состава не меняется: лишние редкие
   единицы возвращаются в самый крупный обычный материал, а не исчезают. */
function capRareByValue(def: ItemDef, vector: CraftVector): CraftVector {
  const budget = rareBudget(def);
  const out: MutableCraftVector = [...vector];
  const rareIndices = RARE_MATERIALS.map(material => craftMaterialIndex(material));
  let rareTotal = rareIndices.reduce((sum, index) => sum + out[index], 0);
  while (rareTotal > budget) {
    const from = rareIndices.reduce((best, index) => (out[index] > out[best] ? index : best), rareIndices[0]);
    if (out[from] <= 0) break;
    const donor = out.reduce(
      (best, value, index) => (!rareIndices.includes(index) && value > out[best] ? index : best),
      craftMaterialIndex('consumables'),
    );
    out[from]--;
    out[donor]++;
    rareTotal--;
  }
  return out;
}

export function compositionForItemDef(def: ItemDef): CraftVector {
  return capRareByValue(def, ensureIntentionalRareMinimum(def, allocate(totalForItem(def), baseWeights(def))));
}

export const ITEM_COMPOSITIONS: Record<string, CraftVector> = Object.freeze(
  Object.fromEntries(Object.values(ITEMS).map(def => [def.id, compositionForItemDef(def)])),
);

/* Реестр носителей редкого бита выводится из готовых составов, а не пишется рукой:
   ценовой потолок вправе снять замысел с вещи, которая его не оплачивает, и
   расписанный вручную список тогда лгал бы. */
export const INTENTIONAL_RARE_MATERIAL_ITEMS: Record<string, readonly CraftMaterialId[]> = Object.freeze(
  Object.fromEntries(
    Object.entries(ITEM_COMPOSITIONS)
      .map(([itemId, vector]) => [itemId, RARE_MATERIALS.filter(material => vector[craftMaterialIndex(material)] > 0)] as const)
      .filter(([, materials]) => materials.length > 0),
  ),
);

export interface ItemCompositionDef {
  itemId: string;
  components: CraftVector;
  craftable?: boolean;
  discoverable?: boolean;
  station?: 'any' | 'workbench' | 'lathe' | 'lab' | 'net_terminal';
  recipeTier?: 0 | 1 | 2 | 3 | 4;
  tags?: readonly string[];
}

export function itemComposition(itemId: string): ItemCompositionDef | undefined {
  const components = ITEM_COMPOSITIONS[itemId];
  return components ? { itemId, components, craftable: true, discoverable: true } : undefined;
}
