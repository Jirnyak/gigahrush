/**
 * Какой силуэт у вещи в руке.
 *
 * Архетип НЕ перечисляется вручную для семидесяти стволов: он выводится из уже
 * канонических боевых чисел — ролевого пояса, дальнобойности, картечи, типа
 * снаряда, ёмкости магазина. Заводить второй словарь «оружие → картинка»
 * означало бы держать два источника истины и однажды их рассинхронить.
 *
 * Ручная таблица оставлена только для тех, у кого силуэт не следует из чисел:
 * пила пилит, а не бьёт, гарпун стреляет копьём, гвоздомёт — инструмент. Это
 * ровно тот случай, когда общее правило врёт, и врёт наглядно.
 */

import { WEAPON_ROLE_TIERS, WEAPON_STATS } from '../../data/catalog';
import { ITEMS } from '../../data/items';
import { TOOL_LIGHT_DEFS } from '../../data/tool_lights';
import { ProjType } from '../../core/types';
import type { ViewmodelSlot } from './types';

/**
 * Силуэты. Перечислено только то, что реально рисуется; ни одной записи под
 * будущее — новый архетип заводится вместе со своим пакетом.
 */
export type ViewmodelArchetype =
  | 'bare_hands'
  | 'blade'
  | 'blunt'
  | 'polearm'
  | 'chainsaw'
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'machinegun'
  | 'flamer'
  | 'launcher'
  | 'energy'
  | 'thrown'
  | 'psi_hand'
  | 'flashlight'
  | 'lighter'
  | 'uv_spotlight'
  | 'tool_generic';

/**
 * Стволы, чей силуэт не выводится из боевых чисел.
 *
 * Таблица обязана оставаться короткой: каждая строка здесь — признание, что
 * общее правило для этой вещи не работает. Длинная таблица означала бы, что
 * правило выбрано неверно.
 */
const ARCHETYPE_OVERRIDES: Readonly<Record<string, ViewmodelArchetype>> = {
  // Пила пилит, а не бьёт: у неё свой корпус, шина и обе руки на скобе.
  chainsaw: 'chainsaw',
  // Гвоздомёт и гарпун стреляют, но в руках это инструмент и копьемёт,
  // а не пистолет с магазином.
  nailgun: 'smg',
  harpoon_gun: 'rifle',
  // Одноразовая труба на плече читается пусковой, а не огнемётом с баком.
  shmk_disposable: 'launcher',
  /* Штык числится в поясе длинного боя по делу — им колют с вылета. Но в руке
   * это клинок с гардой, а не древко с крюком, и ни одно боевое число этой
   * разницы не несёт. `rake_bayonet` при этом остаётся древковым: там штык
   * насажен на грабли, и длинным силуэт делает именно черенок. */
  bayonet: 'blade',
};

/** Ручной привод для инструментов, у которых нет боевых чисел вовсе. */
const TOOL_ARCHETYPES: Readonly<Record<string, ViewmodelArchetype>> = {
  flashlight: 'flashlight',
  liquidator_flashlamp: 'flashlight',
  lighter: 'lighter',
  uv_spotlight: 'uv_spotlight',
};

/**
 * Ближний бой: чем именно бьют.
 *
 * «Длинное» — это ровно авторский пояс `melee_reach`, а не порог по вылету.
 * Порог здесь пробовался и оказался ложью: у ближнего боя вылет почти весь
 * лежит в 1.25..2.35, и любое отсечение по числу забирало в древковые и
 * кувалду, и стул, и разводной ключ. Пояс уже несёт это решение, принятое
 * автором оружия; выводить его заново по числам — значит спорить с ним.
 *
 * Режущее от дробящего боевые числа не отличают вовсе: и топор, и кувалда бьют
 * кинетикой. Единственный носитель этой разницы — имя вещи, поэтому оно здесь
 * и стоит.
 */
function meleeArchetype(id: string, role: string | undefined): ViewmodelArchetype {
  if (role === 'melee_reach') return 'polearm';
  if (/knife|axe|bayonet|blade|spade|kostorez/.test(id)) return 'blade';
  return 'blunt';
}

/** Дальнобой: чем именно стреляют. */
function rangedArchetype(id: string, role: string | undefined): ViewmodelArchetype {
  const ws = WEAPON_STATS[id];
  if (!ws) return 'pistol';

  /* Огонь решает раньше луча: атомный огнемёт помечен `deletionBeam`, но в
   * руках это бак со шлангом и соплом, а не эмиттер энергетики. */
  if (ws.projType === ProjType.FLAME || role === 'fuel_clear') return 'flamer';
  if (ws.deletionBeam || ws.projType === ProjType.BEAM || ws.projType === ProjType.BFG) return 'energy';
  if (role === 'rare_energy') return 'energy';

  /* Пояс `grenade` держит и то, что бросают рукой, и то, чем выстреливают из
   * трубы. Отличает их скорость снаряда: брошенное летит по дуге не быстрее
   * девяти, выпущенное из ствола — от десяти. Ёмкость добавлена второй опорой,
   * чтобы правило не держалось на одном делении шкалы. */
  if (role === 'grenade') {
    const mag = ws.magazineSize ?? 0;
    const launched = (ws.projSpeed ?? 0) >= 10 || (Number.isFinite(mag) && mag >= 4);
    return launched ? 'launcher' : 'thrown';
  }

  if ((ws.pellets ?? 1) > 1) return 'shotgun';
  if (ws.aoeRadius && ws.aoeRadius > 0) return 'launcher';

  /* Лента против рожка: сотня патронов — это короб и станок, семьдесят один —
   * дисковый пистолет-пулемёт, тридцать — автомат под плечо. */
  const mag = ws.magazineSize ?? 0;
  if (mag >= 100) return 'machinegun';
  if (role === 'ammo_burn') return mag >= 50 ? 'smg' : 'rifle';
  if (role === 'rifle_precision') return 'rifle';
  if (role === 'makarov_precise' || role === 'pistol_sidegrade') return 'pistol';
  return 'pistol';
}

/**
 * Силуэт вещи в указанной руке.
 *
 * Пси живёт в слоте инструмента (см. `itemEquipSlot`), поэтому проверка на
 * `psiCost` стоит РАНЬШЕ разбора инструментов: сгусток — это руки, а не фонарь.
 */
export function viewmodelArchetype(slot: ViewmodelSlot, itemId: string | undefined): ViewmodelArchetype | undefined {
  if (!itemId) return slot === 'weapon' ? 'bare_hands' : undefined;

  const ws = WEAPON_STATS[itemId];
  if (ws?.psiCost) return 'psi_hand';

  if (slot === 'tool') {
    const light = TOOL_ARCHETYPES[itemId];
    if (light) return light;
    if (TOOL_LIGHT_DEFS.some((d) => d.id === itemId)) return 'flashlight';
    return ITEMS[itemId] ? 'tool_generic' : undefined;
  }

  const forced = ARCHETYPE_OVERRIDES[itemId];
  if (forced) return forced;
  if (!ws) return undefined;

  const role = WEAPON_ROLE_TIERS[itemId];
  if (role === 'unarmed' || (!ws.isRanged && ws.durability === 0 && ws.range <= 0.5)) return 'bare_hands';
  return ws.isRanged ? rangedArchetype(itemId, role) : meleeArchetype(itemId, role);
}
