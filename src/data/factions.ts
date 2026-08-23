import { Faction, Occupation, RoomType, ZoneFaction, type TerritoryOwner } from '../core/types';

export interface TerritoryOwnerDef {
  owner: TerritoryOwner;
  id: string;
  name: string;
  shortName: string;
  /** Имя штаба этого хозяина. Раньше собиралось из ЧИСЛА перечисления
   *  («Миништаб 3»), то есть игрок читал служебный индекс. */
  hqName: string;
  color: string;
  faction: Faction | null;
  /**
   * Во что этот хозяин вцепляется на этаже: тип комнаты → вес интереса.
   * Раньше эта таблица жила ветками `if (owner === …)` внутри системы
   * территории; ветка на хозяина — это запрет добавлять хозяина данными.
   * Комнат тут ровно столько, сколько объявлено: у чего веса нет — ноль.
   */
  rooms: Partial<Record<RoomType, number>>;
  /** Чем вооружены их люди, когда снаряжение не задано событием. */
  weapons: readonly string[];
  /** Кем выходит их патруль, если у события нет своего занятия. */
  patrolOccupation?: Occupation;
}

export const TERRITORY_OWNER_DEFS: readonly TerritoryOwnerDef[] = [
  {
    owner: ZoneFaction.CITIZEN, id: 'citizen', name: 'Граждане', shortName: 'ГРЖ',
    hqName: 'Миништаб граждан', color: '#4abe91', faction: Faction.CITIZEN,
    rooms: { [RoomType.COMMON]: 36, [RoomType.KITCHEN]: 36, [RoomType.LIVING]: 36, [RoomType.MEDICAL]: 18 },
    weapons: ['knife'],
  },
  {
    owner: ZoneFaction.LIQUIDATOR, id: 'liquidator', name: 'Ликвидаторы', shortName: 'ЛИК',
    hqName: 'Миништаб ликвидаторов', color: '#5b9eee', faction: Faction.LIQUIDATOR,
    rooms: { [RoomType.OFFICE]: 40, [RoomType.STORAGE]: 40, [RoomType.CORRIDOR]: 20, [RoomType.COMMON]: 20 },
    weapons: ['makarov', 'pipe'], patrolOccupation: Occupation.HUNTER,
  },
  {
    owner: ZoneFaction.CULTIST, id: 'cultist', name: 'Культисты', shortName: 'КУЛ',
    hqName: 'Миништаб культистов', color: '#bc59ff', faction: Faction.CULTIST,
    rooms: { [RoomType.COMMON]: 36, [RoomType.STORAGE]: 36, [RoomType.CORRIDOR]: 12 },
    weapons: ['knife', 'psi_strike'], patrolOccupation: Occupation.PILGRIM,
  },
  {
    owner: ZoneFaction.SAMOSBOR, id: 'samosbor', name: 'Самосбор', shortName: 'САМ',
    hqName: 'Миништаб самосбора', color: '#e64e5c', faction: null,
    rooms: {}, weapons: ['knife'],
  },
  {
    owner: ZoneFaction.WILD, id: 'wild', name: 'Дикие', shortName: 'ДИК',
    hqName: 'Миништаб диких', color: '#e0a745', faction: Faction.WILD,
    rooms: { [RoomType.STORAGE]: 34, [RoomType.SMOKING]: 34, [RoomType.CORRIDOR]: 34, [RoomType.COMMON]: 12 },
    weapons: ['pipe', 'knife'],
  },
  {
    owner: ZoneFaction.SCIENTIST, id: 'scientist', name: 'Учёные', shortName: 'НИИ',
    hqName: 'Миништаб НИИ', color: '#67d8e8', faction: Faction.SCIENTIST,
    rooms: { [RoomType.MEDICAL]: 44, [RoomType.OFFICE]: 44, [RoomType.PRODUCTION]: 44, [RoomType.STORAGE]: 18 },
    weapons: ['knife'],
  },
] as const;

/**
 * Сколько ячеек занимает хозяин в счётчиках по клеткам и бакетам. Хозяев шесть,
 * но перечисление — байт, и все счётчики выравнены на восьмёрку: одна константа
 * на территорию, скопления и зонные срезы, чтобы срез одного не разъезжался
 * со срезом другого.
 */
export const TERRITORY_OWNER_SLOTS = 8;

export const TERRITORY_OWNERS = TERRITORY_OWNER_DEFS.map(def => def.owner) as readonly TerritoryOwner[];
export const HUMAN_TERRITORY_OWNERS = TERRITORY_OWNER_DEFS
  .filter(def => def.faction !== null)
  .map(def => def.owner) as readonly TerritoryOwner[];

export function isTerritoryOwner(value: number): value is TerritoryOwner {
  return TERRITORY_OWNERS.includes(value as TerritoryOwner);
}

export function territoryOwnerDef(owner: TerritoryOwner): TerritoryOwnerDef {
  return TERRITORY_OWNER_DEFS.find(def => def.owner === owner) ?? TERRITORY_OWNER_DEFS[0];
}

export function territoryOwnerName(owner: TerritoryOwner): string {
  return territoryOwnerDef(owner).name;
}

export function territoryOwnerColor(owner: TerritoryOwner): string {
  return territoryOwnerDef(owner).color;
}

export function territoryOwnerHqName(owner: TerritoryOwner): string {
  return territoryOwnerDef(owner).hqName;
}

/** Вес интереса хозяина к типу комнаты. Нет строки в таблице — ноль. */
export function territoryOwnerRoomWeight(owner: TerritoryOwner, room: RoomType): number {
  return territoryOwnerDef(owner).rooms[room] ?? 0;
}

function factionDef(faction: Faction): TerritoryOwnerDef | undefined {
  return TERRITORY_OWNER_DEFS.find(def => def.faction === faction);
}

/** Оружие фракции по умолчанию: ножом вооружён тот, кому не объявлено иное. */
export function factionDefaultWeapons(faction: Faction): readonly string[] {
  return factionDef(faction)?.weapons ?? ['knife'];
}

/** Занятие патруля этой фракции; `undefined` — берётся занятие самого события. */
export function factionPatrolOccupation(faction: Faction): Occupation | undefined {
  return factionDef(faction)?.patrolOccupation;
}

export function territoryOwnerToFaction(owner: TerritoryOwner): Faction | null {
  return territoryOwnerDef(owner).faction;
}

export function factionToTerritoryOwner(faction: Faction): TerritoryOwner {
  switch (faction) {
    case Faction.CITIZEN: return ZoneFaction.CITIZEN;
    case Faction.LIQUIDATOR: return ZoneFaction.LIQUIDATOR;
    case Faction.CULTIST: return ZoneFaction.CULTIST;
    case Faction.SCIENTIST: return ZoneFaction.SCIENTIST;
    case Faction.WILD: return ZoneFaction.WILD;
    case Faction.PLAYER: return ZoneFaction.CITIZEN;
  }
}

