import { Faction, Occupation } from '../core/types';
import { designFloorById } from './design_floors';
import { floorKeyRouteId } from './floor_keys';

export interface CaravanResourceDelta {
  resourceId: string;
  count: number;
}

export interface CaravanLaneDef {
  id: string;
  name: string;
  /** Route floor keys are the truth for a lane; the z coordinate is derived from
   *  them (`laneFromZ`/`laneToZ`). The old numeric fromFloor/toFloor carried
   *  codes of the removed FloorLevel enum and pointed at floors that no longer
   *  exist. */
  fromFloorKeys: readonly string[];
  toFloorKeys: readonly string[];
  resourceDeltas: readonly CaravanResourceDelta[];
  tariffResourceIds: readonly string[];
  corpIds?: readonly string[];
  faction: Faction;
  startsOpen?: boolean;
}

export type SmallCaravanRole = 'porters' | 'repair' | 'smugglers' | 'clerks' | 'signalers';

/** Чем закрытый контракт кончается для линии. Порядок слов совпадает с
 *  ветвлением в `systems/caravans.ts`; новое действие заводится там же. */
export type CaravanContractAction = 'escort' | 'raid' | 'reroute' | 'report' | 'seat';

export interface SmallCaravanTemplateDef {
  id: string;
  laneId: string;
  name: string;
  role: SmallCaravanRole;
  cargo: readonly CaravanResourceDelta[];
  risk: number;
  memberCount: number;
  faction: Faction;
  occupation: Occupation;
  /** Контракты, чей закрытый исход правит линию каравана: id контракта из
   *  `data/contracts.ts` -> действие. Линия не повторяется — её берут из
   *  `laneId` этого же шаблона. Единственный источник связи; рукописной
   *  таблицы в системе нет, поэтому дописанная сюда строка работает сразу. */
  contracts?: Readonly<Record<string, CaravanContractAction>>;
}




export const CARAVAN_LANES: readonly CaravanLaneDef[] = [
  {
    id: 'kvartiry_living_food_water',
    name: 'Квартиры -> Жилая: еда и вода',
    fromFloorKeys: ['design:kvartiry'],
    toFloorKeys: ['design:living'],
    resourceDeltas: [{ resourceId: 'food', count: 6 }, { resourceId: 'drink_water', count: 5 }],
    tariffResourceIds: ['food', 'drink_water'],
    faction: Faction.CITIZEN,
  },
  {
    id: 'maintenance_living_tools',
    name: 'Коллекторы -> Жилая: металл и инструмент',
    fromFloorKeys: ['design:maintenance'],
    toFloorKeys: ['design:living'],
    resourceDeltas: [{ resourceId: 'metal', count: 5 }, { resourceId: 'tools', count: 3 }],
    tariffResourceIds: ['metal', 'tools'],
    faction: Faction.CITIZEN,
  },
  {
    id: 'production_black_market_88',
    name: 'Производственный пояс -> рынок 88',
    fromFloorKeys: ['design:production_belt'],
    toFloorKeys: ['design:black_market_88'],
    resourceDeltas: [{ resourceId: 'contraband', count: 3 }, { resourceId: 'ammo', count: 4 }],
    tariffResourceIds: ['contraband', 'ammo'],
    corpIds: ['market88'],
    faction: Faction.WILD,
  },
  {
    id: 'ministry_market_docs',
    name: 'Министерство -> Жилая: бумаги и бланки',
    fromFloorKeys: ['design:ministry'],
    toFloorKeys: ['design:living'],
    resourceDeltas: [{ resourceId: 'documents', count: 5 }, { resourceId: 'paper', count: 4 }],
    tariffResourceIds: ['documents', 'paper'],
    corpIds: ['ministry_registry'],
    faction: Faction.LIQUIDATOR,
  },
  {
    id: 'hell_cult_psi_goods',
    name: 'Мясной низ -> культовые ПСИ-грузы',
    fromFloorKeys: ['design:hell'],
    toFloorKeys: ['design:living'],
    resourceDeltas: [{ resourceId: 'psi', count: 2 }, { resourceId: 'contraband', count: 2 }],
    tariffResourceIds: ['psi', 'contraband'],
    faction: Faction.CULTIST,
  },
  {
    id: 'net_exchange_data',
    name: 'Министерство -> Жилая: НЕТ-схемы и бумаги',
    fromFloorKeys: ['design:silicon_net_well'],
    toFloorKeys: ['design:living'],
    resourceDeltas: [{ resourceId: 'electronics', count: 3 }, { resourceId: 'documents', count: 2 }],
    tariffResourceIds: ['electronics', 'documents'],
    corpIds: ['net_sphere'],
    faction: Faction.SCIENTIST,
    startsOpen: false,
  },
];

export const CARAVAN_LANE_BY_ID: Record<string, CaravanLaneDef> = Object.fromEntries(
  CARAVAN_LANES.map(lane => [lane.id, lane]),
);

function laneZ(keys: readonly string[]): number {
  const design = designFloorById(floorKeyRouteId(keys[0] ?? ''));
  return design ? design.z : 0;
}

export function laneFromZ(def: CaravanLaneDef): number {
  return laneZ(def.fromFloorKeys);
}

export function laneToZ(def: CaravanLaneDef): number {
  return laneZ(def.toFloorKeys);
}

export const SMALL_CARAVAN_TEMPLATES: readonly SmallCaravanTemplateDef[] = [
  {
    id: 'queue_lift_porters',
    laneId: 'kvartiry_living_food_water',
    name: 'малый караван очередников',
    role: 'porters',
    cargo: [{ resourceId: 'food', count: 2 }, { resourceId: 'drink_water', count: 2 }],
    risk: 2,
    memberCount: 3,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    contracts: {
      caravan_escort_queue_porters: 'escort',
      caravan_raid_queue_cargo: 'raid',
      caravan_buy_queue_seat: 'seat',
    },
  },
  {
    id: 'repair_lift_crew',
    laneId: 'maintenance_living_tools',
    name: 'ремонтная тройка лифтовиков',
    role: 'repair',
    cargo: [{ resourceId: 'metal', count: 2 }, { resourceId: 'tools', count: 2 }],
    risk: 3,
    memberCount: 3,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    contracts: {
      caravan_escort_repair_crew: 'escort',
      caravan_reroute_repair_crew: 'reroute',
    },
  },
  {
    id: 'market88_smugglers',
    laneId: 'production_black_market_88',
    name: 'контрабандный малый караван 88',
    role: 'smugglers',
    cargo: [{ resourceId: 'contraband', count: 2 }, { resourceId: 'ammo', count: 2 }],
    risk: 4,
    memberCount: 2,
    faction: Faction.WILD,
    occupation: Occupation.TRAVELER,
    contracts: {
      caravan_raid_market88_smugglers: 'raid',
      // Сдача маршрута ЗАКРЫВАЕТ линию, а не пускает её в обход: раньше этот id
      // лежал в поле обхода, и оживи оно — рынок бы получил груз вместо ревизии.
      caravan_report_market88_smugglers: 'report',
    },
  },
  {
    id: 'ministry_form_carriers',
    laneId: 'ministry_market_docs',
    name: 'бумажный караван канцелярии',
    role: 'clerks',
    cargo: [{ resourceId: 'documents', count: 2 }, { resourceId: 'paper', count: 2 }],
    risk: 3,
    memberCount: 3,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.SECRETARY,
    contracts: {
      caravan_escort_ministry_forms: 'escort',
      caravan_reroute_ministry_forms: 'reroute',
    },
  },
  {
    id: 'net_signalers',
    laneId: 'net_exchange_data',
    name: 'сигнальный караван НЕТ-терминала',
    role: 'signalers',
    cargo: [{ resourceId: 'electronics', count: 2 }, { resourceId: 'documents', count: 1 }],
    risk: 3,
    memberCount: 2,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    contracts: {
      caravan_escort_net_signalers: 'escort',
      caravan_reroute_net_signalers: 'reroute',
    },
  },
];

export const SMALL_CARAVAN_TEMPLATE_BY_ID: Record<string, SmallCaravanTemplateDef> = Object.fromEntries(
  SMALL_CARAVAN_TEMPLATES.map(template => [template.id, template]),
);

/** Линия несёт не больше одного шаблона; первый объявленный и есть её караван —
 *  тот же выбор, что делал линейный поиск в системе. */
export const SMALL_CARAVAN_TEMPLATE_BY_LANE_ID: Record<string, SmallCaravanTemplateDef> = (() => {
  const out: Record<string, SmallCaravanTemplateDef> = {};
  for (const template of SMALL_CARAVAN_TEMPLATES) {
    if (!out[template.laneId]) out[template.laneId] = template;
  }
  return out;
})();

/** Контракт -> что он делает с линией. Собирается из шаблонов: id контракта и
 *  линия объявлены по одному разу, разойтись им негде. */
export const CARAVAN_CONTRACT_OUTCOMES: Readonly<Record<string, { action: CaravanContractAction; laneId: string }>> = (() => {
  const out: Record<string, { action: CaravanContractAction; laneId: string }> = {};
  for (const template of SMALL_CARAVAN_TEMPLATES) {
    for (const contractId in template.contracts) {
      out[contractId] = { action: template.contracts[contractId], laneId: template.laneId };
    }
  }
  return out;
})();


