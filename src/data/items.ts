/* ── Item definitions — еда, напитки, медицина, оружие, амуниция, разное ── */

import {
  RoomType, ItemType,
  type ItemDef, type Entity,
} from '../core/types';

function feed(v: number) { return (e: Entity) => { if (e.needs) { e.needs.food = Math.min(100, e.needs.food + v); e.needs.pendingPoo = (e.needs.pendingPoo ?? 0) + v * 0.7; e.needs.pendingPee = (e.needs.pendingPee ?? 0) + v * 0.3; } return 'Вы поели'; }; }
function drink(v: number) { return (e: Entity) => { if (e.needs) { e.needs.water = Math.min(100, e.needs.water + v); e.needs.pendingPee = (e.needs.pendingPee ?? 0) + v * 0.6; } return 'Вы попили'; }; }
function medicine(hp: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); return `Лечение +${hp}`; }; }
function psiMedicine(hp: number, psi: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); if (e.rpg) e.rpg.psi = Math.min(e.rpg.maxPsi, e.rpg.psi + psi); return hp > 0 ? `Лечение +${hp}, ПСИ +${psi}` : `ПСИ +${psi}`; }; }

export const ITEMS: Record<string, ItemDef> = {
  // ── Еда ──
  bread:     { id:'bread',     name:'Хлеб',         type:ItemType.FOOD,     stack:5,  desc:'Чёрствый хлеб',          spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:8, value:5, use:feed(15) },
  canned:    { id:'canned',    name:'Тушёнка',      type:ItemType.FOOD,     stack:3,  desc:'Мясная консерва',        spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:5, value:15, use:feed(30) },
  kasha:     { id:'kasha',     name:'Каша',         type:ItemType.FOOD,     stack:3,  desc:'Холодная каша',          spawnRooms:[RoomType.KITCHEN],                  spawnW:4, value:8, use:feed(20) },
  rawmeat:   { id:'rawmeat',   name:'Сырое мясо',   type:ItemType.FOOD,     stack:2,  desc:'Подозрительное мясо',    spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:2, value:3, use:feed(10) },

  // ── Напитки ──
  water:     { id:'water',     name:'Вода',         type:ItemType.DRINK,    stack:3,  desc:'Бутылка воды',           spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE,RoomType.BATHROOM], spawnW:10, value:3, use:drink(25) },
  tea:       { id:'tea',       name:'Чай',          type:ItemType.DRINK,    stack:3,  desc:'Холодный чай',           spawnRooms:[RoomType.KITCHEN,RoomType.COMMON],  spawnW:4, value:4, use:drink(15) },
  kompot:    { id:'kompot',    name:'Компот',       type:ItemType.DRINK,    stack:2,  desc:'Мутный компот',          spawnRooms:[RoomType.KITCHEN],                  spawnW:3, value:6, use:drink(20) },

  // ── Медицина ──
  bandage:   { id:'bandage',   name:'Бинт',         type:ItemType.MEDICINE, stack:5,  desc:'Рулон бинта',            spawnRooms:[RoomType.MEDICAL,RoomType.BATHROOM],spawnW:5, value:10, use:medicine(15) },
  pills:     { id:'pills',     name:'Таблетки',     type:ItemType.MEDICINE, stack:3,  desc:'Обезболивающее. Лечит 25 HP, +5 ПСИ',   spawnRooms:[RoomType.MEDICAL],                  spawnW:3, value:20, use:psiMedicine(25, 5) },
  antidep:   { id:'antidep',   name:'Антидепрессант',type:ItemType.MEDICINE, stack:2,  desc:'Помогает с психикой. +20 ПСИ',           spawnRooms:[RoomType.MEDICAL],                  spawnW:2, value:30, use:psiMedicine(0, 20) },

  // ── Оружие (ближний бой + огнестрельное) ──
  pipe:      { id:'pipe',      name:'Труба',        type:ItemType.WEAPON,   stack:1,  desc:'Тяжёлая труба. Урон 18. Прочность 50', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:3, value:25 },
  wrench:    { id:'wrench',    name:'Ключ гаечный', type:ItemType.WEAPON,   stack:1,  desc:'Увесистый. Урон 12. Прочность 60',     spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:4, value:15 },
  knife:     { id:'knife',     name:'Нож',          type:ItemType.WEAPON,   stack:1,  desc:'Кухонный нож. Урон 8. Прочность 40',   spawnRooms:[RoomType.KITCHEN],                  spawnW:3, value:12 },
  rebar:     { id:'rebar',     name:'Арматура',     type:ItemType.WEAPON,   stack:1,  desc:'Кусок арматуры. Урон 25. Прочность 80', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:2, value:30 },
  axe:       { id:'axe',       name:'Топор',        type:ItemType.WEAPON,   stack:1,  desc:'Пожарный топор. Урон 30. Прочность 70', spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:50 },
  makarov:   { id:'makarov',   name:'Макаров',      type:ItemType.WEAPON,   stack:1,  desc:'Пистолет ПМ. Урон 20. Патроны 9мм',    spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:80 },
  shotgun:   { id:'shotgun',   name:'Обрез',        type:ItemType.WEAPON,   stack:1,  desc:'Обрез. Урон 8×6. Дробь',               spawnRooms:[RoomType.STORAGE],                  spawnW:0, value:120 },
  nailgun:   { id:'nailgun',   name:'Гвоздомёт',    type:ItemType.WEAPON,   stack:1,  desc:'Скорострельный. Урон 12. Гвозди',      spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:60 },
  ak47:      { id:'ak47',      name:'Калашников',    type:ItemType.WEAPON,   stack:1,  desc:'АК-47. Урон 25. Патроны 7.62мм. Скорострельный', spawnRooms:[], spawnW:0, value:200 },

  // ── Патроны ──
  ammo_9mm:  { id:'ammo_9mm',  name:'Патроны 9мм',  type:ItemType.AMMO,     stack:20, desc:'Патроны для Макарова',                  spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:2, value:15 },
  ammo_shells:{ id:'ammo_shells',name:'Дробь',       type:ItemType.AMMO,     stack:8,  desc:'Дробовые патроны',                     spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:20 },
  ammo_nails:{ id:'ammo_nails', name:'Гвозди',      type:ItemType.AMMO,     stack:30, desc:'Гвозди для гвоздомёта',                spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:3, value:8 },
  ammo_762:  { id:'ammo_762',   name:'Патроны 7.62',  type:ItemType.AMMO,     stack:30, desc:'Патроны для Калашникова',              spawnRooms:[RoomType.STORAGE], spawnW:0, value:20 },

  // ── Сгустки (ПСИ-руны) — экипируются как оружие, используют ПСИ ──
  psi_strike:   { id:'psi_strike',    name:'Сгусток: Пси удар',        type:ItemType.WEAPON, stack:1, desc:'Пси-снаряд. 1 ПСИ, 10 урона',                                     spawnRooms:[RoomType.MEDICAL,RoomType.OFFICE,RoomType.COMMON], spawnW:2, value:40 },
  psi_rupture:  { id:'psi_rupture',   name:'Сгусток: Разрыв',          type:ItemType.WEAPON, stack:1, desc:'Взрыв пси-энергии. 3 ПСИ, 10 урона по площади',                    spawnRooms:[RoomType.MEDICAL,RoomType.STORAGE],               spawnW:1, value:60 },
  psi_storm:    { id:'psi_storm',     name:'Сгусток: Пси буря',        type:ItemType.WEAPON, stack:1, desc:'Волна боли. 10 ПСИ, урон всем в поле зрения',                       spawnRooms:[RoomType.MEDICAL],                                spawnW:1, value:80 },
  psi_brainburn:{ id:'psi_brainburn', name:'Сгусток: Выжиг мозга',     type:ItemType.WEAPON, stack:1, desc:'Мгновенная смерть цели ≤ вашего уровня. 8 ПСИ',                     spawnRooms:[RoomType.MEDICAL],                                spawnW:0, value:100 },
  psi_madness:  { id:'psi_madness',   name:'Сгусток: Безумие',         type:ItemType.WEAPON, stack:1, desc:'Цель нападает на всех. 5 ПСИ, 60с',                                 spawnRooms:[RoomType.OFFICE,RoomType.COMMON],                 spawnW:1, value:50 },
  psi_control:  { id:'psi_control',   name:'Сгусток: Контроль',        type:ItemType.WEAPON, stack:1, desc:'Цель становится союзником. 8 ПСИ, 60с',                              spawnRooms:[RoomType.MEDICAL],                                spawnW:0, value:90 },
  psi_phase:    { id:'psi_phase',     name:'Сгусток: Фазовый сдвиг',   type:ItemType.WEAPON, stack:1, desc:'Проходить сквозь стены. 8 ПСИ, 60с',                                 spawnRooms:[RoomType.STORAGE],                                spawnW:0, value:120 },
  psi_mark:     { id:'psi_mark',      name:'Сгусток: Метка',           type:ItemType.WEAPON, stack:1, desc:'Запомнить позицию для телепорта. 3 ПСИ',                              spawnRooms:[RoomType.OFFICE,RoomType.COMMON],                 spawnW:1, value:30 },
  psi_recall:   { id:'psi_recall',    name:'Сгусток: Возврат',         type:ItemType.WEAPON, stack:1, desc:'Телепорт к метке. 3 ПСИ',                                             spawnRooms:[RoomType.OFFICE,RoomType.COMMON],                 spawnW:1, value:30 },

  // ── Инструменты и разное ──
  flashlight:{ id:'flashlight', name:'Фонарик',     type:ItemType.TOOL,     stack:1,  desc:'Процедурный круг света. Батарея: 10 игровых часов (5 минут)', spawnRooms:[RoomType.STORAGE,RoomType.LIVING,RoomType.PRODUCTION],  spawnW:2, value:120, durability:300 },
  jackhammer:{ id:'jackhammer', name:'Отбойный молоток', type:ItemType.TOOL, stack:1, desc:'Сносит стены. Сильный износ: хватает на 10 блоков', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:1, value:450, durability:10 },
  door_kit:  { id:'door_kit',   name:'Дверь комплект', type:ItemType.TOOL,   stack:1, desc:'Установка одной двери в проходе', spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:260, durability:1 },
  block_kit: { id:'block_kit',  name:'Блок комплект', type:ItemType.TOOL,    stack:1, desc:'Установка одного блока стены', spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:1, value:260, durability:1 },
  cleaning_kit:{ id:'cleaning_kit', name:'Чистящий комплект', type:ItemType.TOOL, stack:1, desc:'Зажмите R: очищает кровь/грязь в радиусе клетки и улучшает отношения', spawnRooms:[RoomType.BATHROOM,RoomType.STORAGE,RoomType.LIVING], spawnW:2, value:90, durability:240 },
  toiletpaper:{id:'toiletpaper',name:'Туал. бумага', type:ItemType.MISC,     stack:5,  desc:'Рулон',                  spawnRooms:[RoomType.BATHROOM,RoomType.STORAGE],spawnW:6, value:2 },
  cigs:      { id:'cigs',      name:'Сигареты',     type:ItemType.MISC,     stack:3,  desc:'Пачка «Прима»',          spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.SMOKING],   spawnW:4, value:8 },
  book:      { id:'book',      name:'Книга',        type:ItemType.MISC,     stack:1,  desc:'Потрёпанный том',        spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.OFFICE],   spawnW:3, value:5 },
  note:      { id:'note',      name:'Записка',      type:ItemType.NOTE,     stack:1,  desc:'Чья-то записка',         spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.STORAGE,RoomType.OFFICE], spawnW:3, value:1 },

  // ── Ключи ──
  key:       { id:'key',       name:'Ключ',         type:ItemType.KEY,      stack:1,  desc:'Подходит к двери',       spawnRooms:[],                                 spawnW:0, value:50 },

  // ── Сюжетные предметы ──
  idol_chernobog: { id:'idol_chernobog', name:'Идол Чернобога', type:ItemType.MISC, stack:1, desc:'Тёмная фигурка из неизвестного камня. Холодная на ощупь.', spawnRooms:[RoomType.COMMON,RoomType.STORAGE,RoomType.OFFICE,RoomType.SMOKING], spawnW:0, value:100 },
  strange_clot: { id:'strange_clot', name:'Странный сгусток', type:ItemType.MISC, stack:1, desc:'Тёмный пульсирующий сгусток, изъятый из теневика. Излучает холод.', spawnRooms:[], spawnW:0, value:200 },
};
