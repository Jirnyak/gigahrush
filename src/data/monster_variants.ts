/* ── Monster variant definitions: cheap modifiers, no runtime scans ── */

import { FloorLevel, MonsterKind } from '../core/types';

export type MonsterVariantFlag =
  | 'wall_bias'
  | 'lamp_bias'
  | 'water_bias'
  | 'document_bias'
  | 'ambush'
  | 'ranged_bias'
  | 'swarm'
  | 'armored'
  | 'coward'
  | 'fog_bias';

export interface MonsterVariantDef {
  id: string;
  baseKind: MonsterKind;
  prefix: string;
  hpMult: number;
  speedMult: number;
  dmgMult: number;
  flags: readonly MonsterVariantFlag[];
  floors: readonly FloorLevel[];
  lootHint: string;
}

export const MONSTER_VARIANTS: readonly MonsterVariantDef[] = [
  { id: 'cracked_sborka', baseKind: MonsterKind.SBORKA, prefix: 'Треснутая', hpMult: 0.8, speedMult: 1.2, dmgMult: 0.9, flags: ['swarm'], floors: [FloorLevel.LIVING, FloorLevel.KVARTIRY], lootHint: 'мусорный лут' },
  { id: 'fog_sborka', baseKind: MonsterKind.SBORKA, prefix: 'Туманная', hpMult: 1.0, speedMult: 1.1, dmgMult: 1.1, flags: ['fog_bias'], floors: [FloorLevel.LIVING, FloorLevel.HELL], lootHint: 'слабый след самосбора' },
  { id: 'wet_polzun', baseKind: MonsterKind.POLZUN, prefix: 'Мокрый', hpMult: 1.1, speedMult: 1.15, dmgMult: 1.0, flags: ['water_bias'], floors: [FloorLevel.MAINTENANCE], lootHint: 'влажные остатки' },
  { id: 'silent_polzun', baseKind: MonsterKind.POLZUN, prefix: 'Тихий', hpMult: 0.95, speedMult: 1.05, dmgMult: 1.2, flags: ['ambush'], floors: [FloorLevel.LIVING], lootHint: 'редкий шумовой крючок' },
  { id: 'panel_tvar', baseKind: MonsterKind.TVAR, prefix: 'Панельная', hpMult: 1.25, speedMult: 0.95, dmgMult: 1.05, flags: ['wall_bias'], floors: [FloorLevel.LIVING, FloorLevel.KVARTIRY], lootHint: 'бетонная крошка' },
  { id: 'hungry_tvar', baseKind: MonsterKind.TVAR, prefix: 'Голодная', hpMult: 0.9, speedMult: 1.25, dmgMult: 1.15, flags: ['ambush'], floors: [FloorLevel.HELL, FloorLevel.LIVING], lootHint: 'сырой мясной лут' },
  { id: 'office_zombie', baseKind: MonsterKind.ZOMBIE, prefix: 'Конторская', hpMult: 1.0, speedMult: 0.9, dmgMult: 1.0, flags: ['document_bias'], floors: [FloorLevel.MINISTRY, FloorLevel.LIVING], lootHint: 'бумажный мусор' },
  { id: 'wild_zombie', baseKind: MonsterKind.ZOMBIE, prefix: 'Дикая', hpMult: 0.9, speedMult: 1.15, dmgMult: 1.1, flags: ['swarm'], floors: [FloorLevel.KVARTIRY, FloorLevel.LIVING], lootHint: 'бытовой хлам' },
  { id: 'blind_eye', baseKind: MonsterKind.EYE, prefix: 'Слепой', hpMult: 0.8, speedMult: 0.9, dmgMult: 1.35, flags: ['ranged_bias'], floors: [FloorLevel.MAINTENANCE, FloorLevel.HELL], lootHint: 'сгусток сажи' },
  { id: 'black_slime_eye', baseKind: MonsterKind.EYE, prefix: 'Чернослизный', hpMult: 0.55, speedMult: 0.78, dmgMult: 0.75, flags: ['ranged_bias', 'ambush'], floors: [FloorLevel.MAINTENANCE], lootHint: 'проба черной слизи' },
  { id: 'lamp_eye', baseKind: MonsterKind.EYE, prefix: 'Ламповый', hpMult: 1.0, speedMult: 1.0, dmgMult: 1.15, flags: ['lamp_bias', 'ranged_bias'], floors: [FloorLevel.LIVING, FloorLevel.MINISTRY], lootHint: 'перегоревшая нить' },
  { id: 'rebar_veteran', baseKind: MonsterKind.REBAR, prefix: 'Закаленная', hpMult: 1.3, speedMult: 0.95, dmgMult: 1.15, flags: ['armored'], floors: [FloorLevel.MAINTENANCE, FloorLevel.HELL], lootHint: 'обломок арматуры' },
  { id: 'rust_rebar', baseKind: MonsterKind.REBAR, prefix: 'Ржавая', hpMult: 0.9, speedMult: 1.05, dmgMult: 1.25, flags: ['ambush'], floors: [FloorLevel.MAINTENANCE], lootHint: 'ржавчина' },
  { id: 'deep_shadow', baseKind: MonsterKind.SHADOW, prefix: 'Глубокий', hpMult: 1.15, speedMult: 1.05, dmgMult: 1.1, flags: ['ambush'], floors: [FloorLevel.HELL, FloorLevel.VOID], lootHint: 'темный след' },
  { id: 'thin_shadow', baseKind: MonsterKind.SHADOW, prefix: 'Тонкий', hpMult: 0.75, speedMult: 1.35, dmgMult: 0.95, flags: ['coward'], floors: [FloorLevel.MINISTRY, FloorLevel.LIVING], lootHint: 'почти ничего' },
  { id: 'court_nightmare', baseKind: MonsterKind.NIGHTMARE, prefix: 'Протокольное', hpMult: 1.1, speedMult: 0.95, dmgMult: 1.2, flags: ['document_bias'], floors: [FloorLevel.MINISTRY], lootHint: 'испорченный протокол' },
  { id: 'wet_nightmare', baseKind: MonsterKind.NIGHTMARE, prefix: 'Водяное', hpMult: 1.05, speedMult: 1.1, dmgMult: 1.05, flags: ['water_bias'], floors: [FloorLevel.MAINTENANCE], lootHint: 'мокрый сгусток' },
  { id: 'choir_matka', baseKind: MonsterKind.MATKA, prefix: 'Хоровая', hpMult: 1.2, speedMult: 1.0, dmgMult: 1.0, flags: ['swarm'], floors: [FloorLevel.HELL], lootHint: 'маточный узел' },
  { id: 'office_idol', baseKind: MonsterKind.IDOL, prefix: 'Канцелярский', hpMult: 1.0, speedMult: 1.0, dmgMult: 1.15, flags: ['document_bias', 'ranged_bias'], floors: [FloorLevel.MINISTRY], lootHint: 'чернильный камень' },
  { id: 'pipe_robot', baseKind: MonsterKind.ROBOT, prefix: 'Трубный', hpMult: 1.1, speedMult: 0.95, dmgMult: 1.1, flags: ['water_bias', 'ranged_bias'], floors: [FloorLevel.MAINTENANCE], lootHint: 'энергоячейка шанс' },
  { id: 'false_spirit', baseKind: MonsterKind.SPIRIT, prefix: 'Ложный', hpMult: 0.95, speedMult: 1.2, dmgMult: 1.0, flags: ['ambush'], floors: [FloorLevel.VOID, FloorLevel.MINISTRY], lootHint: 'пустая память' },
  { id: 'garbage_krysnozhka', baseKind: MonsterKind.KRYSNOZHKA, prefix: 'Помойная', hpMult: 0.9, speedMult: 1.12, dmgMult: 0.9, flags: ['swarm', 'coward'], floors: [FloorLevel.KVARTIRY, FloorLevel.LIVING, FloorLevel.MAINTENANCE], lootHint: 'запах мусорного гнезда' },
  { id: 'betonoed', baseKind: MonsterKind.BETONNIK, prefix: 'Бетоноед', hpMult: 0.48, speedMult: 1.18, dmgMult: 0.9, flags: ['wall_bias', 'armored'], floors: [], lootHint: 'арматурная крошка и бетонный осколок' },
];

export const MONSTER_VARIANTS_BY_KIND: Partial<Record<MonsterKind, readonly MonsterVariantDef[]>> = {};
export const MONSTER_VARIANTS_BY_FLOOR: Partial<Record<FloorLevel, readonly MonsterVariantDef[]>> = {};
export const MONSTER_VARIANT_BY_ID: Record<string, MonsterVariantDef> = {};

for (const v of MONSTER_VARIANTS) {
  MONSTER_VARIANT_BY_ID[v.id] = v;
  MONSTER_VARIANTS_BY_KIND[v.baseKind] = [...(MONSTER_VARIANTS_BY_KIND[v.baseKind] ?? []), v];
  for (const floor of v.floors) {
    MONSTER_VARIANTS_BY_FLOOR[floor] = [...(MONSTER_VARIANTS_BY_FLOOR[floor] ?? []), v];
  }
}

export function variantsForKind(kind: MonsterKind): readonly MonsterVariantDef[] {
  return MONSTER_VARIANTS_BY_KIND[kind] ?? [];
}

export function chooseMonsterVariant(kind: MonsterKind, floor: FloorLevel): MonsterVariantDef | undefined {
  const variants = variantsForKind(kind).filter(v => v.floors.includes(floor));
  if (variants.length === 0) return undefined;
  return variants[Math.floor(Math.random() * variants.length)];
}
