import { ContainerKind, type ContainerAccess, RoomType } from '../core/types';

export interface ContainerDef {
  kind: ContainerKind;
  name: string;
  capacitySlots: number;
  proceduralValueCap?: number;
  defaultAccess: ContainerAccess;
  roomTypes: RoomType[];
  itemPool: { defId: string; min: number; max: number; chance?: number }[];
  tags: string[];
}

export const CONTAINER_DEFS: Record<ContainerKind, ContainerDef> = {
  [ContainerKind.WOODEN_CHEST]: {
    kind: ContainerKind.WOODEN_CHEST, name: 'Деревянный сундук', capacitySlots: 10, proceduralValueCap: 75, defaultAccess: 'owner',
    roomTypes: [RoomType.LIVING, RoomType.STORAGE], itemPool: [{ defId: 'bread', min: 1, max: 3 }, { defId: 'cigs', min: 1, max: 2 }, { defId: 'note', min: 1, max: 2 }, { defId: 'shelter_tally', min: 0, max: 1 }], tags: ['home', 'food'],
  },
  [ContainerKind.METAL_CABINET]: {
    kind: ContainerKind.METAL_CABINET, name: 'Железный шкаф', capacitySlots: 12, proceduralValueCap: 120, defaultAccess: 'room',
    roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION], itemPool: [{ defId: 'pipe', min: 1, max: 2 }, { defId: 'wrench', min: 1, max: 1 }, { defId: 'ammo_nails', min: 2, max: 6, chance: 0.25 }, { defId: 'valve_tag', min: 1, max: 2 }, { defId: 'relay_diagram', min: 1, max: 1 }], tags: ['tools'],
  },
  [ContainerKind.MEDICAL_CABINET]: {
    kind: ContainerKind.MEDICAL_CABINET, name: 'Медицинский шкаф', capacitySlots: 10, proceduralValueCap: 150, defaultAccess: 'room',
    roomTypes: [RoomType.MEDICAL], itemPool: [{ defId: 'bandage', min: 2, max: 5 }, { defId: 'pills', min: 1, max: 2 }, { defId: 'water', min: 1, max: 2 }, { defId: 'filter_receipt', min: 1, max: 1 }, { defId: 'corpse_number_tag', min: 1, max: 1, chance: 0.32 }, { defId: 'hermetic_tape', min: 1, max: 2, chance: 0.45 }, { defId: 'inspection_mirror', min: 1, max: 1 }, { defId: 'ozk_patch', min: 1, max: 2, chance: 0.35 }, { defId: 'lice_shampoo', min: 1, max: 1, chance: 0.22 }], tags: ['medical'],
  },
  [ContainerKind.WEAPON_CRATE]: {
    kind: ContainerKind.WEAPON_CRATE, name: 'Оружейный ящик', capacitySlots: 8, proceduralValueCap: 260, defaultAccess: 'faction',
    roomTypes: [RoomType.HQ, RoomType.STORAGE, RoomType.PRODUCTION], itemPool: [{ defId: 'ammo_9mm', min: 4, max: 10, chance: 0.75 }, { defId: 'ammo_shells', min: 1, max: 2, chance: 0.35 }, { defId: 'ammo_12g_slug', min: 1, max: 2, chance: 0.16 }, { defId: 'ammo_12g_incendiary', min: 1, max: 2, chance: 0.055 }, { defId: 'ammo_762tt', min: 4, max: 8, chance: 0.2 }, { defId: 'ammo_nagant', min: 3, max: 6, chance: 0.2 }, { defId: 'ammo_762', min: 5, max: 9, chance: 0.12 }, { defId: 'ammo_harpoon', min: 1, max: 2, chance: 0.08 }, { defId: 'ammo_belt', min: 8, max: 16, chance: 0.03 }, { defId: 'foam_grenade_6p10', min: 1, max: 2, chance: 0.06 }, { defId: 'knife', min: 1, max: 1 }, { defId: 'makarov', min: 1, max: 1, chance: 0.35 }, { defId: 'conscripts_doublebarrel', min: 1, max: 1, chance: 0.12 }, { defId: 'shmk_disposable', min: 1, max: 1, chance: 0.045 }, { defId: 'ozk_patch', min: 1, max: 1, chance: 0.25 }], tags: ['weapon', 'locked', 'ammo'],
  },
  [ContainerKind.FRIDGE]: {
    kind: ContainerKind.FRIDGE, name: 'Холодильник', capacitySlots: 8, proceduralValueCap: 60, defaultAccess: 'room',
    roomTypes: [RoomType.KITCHEN], itemPool: [{ defId: 'water', min: 2, max: 5 }, { defId: 'kasha', min: 1, max: 3 }, { defId: 'canned', min: 1, max: 2 }], tags: ['food'],
  },
  [ContainerKind.SAFE]: {
    kind: ContainerKind.SAFE, name: 'Сейф', capacitySlots: 10, proceduralValueCap: 260, defaultAccess: 'locked',
    roomTypes: [RoomType.OFFICE, RoomType.HQ], itemPool: [{ defId: 'key', min: 1, max: 1 }, { defId: 'ballot', min: 1, max: 4 }, { defId: 'note', min: 1, max: 3 }, { defId: 'seal_wax', min: 1, max: 2 }, { defId: 'ministry_clean_stamp', min: 1, max: 1, chance: 0.28 }, { defId: 'ration_stamp_pad', min: 1, max: 1 }, { defId: 'elevator_override_form', min: 1, max: 1 }, { defId: 'official_permit_slip', min: 1, max: 2 }, { defId: 'raionsovet_floor_pass', min: 1, max: 1, chance: 0.35 }, { defId: 'debt_settlement_receipt', min: 1, max: 1, chance: 0.25 }, { defId: 'confiscation_warrant', min: 1, max: 1, chance: 0.18 }, { defId: 'cleanup_order_stub', min: 1, max: 1, chance: 0.24 }, { defId: 'official_quarantine_clearance', min: 1, max: 1 }, { defId: 'ration_registry_extract', min: 1, max: 2 }, { defId: 'elevator_access_order', min: 1, max: 1 }, { defId: 'portable_siren_key', min: 1, max: 1, chance: 0.24 }, { defId: 'maronary_shaving', min: 1, max: 1, chance: 0.015 }], tags: ['valuable', 'locked', 'paper'],
  },
  [ContainerKind.FILING_CABINET]: {
    kind: ContainerKind.FILING_CABINET, name: 'Картотека', capacitySlots: 10, proceduralValueCap: 125, defaultAccess: 'room',
    roomTypes: [RoomType.OFFICE, RoomType.STORAGE], itemPool: [{ defId: 'note', min: 2, max: 5 }, { defId: 'book', min: 1, max: 2 }, { defId: 'ballot', min: 1, max: 3 }, { defId: 'sealed_complaint', min: 1, max: 2 }, { defId: 'samosbor_tally', min: 1, max: 1 }, { defId: 'shelter_tally', min: 0, max: 1 }, { defId: 'pressure_logbook', min: 1, max: 1 }, { defId: 'raionsovet_floor_pass', min: 1, max: 1, chance: 0.24 }, { defId: 'bank_debt_paper', min: 1, max: 1, chance: 0.24 }, { defId: 'container_key_label', min: 1, max: 2 }, { defId: 'corpse_number_tag', min: 1, max: 1, chance: 0.16 }, { defId: 'cleanup_order_stub', min: 1, max: 1, chance: 0.18 }, { defId: 'emergency_roster', min: 1, max: 1 }, { defId: 'filter_receipt', min: 1, max: 1 }], tags: ['paper'],
  },
  [ContainerKind.CASHBOX]: {
    kind: ContainerKind.CASHBOX, name: 'Касса', capacitySlots: 5, proceduralValueCap: 110, defaultAccess: 'owner',
    roomTypes: [RoomType.OFFICE, RoomType.KITCHEN], itemPool: [{ defId: 'cigs', min: 1, max: 3 }, { defId: 'tea', min: 1, max: 2 }, { defId: 'ration_stamp_pad', min: 1, max: 1 }, { defId: 'debt_settlement_receipt', min: 1, max: 1, chance: 0.22 }, { defId: 'container_key_label', min: 1, max: 1 }, { defId: 'shelter_tally', min: 0, max: 1 }, { defId: 'govnyak_roll', min: 1, max: 2 }], tags: ['trade'],
  },
  [ContainerKind.SECRET_STASH]: {
    kind: ContainerKind.SECRET_STASH, name: 'Тайник', capacitySlots: 8, proceduralValueCap: 220, defaultAccess: 'secret',
    roomTypes: [RoomType.CORRIDOR, RoomType.SMOKING, RoomType.LIVING], itemPool: [{ defId: 'forged_permit_slip', min: 1, max: 2 }, { defId: 'forged_raionsovet_pass', min: 1, max: 1, chance: 0.45 }, { defId: 'forged_bank_debt_paper', min: 1, max: 1, chance: 0.45 }, { defId: 'forged_quarantine_clearance', min: 1, max: 1 }, { defId: 'forged_ration_card', min: 1, max: 2 }, { defId: 'knife', min: 1, max: 1 }, { defId: 'nosin_rifle', min: 1, max: 1, chance: 0.035 }, { defId: 'ammo_762', min: 2, max: 5, chance: 0.12 }, { defId: 'conscripts_doublebarrel', min: 1, max: 1, chance: 0.08 }, { defId: 'pistol_grenade_launcher', min: 1, max: 1, chance: 0.025 }, { defId: 'grenade', min: 1, max: 1, chance: 0.08 }, { defId: 'cigs', min: 1, max: 4 }, { defId: 'govnyak_roll', min: 1, max: 3 }, { defId: 'govnyak_brick', min: 1, max: 1 }, { defId: 'govnyak_bad_batch', min: 1, max: 1 }, { defId: 'strange_clot', min: 1, max: 1 }, { defId: 'maronary_shaving', min: 1, max: 1, chance: 0.025 }], tags: ['secret', 'paper', 'forged', 'contraband'],
  },
  [ContainerKind.EMERGENCY_BOX]: {
    kind: ContainerKind.EMERGENCY_BOX, name: 'Аварийный ящик', capacitySlots: 8, proceduralValueCap: 85, defaultAccess: 'public',
    roomTypes: [RoomType.COMMON, RoomType.CORRIDOR], itemPool: [{ defId: 'water', min: 1, max: 3 }, { defId: 'bandage', min: 1, max: 2 }, { defId: 'bread', min: 1, max: 2 }, { defId: 'emergency_roster', min: 1, max: 1 }, { defId: 'siren_instruction', min: 1, max: 1 }], tags: ['public', 'samosbor'],
  },
  [ContainerKind.TRASH_BIN]: {
    kind: ContainerKind.TRASH_BIN, name: 'Мусорный бак', capacitySlots: 6, proceduralValueCap: 40, defaultAccess: 'public',
    roomTypes: [RoomType.KITCHEN, RoomType.CORRIDOR], itemPool: [{ defId: 'toiletpaper', min: 1, max: 2 }, { defId: 'note', min: 1, max: 1 }], tags: ['trash', 'public'],
  },
  [ContainerKind.TOOL_LOCKER]: {
    kind: ContainerKind.TOOL_LOCKER, name: 'Инструментальный шкаф', capacitySlots: 10, proceduralValueCap: 160, defaultAccess: 'room',
    roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE], itemPool: [{ defId: 'wrench', min: 1, max: 2 }, { defId: 'door_kit', min: 1, max: 1 }, { defId: 'flashlight', min: 1, max: 1 }, { defId: 'chalk', min: 1, max: 1, chance: 0.65 }, { defId: 'valve_tag', min: 1, max: 2 }, { defId: 'relay_diagram', min: 1, max: 1 }, { defId: 'inspection_mirror', min: 1, max: 1 }, { defId: 'fuse', min: 1, max: 2 }, { defId: 'sealant_tube', min: 1, max: 1 }, { defId: 'hermetic_tape', min: 1, max: 2, chance: 0.55 }, { defId: 'asbestos_cord', min: 1, max: 2, chance: 0.45 }, { defId: 'hermo_gasket', min: 1, max: 1, chance: 0.45 }, { defId: 'ozk_patch', min: 1, max: 1, chance: 0.4 }, { defId: 'lime_bucket', min: 1, max: 1, chance: 0.24 }], tags: ['tools'],
  },
};

const ITEM5_CONTAINER_POOLS: Partial<Record<ContainerKind, ContainerDef['itemPool']>> = {
  [ContainerKind.WOODEN_CHEST]: [
    { defId: 'cardboard_stack', min: 1, max: 3, chance: 0.55 },
    { defId: 'resident_trinket_box', min: 1, max: 1, chance: 0.24 },
    { defId: 'bottle_empty', min: 1, max: 2, chance: 0.45 },
  ],
  [ContainerKind.METAL_CABINET]: [
    { defId: 'junior_tech_case', min: 1, max: 2, chance: 0.32 },
    { defId: 'electrode_pack', min: 1, max: 2, chance: 0.45 },
    { defId: 'pump_impeller', min: 1, max: 1, chance: 0.22 },
    { defId: 'heating_element', min: 1, max: 1, chance: 0.34 },
    { defId: 'sound_emitter', min: 1, max: 1, chance: 0.2 },
    { defId: 'water_filter_regulator', min: 1, max: 1, chance: 0.18 },
    { defId: 'plastic_sheet', min: 1, max: 4, chance: 0.6 },
    { defId: 'ceramic_shards_pack', min: 1, max: 3, chance: 0.38 },
    { defId: 'rail_spike_pack', min: 1, max: 2, chance: 0.18 },
  ],
  [ContainerKind.FILING_CABINET]: [
    { defId: 'blueprint_t1_folder', min: 1, max: 1, chance: 0.2 },
    { defId: 'blueprint_t2_folder', min: 1, max: 1, chance: 0.06 },
    { defId: 'homemade_ammo_instruction', min: 1, max: 1, chance: 0.1 },
    { defId: 'track_diagram_scrap', min: 1, max: 1, chance: 0.08 },
  ],
  [ContainerKind.SAFE]: [
    { defId: 'blueprint_t2_folder', min: 1, max: 1, chance: 0.12 },
    { defId: 'blueprint_t3_folder', min: 1, max: 1, chance: 0.025 },
    { defId: 'stolen_terminal_stamp', min: 1, max: 1, chance: 0.04 },
  ],
  [ContainerKind.CASHBOX]: [
    { defId: 'dice_bone', min: 1, max: 2, chance: 0.35 },
    { defId: 'domino_box', min: 1, max: 1, chance: 0.2 },
    { defId: 'market_weight_scale', min: 1, max: 1, chance: 0.08 },
    { defId: 'party_portrait_pin', min: 1, max: 1, chance: 0.22 },
    { defId: 'import_toiletpaper', min: 1, max: 2, chance: 0.18 },
  ],
  [ContainerKind.SECRET_STASH]: [
    { defId: 'black_market_shells', min: 1, max: 2, chance: 0.28 },
    { defId: 'stolen_filter_pack', min: 1, max: 1, chance: 0.22 },
    { defId: 'scrubbed_serial_plate', min: 1, max: 2, chance: 0.24 },
    { defId: 'scrubbed_weapon_tag', min: 1, max: 2, chance: 0.18 },
    { defId: 'contraband_shocker_parts', min: 1, max: 1, chance: 0.14 },
    { defId: 'weapon_blueprint_t2', min: 1, max: 1, chance: 0.06 },
    { defId: 'aerosol_paint_maiden', min: 1, max: 1, chance: 0.18 },
    { defId: 'moonshine_still_part', min: 1, max: 1, chance: 0.1 },
  ],
  [ContainerKind.FRIDGE]: [
    { defId: 'sugar_pack', min: 1, max: 2, chance: 0.45 },
    { defId: 'bottle_empty', min: 1, max: 3, chance: 0.5 },
  ],
  [ContainerKind.TRASH_BIN]: [
    { defId: 'cardboard_stack', min: 1, max: 2, chance: 0.55 },
    { defId: 'bottle_empty', min: 1, max: 2, chance: 0.35 },
    { defId: 'ceramic_shards_pack', min: 1, max: 1, chance: 0.12 },
  ],
  [ContainerKind.TOOL_LOCKER]: [
    { defId: 'junior_tech_case', min: 1, max: 1, chance: 0.28 },
    { defId: 'wire_coil', min: 1, max: 2, chance: 0.5 },
    { defId: 'keyboard_unit', min: 1, max: 1, chance: 0.25 },
    { defId: 'screen_unit', min: 1, max: 1, chance: 0.18 },
    { defId: 'sound_emitter', min: 1, max: 1, chance: 0.16 },
    { defId: 'krona_battery', min: 1, max: 2, chance: 0.45 },
    { defId: 'water_filter_regulator', min: 1, max: 1, chance: 0.22 },
    { defId: 'pump_impeller', min: 1, max: 1, chance: 0.2 },
    { defId: 'vent_damper_plate', min: 1, max: 1, chance: 0.24 },
    { defId: 'rail_signal_lamp', min: 1, max: 1, chance: 0.12 },
    { defId: 'roller_brush', min: 1, max: 1, chance: 0.3 },
  ],
};

for (const [rawKind, entries] of Object.entries(ITEM5_CONTAINER_POOLS)) {
  const def = CONTAINER_DEFS[Number(rawKind) as ContainerKind];
  if (!def || !entries) continue;
  for (const entry of entries) {
    if (!def.itemPool.some(existing => existing.defId === entry.defId)) def.itemPool.push(entry);
  }
}

const RUBBER_TUBE_CONTAINER_POOLS: Partial<Record<ContainerKind, ContainerDef['itemPool']>> = {
  [ContainerKind.MEDICAL_CABINET]: [
    { defId: 'rubber_tube', min: 1, max: 2, chance: 0.32 },
  ],
  [ContainerKind.TOOL_LOCKER]: [
    { defId: 'rubber_tube', min: 1, max: 2, chance: 0.28 },
  ],
};

for (const [rawKind, entries] of Object.entries(RUBBER_TUBE_CONTAINER_POOLS)) {
  const def = CONTAINER_DEFS[Number(rawKind) as ContainerKind];
  if (!def || !entries) continue;
  for (const entry of entries) {
    if (!def.itemPool.some(existing => existing.defId === entry.defId)) def.itemPool.push(entry);
  }
}

const ENGINEER_STASH_WEAPON_CRATE_ITEMS: ContainerDef['itemPool'] = [
  { defId: 'concrete_breaker_grenade', min: 1, max: 1, chance: 0.035 },
];

const engineerStashWeaponCrate = CONTAINER_DEFS[ContainerKind.WEAPON_CRATE];
for (const entry of ENGINEER_STASH_WEAPON_CRATE_ITEMS) {
  if (!engineerStashWeaponCrate.itemPool.some(existing => existing.defId === entry.defId)) {
    engineerStashWeaponCrate.itemPool.push(entry);
  }
}

export function containerKindsForRoom(type: RoomType): ContainerKind[] {
  const kinds = Object.values(CONTAINER_DEFS)
    .filter(d => d.roomTypes.includes(type))
    .map(d => d.kind);
  return kinds.length > 0 ? kinds : [ContainerKind.WOODEN_CHEST];
}
