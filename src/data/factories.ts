import { Faction, Occupation, RoomType } from '../core/types';

export interface ResourceStack {
  id: string;
  count: number;
}

export interface ItemStackDef {
  defId: string;
  count: number;
}

export interface FactoryRecipeDef {
  id: string;
  name: string;
  inputs: ResourceStack[];
  inputItems?: ItemStackDef[];
  outputs: ItemStackDef[];
  cycleSec: number;
  eventTags?: string[];
}

export interface FactoryDef {
  id: string;
  name: string;
  roomTypes: RoomType[];
  roomNameHints: string[];
  workerOccupations: Occupation[];
  ownerFaction?: Faction;
  outputTags: string[];
  recipes: FactoryRecipeDef[];
}

export const FACTORIES: FactoryDef[] = [
  {
    id: 'communal_kitchen',
    name: 'Кухонная раздача',
    roomTypes: [RoomType.KITCHEN],
    roomNameHints: ['кух', 'буфет', 'столов'],
    workerOccupations: [Occupation.COOK, Occupation.HOUSEWIFE],
    outputTags: ['food', 'public'],
    recipes: [
      { id: 'cook_kasha', name: 'Сварить кашу', inputs: [{ id: 'drink_water', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'kasha', count: 3 }], cycleSec: 60 },
      { id: 'pack_ration', name: 'Собрать паек', inputs: [{ id: 'food', count: 2 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'bread', count: 2 }, { defId: 'canned', count: 1 }], cycleSec: 90 },
    ],
  },
  {
    id: 'medical_post',
    name: 'Медпункт',
    roomTypes: [RoomType.MEDICAL],
    roomNameHints: ['мед', 'лаборат'],
    workerOccupations: [Occupation.DOCTOR, Occupation.SCIENTIST],
    outputTags: ['medical', 'locked'],
    recipes: [
      { id: 'roll_bandage', name: 'Скрутить бинты', inputs: [{ id: 'medicine', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'bandage', count: 2 }], cycleSec: 90 },
      { id: 'press_pills', name: 'Прессовать таблетки', inputs: [{ id: 'medicine', count: 2 }, { id: 'drink_water', count: 1 }], outputs: [{ defId: 'pills', count: 1 }], cycleSec: 120 },
    ],
  },
  {
    id: 'concentrate_press',
    name: 'Линия концентрата',
    roomTypes: [RoomType.PRODUCTION],
    roomNameHints: ['концентрат', 'брикет'],
    workerOccupations: [Occupation.MECHANIC, Occupation.COOK, Occupation.STOREKEEPER],
    ownerFaction: Faction.CITIZEN,
    outputTags: ['tools', 'food', 'public'],
    recipes: [
      { id: 'press_gray_briquettes', name: 'Прессовать серые брикеты', inputs: [{ id: 'industrial_slurry', count: 2 }, { id: 'drink_water', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'grey_briquette', count: 4 }], cycleSec: 120 },
      { id: 'seal_green_briquettes', name: 'Запечатать зелёные брикеты', inputs: [{ id: 'industrial_slurry', count: 2 }, { id: 'tools', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'green_briquette', count: 3 }, { defId: 'gasmask_filter', count: 1 }], cycleSec: 180 },
    ],
  },
  {
    id: 'slime_deactivation_furnace',
    name: 'Печь деактивации слизи',
    roomTypes: [RoomType.PRODUCTION],
    roomNameHints: ['деактивац', 'гашен', 'слиз', 'печь'],
    workerOccupations: [Occupation.MECHANIC, Occupation.SCIENTIST, Occupation.HUNTER],
    ownerFaction: Faction.LIQUIDATOR,
    outputTags: ['cleanup', 'slime', 'tools'],
    recipes: [
      {
        id: 'burn_brown_slime_sample',
        name: 'Гасить коричневую пробу',
        inputs: [{ id: 'fuel', count: 2 }, { id: 'tools', count: 1 }, { id: 'labor', count: 1 }],
        inputItems: [{ defId: 'slime_sample_brown', count: 1 }],
        outputs: [{ defId: 'deactivated_residue', count: 2 }, { defId: 'gasmask_filter', count: 1 }],
        cycleSec: 240,
        eventTags: ['slime', 'deactivation_furnace', 'furnace_used', 'deactivation_completed'],
      },
    ],
  },
  {
    id: 'illegal_ammo_smelter',
    name: 'Гильзоплавка',
    roomTypes: [RoomType.PRODUCTION],
    roomNameHints: ['гильз', 'плавиль', 'патрон'],
    workerOccupations: [Occupation.TURNER, Occupation.LOCKSMITH, Occupation.MECHANIC],
    ownerFaction: Faction.WILD,
    outputTags: ['ammo', 'weapon', 'illegal'],
    recipes: [
      { id: 'recycle_pistol_rounds', name: 'Переплавить патронный лом', inputs: [{ id: 'ammo', count: 2 }, { id: 'metal', count: 2 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'ammo_9mm', count: 6 }], cycleSec: 300 },
    ],
  },
  {
    id: 'metal_shop',
    name: 'Цех металла',
    roomTypes: [RoomType.PRODUCTION],
    roomNameHints: ['цех', 'мастер', 'насосн', 'стан'],
    workerOccupations: [Occupation.LOCKSMITH, Occupation.TURNER, Occupation.MECHANIC],
    outputTags: ['tools', 'faction'],
    recipes: [
      { id: 'cut_pipe', name: 'Нарезать трубы', inputs: [{ id: 'metal', count: 2 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'pipe', count: 1 }], cycleSec: 120 },
      { id: 'assemble_door_kit', name: 'Собрать дверь-комплект', inputs: [{ id: 'metal', count: 4 }, { id: 'tools', count: 1 }], outputs: [{ defId: 'door_kit', count: 1 }], cycleSec: 180 },
    ],
  },
  {
    id: 'armory_bench',
    name: 'Оружейная мастерская',
    roomTypes: [RoomType.STORAGE, RoomType.HQ, RoomType.PRODUCTION],
    roomNameHints: ['оруж', 'штаб', 'арсенал'],
    workerOccupations: [Occupation.HUNTER, Occupation.MECHANIC],
    ownerFaction: Faction.LIQUIDATOR,
    outputTags: ['weapon', 'locked'],
    recipes: [
      { id: 'load_9mm', name: 'Снарядить 9мм', inputs: [{ id: 'ammo', count: 2 }, { id: 'metal', count: 1 }], outputs: [{ defId: 'ammo_9mm', count: 24 }], cycleSec: 90 },
      { id: 'repair_makarov', name: 'Восстановить Макаров', inputs: [{ id: 'metal', count: 4 }, { id: 'tools', count: 2 }], outputs: [{ defId: 'makarov', count: 1 }], cycleSec: 240 },
    ],
  },
  {
    id: 'office_press',
    name: 'Бумажное производство',
    roomTypes: [RoomType.OFFICE, RoomType.STORAGE],
    roomNameHints: ['архив', 'кабинет', 'типограф', 'картотек'],
    workerOccupations: [Occupation.SECRETARY, Occupation.DIRECTOR, Occupation.STOREKEEPER],
    outputTags: ['paper', 'bureaucracy'],
    recipes: [
      { id: 'copy_bulletins', name: 'Размножить бюллетени', inputs: [{ id: 'paper', count: 2 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'ballot', count: 3 }], cycleSec: 120 },
      { id: 'sort_notes', name: 'Сортировать записки', inputs: [{ id: 'documents', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'note', count: 2 }], cycleSec: 60 },
    ],
  },
  {
    id: 'mushroom_cellar',
    name: 'Грибная смена',
    roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE, RoomType.KITCHEN],
    roomNameHints: ['гриб', 'плесен', 'прачеч'],
    workerOccupations: [Occupation.STOREKEEPER, Occupation.COOK, Occupation.MECHANIC],
    ownerFaction: Faction.CITIZEN,
    outputTags: ['food', 'fungal'],
    recipes: [
      { id: 'grow_cellar_mushrooms', name: 'Вырастить грибную массу', inputs: [{ id: 'fungal_inputs', count: 1 }, { id: 'drink_water', count: 1 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'mushroom_mass', count: 3 }, { defId: 'infected_mushroom', count: 1 }], cycleSec: 240 },
    ],
  },
  {
    id: 'utility_room',
    name: 'Техническая кладовая',
    roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION],
    roomNameHints: ['клад', 'склад', 'диспетчер'],
    workerOccupations: [Occupation.STOREKEEPER, Occupation.ELECTRICIAN],
    outputTags: ['utility', 'room'],
    recipes: [
      { id: 'charge_cells', name: 'Зарядить ячейки', inputs: [{ id: 'electronics', count: 2 }, { id: 'labor', count: 1 }], outputs: [{ defId: 'ammo_energy', count: 1 }], cycleSec: 180 },
      { id: 'fill_fuel', name: 'Разлить топливо', inputs: [{ id: 'fuel', count: 2 }, { id: 'tools', count: 1 }], outputs: [{ defId: 'ammo_fuel', count: 2 }], cycleSec: 120 },
    ],
  },
];

export const FACTORY_BY_ID: Record<string, FactoryDef> = Object.fromEntries(FACTORIES.map(f => [f.id, f]));

export function factoryForRoom(roomType: RoomType, roomName: string): FactoryDef | undefined {
  const name = roomName.toLowerCase();
  return FACTORIES.find(f => f.roomTypes.includes(roomType) && (f.roomNameHints.length === 0 || f.roomNameHints.some(h => name.includes(h))))
    ?? FACTORIES.find(f => f.roomTypes.includes(roomType));
}
