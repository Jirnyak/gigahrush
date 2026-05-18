import { ItemType, RoomType } from '../core/types';
import { ITEMS, SILVER_SLIME_OPENED_ID, SILVER_SLIME_SEALED_ID } from './items';

export interface ResourceDef {
  id: string;
  name: string;
  baseStock: number;
  lowStock: number;
  roomTypes: RoomType[];
  itemIds: string[];
}

export const RESOURCES: ResourceDef[] = [
  { id: 'drink_water', name: 'Питьевая вода', baseStock: 120, lowStock: 35, roomTypes: [RoomType.KITCHEN, RoomType.STORAGE, RoomType.MEDICAL], itemIds: ['water', 'filtered_water', 'boiler_water', 'metal_water'] },
  { id: 'food', name: 'Еда', baseStock: 140, lowStock: 40, roomTypes: [RoomType.KITCHEN, RoomType.STORAGE], itemIds: ['bread', 'canned', 'kasha', 'rawmeat', 'mushroom_mass', 'infected_mushroom', 'grey_briquette', 'green_briquette', 'liquidator_ration', 'pearl_barley', 'soup_cube', 'pressed_sugar', 'yeast_bread'] },
  { id: 'medicine', name: 'Медицина', baseStock: 70, lowStock: 20, roomTypes: [RoomType.MEDICAL, RoomType.STORAGE], itemIds: ['bandage', 'pills', 'antidep', 'tourniquet', 'iodine', 'antibiotic', 'morphine_ampoule', 'psi_stabilizer', 'sanitary_kit', 'antifungal_ointment'] },
  { id: 'metal', name: 'Металл', baseStock: 95, lowStock: 25, roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE], itemIds: ['pipe', 'wrench', 'rebar', 'hammer', 'crowbar', 'sledgehammer', 'valve_tag', 'metal_sheet'] },
  { id: 'ammo', name: 'Боеприпасы', baseStock: 80, lowStock: 18, roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.HQ], itemIds: ['ammo_9mm', 'ammo_shells', 'ammo_nails', 'ammo_762', 'ammo_762tt', 'ammo_nagant', 'ammo_harpoon'] },
  { id: 'tools', name: 'Инструменты', baseStock: 55, lowStock: 12, roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE], itemIds: ['flashlight', 'uv_spotlight', 'door_kit', 'block_kit', 'cleaning_kit', 'vacuum', 'radio', 'fog_detector', 'unpeople_detector', 'duct_tape', 'fuse', 'manometer', 'valve_tag', 'inspection_mirror', 'sealant_tube'] },
  { id: 'paper', name: 'Бумага', baseStock: 65, lowStock: 15, roomTypes: [RoomType.OFFICE, RoomType.STORAGE], itemIds: ['note', 'book', 'ballot', 'blank_form', 'water_coupon', 'concentrate_coupon', 'ration_registry_extract', 'forged_ration_card', 'ration_stamp_pad', 'sealed_complaint', 'samosbor_tally'] },
  { id: 'fuel', name: 'Топливо', baseStock: 45, lowStock: 10, roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE], itemIds: ['ammo_fuel'] },
  { id: 'electronics', name: 'Электроника', baseStock: 35, lowStock: 8, roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE, RoomType.OFFICE], itemIds: ['ammo_energy', 'flashlight', 'uv_spotlight', 'radio', 'fog_detector', 'unpeople_detector', 'circuit_board', 'fuse', 'relay_diagram'] },
  { id: 'psi', name: 'ПСИ-сгустки', baseStock: 20, lowStock: 5, roomTypes: [RoomType.MEDICAL, RoomType.OFFICE], itemIds: ['psi_strike', 'psi_mark', 'strange_clot', 'psi_dust', 'meat_rune'] },
  { id: 'slime_samples', name: 'Образцы слизи', baseStock: 12, lowStock: 3, roomTypes: [RoomType.MEDICAL, RoomType.PRODUCTION, RoomType.STORAGE], itemIds: ['slime_sample_brown', 'slime_sample_green', 'slime_sample_white', 'slime_sample_red', 'slime_sample_black', 'slime_sample_blue', 'blue_glow_sample_sealed', 'blue_glow_sample_open', SILVER_SLIME_SEALED_ID, SILVER_SLIME_OPENED_ID, 'slime_sample_seroburmaline', 'slime_sample_fake', 'slime_sample_contaminated'] },
  { id: 'contraband', name: 'Контрабанда', baseStock: 24, lowStock: 6, roomTypes: [RoomType.SMOKING, RoomType.STORAGE, RoomType.COMMON], itemIds: ['govnyak_roll', 'govnyak_brick', 'govnyak_sample', 'govnyak_bad_batch', 'cigs', 'forged_ration_card', 'forged_permit_slip', 'weapon_permit_forged'] },
  { id: 'documents', name: 'Документы', baseStock: 60, lowStock: 15, roomTypes: [RoomType.OFFICE, RoomType.STORAGE], itemIds: ['ballot', 'note', 'key', 'fake_pass', 'zhek_seal', 'hermodoor_journal', 'pump_passport', 'temp_pass', 'permanent_pass', 'caravan_route', 'lift_scheme', 'blank_form', 'water_coupon', 'concentrate_coupon', 'ration_registry_extract', 'forged_ration_card', 'neighbor_complaint', 'denunciation', 'unsigned_order', 'siren_instruction', 'voluntary_receipt', 'clean_health_cert', 'psychiatrist_referral', 'samosbor_tally', 'sealed_complaint', 'elevator_override_form', 'pressure_logbook', 'ration_stamp_pad', 'container_key_label', 'seal_wax', 'emergency_roster', 'filter_receipt'] },
  { id: 'industrial_slurry', name: 'Промышленная масса', baseStock: 70, lowStock: 18, roomTypes: [RoomType.PRODUCTION, RoomType.STORAGE], itemIds: ['rawmeat', 'metal_water', 'filter_layer', 'acid_bottle', 'rubber_strip'] },
  { id: 'fungal_inputs', name: 'Грибной субстрат', baseStock: 45, lowStock: 12, roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.BATHROOM], itemIds: ['spore_print', 'substrate_sack'] },
  { id: 'zhelemish', name: 'Желемыш', baseStock: 18, lowStock: 4, roomTypes: [RoomType.STORAGE, RoomType.KITCHEN, RoomType.MEDICAL, RoomType.BATHROOM], itemIds: ['zhelemish_raw', 'zhelemish_dried', 'zhelemish_boiled'] },
  { id: 'labor', name: 'Трудочасы', baseStock: 180, lowStock: 45, roomTypes: [RoomType.PRODUCTION, RoomType.KITCHEN, RoomType.MEDICAL, RoomType.OFFICE], itemIds: [] },
];

export const RESOURCE_BY_ID: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map(r => [r.id, r]));

export function resourceForItem(defId: string): ResourceDef | undefined {
  return RESOURCES.find(r => r.itemIds.includes(defId));
}

export function resourceForItemType(type: ItemType): ResourceDef | undefined {
  if (type === ItemType.FOOD || type === ItemType.DRINK) return RESOURCE_BY_ID.food;
  if (type === ItemType.MEDICINE) return RESOURCE_BY_ID.medicine;
  if (type === ItemType.AMMO) return RESOURCE_BY_ID.ammo;
  if (type === ItemType.TOOL) return RESOURCE_BY_ID.tools;
  return undefined;
}

export function validateResourceItems(): string[] {
  const missing: string[] = [];
  for (const r of RESOURCES) {
    for (const id of r.itemIds) if (!ITEMS[id]) missing.push(`${r.id}:${id}`);
  }
  return missing;
}
