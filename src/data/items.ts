/* ── Item definitions — еда, напитки, медицина, оружие, амуниция, разное ── */

import {
  RoomType, ItemType,
  type ItemDef, type Entity,
} from '../core/types';

function feed(v: number) { return (e: Entity) => { if (e.needs) { e.needs.food = Math.min(100, e.needs.food + v); e.needs.pendingPoo = (e.needs.pendingPoo ?? 0) + v * 0.7; e.needs.pendingPee = (e.needs.pendingPee ?? 0) + v * 0.3; } return 'Вы поели'; }; }
function drink(v: number) { return (e: Entity) => { if (e.needs) { e.needs.water = Math.min(100, e.needs.water + v); e.needs.pendingPee = (e.needs.pendingPee ?? 0) + v * 0.6; } return 'Вы попили'; }; }
function medicine(hp: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); return `Лечение +${hp}`; }; }
function psiMedicine(hp: number, psi: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); if (e.rpg) e.rpg.psi = Math.min(e.rpg.maxPsi, e.rpg.psi + psi); return hp > 0 ? `Лечение +${hp}, ПСИ +${psi}` : `ПСИ +${psi}`; }; }

/** Stack size: weapons & PSI = 1, everything else = 999. Override with def.stack */
export function getStack(def: ItemDef): number {
  if (def.stack != null) return def.stack;
  return def.type === ItemType.WEAPON ? 1 : 999;
}

/** Max spawn count for world loot: cheap → more, expensive → less, ammo ×10, weapons/tools = 1 */
export function spawnCount(def: ItemDef): number {
  if (def.type === ItemType.WEAPON || def.type === ItemType.TOOL || def.type === ItemType.KEY) return 1;
  const base = Math.max(1, Math.ceil(30 / Math.max(1, def.value)));
  return def.type === ItemType.AMMO ? base * 10 : base;
}

export const ITEMS: Record<string, ItemDef> = {
  // ── Еда (дешёвая, частая) ──
  bread:     { id:'bread',     name:'Хлеб',         type:ItemType.FOOD,     desc:'Чёрствый хлеб',          spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:1, value:3, use:feed(15) },
  canned:    { id:'canned',    name:'Тушёнка',      type:ItemType.FOOD,     desc:'Мясная консерва',        spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:1, value:10, use:feed(30) },
  kasha:     { id:'kasha',     name:'Каша',         type:ItemType.FOOD,     desc:'Холодная каша',          spawnRooms:[RoomType.KITCHEN],                  spawnW:1, value:5, use:feed(20) },
  rawmeat:   { id:'rawmeat',   name:'Сырое мясо',   type:ItemType.FOOD,     desc:'Подозрительное мясо',    spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:1, use:feed(10) },

  // ── Напитки (дешёвые, частые) ──
  water:     { id:'water',     name:'Вода',         type:ItemType.DRINK,    desc:'Бутылка воды',           spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE,RoomType.BATHROOM], spawnW:1, value:2, use:drink(25) },
  tea:       { id:'tea',       name:'Чай',          type:ItemType.DRINK,    desc:'Холодный чай',           spawnRooms:[RoomType.KITCHEN,RoomType.COMMON],  spawnW:1, value:3, use:drink(15) },
  kompot:    { id:'kompot',    name:'Компот',       type:ItemType.DRINK,    desc:'Мутный компот',          spawnRooms:[RoomType.KITCHEN],                  spawnW:1, value:5, use:drink(20) },

  // ── Медицина ──
  bandage:   { id:'bandage',   name:'Бинт',         type:ItemType.MEDICINE, desc:'Рулон бинта',            spawnRooms:[RoomType.MEDICAL,RoomType.BATHROOM],spawnW:1, value:10, use:medicine(15) },
  pills:     { id:'pills',     name:'Таблетки',     type:ItemType.MEDICINE, desc:'Обезболивающее. Лечит 25 HP, +5 ПСИ',   spawnRooms:[RoomType.MEDICAL],                  spawnW:1, value:40, use:psiMedicine(25, 5) },
  antidep:   { id:'antidep',   name:'Антидепрессант',type:ItemType.MEDICINE, desc:'Помогает с психикой. +20 ПСИ',           spawnRooms:[RoomType.MEDICAL],                  spawnW:1, value:80, use:psiMedicine(0, 20) },

  // ── Оружие ближний бой ──
  pipe:      { id:'pipe',      name:'Труба',        type:ItemType.WEAPON,    desc:'Тяжёлая труба. Урон 18. Прочность 50', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:35 },
  wrench:    { id:'wrench',    name:'Ключ гаечный', type:ItemType.WEAPON,    desc:'Увесистый. Урон 12. Прочность 60',     spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:25 },
  knife:     { id:'knife',     name:'Нож',          type:ItemType.WEAPON,    desc:'Кухонный нож. Урон 8. Прочность 40',   spawnRooms:[RoomType.KITCHEN],                  spawnW:1, value:15 },
  rebar:     { id:'rebar',     name:'Арматура',     type:ItemType.WEAPON,    desc:'Кусок арматуры. Урон 25. Прочность 80', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:60 },
  axe:       { id:'axe',       name:'Топор',        type:ItemType.WEAPON,    desc:'Пожарный топор. Урон 30. Прочность 70', spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:120 },
  chainsaw:  { id:'chainsaw',  name:'Бензопила',    type:ItemType.WEAPON,    desc:'Бензопила. Урон 100. Прочность 30. Жрёт всё', spawnRooms:[RoomType.PRODUCTION], spawnW:1, value:3000 },

  // ── Оружие огнестрельное ──
  makarov:   { id:'makarov',   name:'Макаров',      type:ItemType.WEAPON,    desc:'Пистолет ПМ. Урон 20. Патроны 9мм',    spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:200 },
  ppsh:      { id:'ppsh',      name:'ППШ',          type:ItemType.WEAPON,    desc:'Пистолет-пулемёт. Урон 10. Очень быстрый. 9мм', spawnRooms:[RoomType.STORAGE], spawnW:1, value:600 },
  shotgun:   { id:'shotgun',   name:'Обрез',        type:ItemType.WEAPON,    desc:'Обрез. Урон 8×6. Дробь',               spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:300 },
  nailgun:   { id:'nailgun',   name:'Гвоздомёт',    type:ItemType.WEAPON,    desc:'Скорострельный. Урон 12. Гвозди',      spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:150 },
  ak47:      { id:'ak47',      name:'Калашников',    type:ItemType.WEAPON,    desc:'АК-47. Урон 25. Патроны 7.62мм. Скорострельный', spawnRooms:[], spawnW:0, value:1000 },
  machinegun:{ id:'machinegun', name:'Пулемёт',     type:ItemType.WEAPON,    desc:'ПКМ. Урон 15. Безумная скорострельность. Ленточное питание', spawnRooms:[], spawnW:0, value:2500 },
  grenade:   { id:'grenade',   name:'Граната',      type:ItemType.WEAPON,   desc:'РГД-5. Урон 80 по площади. Кидай и прячься', spawnRooms:[RoomType.STORAGE], spawnW:1, value:80, stack:999 },
  gauss:     { id:'gauss',     name:'Гаусс-винтовка', type:ItemType.WEAPON,  desc:'Рельсотрон. Урон 120. Медленная, но смертельная. Энергоячейки', spawnRooms:[], spawnW:0, value:5000 },
  plasma:    { id:'plasma',    name:'Плазмаган',    type:ItemType.WEAPON,    desc:'Плазменное оружие. Урон 35. Быстрый, с разбросом. Энергоячейки', spawnRooms:[], spawnW:0, value:3000 },
  bfg:       { id:'bfg',       name:'БФГ-9000',     type:ItemType.WEAPON,    desc:'BIG FUCKING GUN. Урон 200 по огромной площади. Энергоячейки', spawnRooms:[], spawnW:0, value:10000 },
  flamethrower:{ id:'flamethrower', name:'Огнемёт', type:ItemType.WEAPON,    desc:'Ближний бой. Сжигает всё. Оставляет следы гари. Бензин', spawnRooms:[], spawnW:0, value:2500 },

  // ── Патроны ──
  ammo_9mm:  { id:'ammo_9mm',  name:'Патроны 9мм',  type:ItemType.AMMO,     desc:'Патроны для Макарова',                  spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:2 },
  ammo_shells:{ id:'ammo_shells',name:'Дробь',       type:ItemType.AMMO,     desc:'Дробовые патроны',                     spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:5 },
  ammo_nails:{ id:'ammo_nails', name:'Гвозди',      type:ItemType.AMMO,     desc:'Гвозди для гвоздомёта',                spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:2 },
  ammo_762:  { id:'ammo_762',   name:'Патроны 7.62',  type:ItemType.AMMO,     desc:'Патроны для Калашникова',              spawnRooms:[RoomType.STORAGE], spawnW:1, value:10 },
  ammo_belt: { id:'ammo_belt',  name:'Лента 7.62',   type:ItemType.AMMO,     desc:'Пулемётная лента. 100 патронов',      spawnRooms:[RoomType.STORAGE], spawnW:1, value:50 },
  ammo_energy:{ id:'ammo_energy', name:'Энергоячейка', type:ItemType.AMMO,    desc:'Энергоячейка для плазмы, гаусса и БФГ', spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:100 },
  ammo_fuel: { id:'ammo_fuel',  name:'Канистра бензина', type:ItemType.AMMO,  desc:'Топливо для огнемёта и бензопилы',     spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:20 },

  // ── Сгустки (ПСИ-руны) — очень дорогие, ультраредкие ──
  psi_strike:   { id:'psi_strike',    name:'Сгусток: Пси удар',        type:ItemType.WEAPON, desc:'Пси-снаряд. 1 ПСИ, 10 урона',                                     spawnRooms:[RoomType.MEDICAL,RoomType.OFFICE,RoomType.COMMON], spawnW:1, value:100 },
  psi_rupture:  { id:'psi_rupture',   name:'Сгусток: Разрыв',          type:ItemType.WEAPON, desc:'Взрыв пси-энергии. 3 ПСИ, 10 урона по площади',                    spawnRooms:[RoomType.MEDICAL,RoomType.STORAGE],               spawnW:1, value:300 },
  psi_storm:    { id:'psi_storm',     name:'Сгусток: Пси буря',        type:ItemType.WEAPON, desc:'Волна боли. 10 ПСИ, урон всем в поле зрения',                       spawnRooms:[RoomType.MEDICAL],                                spawnW:1, value:1500 },
  psi_brainburn:{ id:'psi_brainburn', name:'Сгусток: Выжиг мозга',     type:ItemType.WEAPON, desc:'Мгновенная смерть цели ≤ вашего уровня. 8 ПСИ',                     spawnRooms:[RoomType.MEDICAL],                                spawnW:1, value:3000 },
  psi_madness:  { id:'psi_madness',   name:'Сгусток: Безумие',         type:ItemType.WEAPON, desc:'Цель нападает на всех. 5 ПСИ, 60с',                                 spawnRooms:[RoomType.OFFICE,RoomType.COMMON],                 spawnW:1, value:500 },
  psi_control:  { id:'psi_control',   name:'Сгусток: Контроль',        type:ItemType.WEAPON, desc:'Цель становится союзником. 8 ПСИ, 60с',                              spawnRooms:[RoomType.MEDICAL],                                spawnW:1, value:3000 },
  psi_phase:    { id:'psi_phase',     name:'Сгусток: Фазовый сдвиг',   type:ItemType.WEAPON, desc:'Проходить сквозь стены. 8 ПСИ, 60с',                                 spawnRooms:[RoomType.STORAGE],                                spawnW:1, value:5000 },
  psi_mark:     { id:'psi_mark',      name:'Сгусток: Метка',           type:ItemType.WEAPON, desc:'Запомнить позицию для телепорта. 3 ПСИ',                              spawnRooms:[RoomType.MEDICAL,RoomType.OFFICE],                spawnW:1, value:200 },
  psi_recall:   { id:'psi_recall',    name:'Сгусток: Возврат',         type:ItemType.WEAPON, desc:'Телепорт к метке. 3 ПСИ',                                             spawnRooms:[RoomType.MEDICAL,RoomType.OFFICE],                spawnW:1, value:200 },
  psi_beam:     { id:'psi_beam',      name:'Сгусток: Хамехамеха',     type:ItemType.WEAPON, desc:'Мощный ПСИ-луч. Зажми атаку — луч выжигает всех на пути. 3 ПСИ/с', spawnRooms:[RoomType.MEDICAL], spawnW:1, value:8000 },

  // ── Инструменты и разное ──
  flashlight:{ id:'flashlight', name:'Фонарик',     type:ItemType.TOOL,      desc:'Процедурный круг света. Батарея: 10 игровых часов (5 минут)', spawnRooms:[RoomType.STORAGE,RoomType.LIVING,RoomType.PRODUCTION],  spawnW:1, value:150, durability:300 },
  jackhammer:{ id:'jackhammer', name:'Отбойный молоток', type:ItemType.TOOL, desc:'Сносит стены. Сильный износ: хватает на 10 блоков', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:1500, durability:10 },
  door_kit:  { id:'door_kit',   name:'Дверь комплект', type:ItemType.TOOL,   desc:'Установка одной двери в проходе', spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:400, durability:1 },
  block_kit: { id:'block_kit',  name:'Блок комплект', type:ItemType.TOOL,    desc:'Установка одного блока стены', spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:400, durability:1 },
  cleaning_kit:{ id:'cleaning_kit', name:'Чистящий комплект', type:ItemType.TOOL, desc:'Зажмите R: очищает кровь/грязь в радиусе клетки и улучшает отношения', spawnRooms:[RoomType.BATHROOM,RoomType.STORAGE,RoomType.LIVING], spawnW:1, value:80, durability:240 },
  toiletpaper:{id:'toiletpaper',name:'Туал. бумага', type:ItemType.MISC,      desc:'Рулон',                  spawnRooms:[RoomType.BATHROOM,RoomType.STORAGE],spawnW:1, value:1 },
  cigs:      { id:'cigs',      name:'Сигареты',     type:ItemType.MISC,      desc:'Пачка «Прима»',          spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.SMOKING],   spawnW:1, value:5 },
  book:      { id:'book',      name:'Книга',        type:ItemType.MISC,     desc:'Потрёпанный том',        spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.OFFICE],   spawnW:1, value:3 },
  note:      { id:'note',      name:'Записка',      type:ItemType.NOTE,     desc:'Чья-то записка',         spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.STORAGE,RoomType.OFFICE], spawnW:1, value:1 },

  // ── Ключи ──
  key:       { id:'key',       name:'Ключ',         type:ItemType.KEY,      desc:'Подходит к двери',       spawnRooms:[],                                 spawnW:0, value:50 },

  // ── Сюжетные предметы ──
  idol_chernobog: { id:'idol_chernobog', name:'Идол Чернобога', type:ItemType.MISC, desc:'Тёмная фигурка из неизвестного камня. Холодная на ощупь.', spawnRooms:[RoomType.COMMON,RoomType.STORAGE,RoomType.OFFICE,RoomType.SMOKING], spawnW:1, value:200 },
  strange_clot: { id:'strange_clot', name:'Странный сгусток', type:ItemType.MISC, desc:'Тёмный пульсирующий сгусток, изъятый из теневика. Излучает холод.', spawnRooms:[], spawnW:0, value:500 },
};
