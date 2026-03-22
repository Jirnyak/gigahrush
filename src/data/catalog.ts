/* ── Game data catalogue — rooms, items, monsters, names ─────── */

import {
  RoomType, ItemType, Tex,
  type ItemDef, type Entity, type Needs,
} from '../core/types';

// ── Weapon stats registry ────────────────────────────────────────
export interface WeaponStats {
  dmg: number;
  durability: number;   // max durability for melee (0 = infinite/fists)
  range: number;        // melee reach in cells
  speed: number;        // attack cooldown seconds
  isRanged: boolean;
  ammoType?: string;    // item def id for ammo
  projSpeed?: number;   // projectile speed (cells/sec)
  pellets?: number;     // projectiles per shot (shotgun)
  spread?: number;      // spread angle in radians
  projSprite?: number;  // sprite index for projectile
}

export const WEAPON_STATS: Record<string, WeaponStats> = {
  '':       { dmg: 3,  durability: 0,  range: 1.3, speed: 0.3,  isRanged: false },
  knife:    { dmg: 8,  durability: 40, range: 1.3, speed: 0.25, isRanged: false },
  wrench:   { dmg: 12, durability: 60, range: 1.4, speed: 0.4,  isRanged: false },
  pipe:     { dmg: 18, durability: 50, range: 1.5, speed: 0.5,  isRanged: false },
  rebar:    { dmg: 25, durability: 80, range: 1.6, speed: 0.6,  isRanged: false },
  axe:      { dmg: 30, durability: 70, range: 1.5, speed: 0.7,  isRanged: false },
  makarov:  { dmg: 20, durability: 0,  range: 0,   speed: 0.4,  isRanged: true, ammoType: 'ammo_9mm',    projSpeed: 20, pellets: 1, spread: 0.02, projSprite: 22 },
  shotgun:  { dmg: 8,  durability: 0,  range: 0,   speed: 1.0,  isRanged: true, ammoType: 'ammo_shells', projSpeed: 18, pellets: 6, spread: 0.15, projSprite: 23 },
  nailgun:  { dmg: 12, durability: 0,  range: 0,   speed: 0.12, isRanged: true, ammoType: 'ammo_nails',  projSpeed: 15, pellets: 1, spread: 0.04, projSprite: 24 },
};

// ── Room definitions ─────────────────────────────────────────────
export interface RoomDef {
  type: RoomType;
  name: string;
  minW: number; maxW: number;
  minH: number; maxH: number;
  wallTex: Tex; floorTex: Tex;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  [RoomType.LIVING]:     { type: RoomType.LIVING,     name: 'Жилая',        minW:5, maxW:9,  minH:5, maxH:8,  wallTex: Tex.PANEL,     floorTex: Tex.F_WOOD },
  [RoomType.KITCHEN]:    { type: RoomType.KITCHEN,    name: 'Кухня',        minW:4, maxW:7,  minH:4, maxH:6,  wallTex: Tex.TILE_W,    floorTex: Tex.F_LINO },
  [RoomType.BATHROOM]:   { type: RoomType.BATHROOM,   name: 'Санузел',      minW:3, maxW:5,  minH:3, maxH:5,  wallTex: Tex.TILE_W,    floorTex: Tex.F_TILE },
  [RoomType.STORAGE]:    { type: RoomType.STORAGE,    name: 'Кладовая',     minW:3, maxW:6,  minH:3, maxH:6,  wallTex: Tex.CONCRETE,  floorTex: Tex.F_CONCRETE },
  [RoomType.MEDICAL]:    { type: RoomType.MEDICAL,    name: 'Медпункт',     minW:4, maxW:8,  minH:4, maxH:7,  wallTex: Tex.TILE_W,    floorTex: Tex.F_TILE },
  [RoomType.COMMON]:     { type: RoomType.COMMON,     name: 'Зал',          minW:6, maxW:14, minH:6, maxH:12, wallTex: Tex.PANEL,     floorTex: Tex.F_CARPET },
  [RoomType.PRODUCTION]: { type: RoomType.PRODUCTION, name: 'Цех',          minW:6, maxW:12, minH:6, maxH:10, wallTex: Tex.METAL,     floorTex: Tex.F_CONCRETE },
  [RoomType.CORRIDOR]:   { type: RoomType.CORRIDOR,   name: 'Коридор',      minW:2, maxW:3,  minH:8, maxH:20, wallTex: Tex.CONCRETE,  floorTex: Tex.F_LINO },
  [RoomType.SMOKING]:    { type: RoomType.SMOKING,    name: 'Курилка',      minW:3, maxW:6,  minH:3, maxH:5,  wallTex: Tex.CONCRETE,  floorTex: Tex.F_CONCRETE },
  [RoomType.OFFICE]:     { type: RoomType.OFFICE,     name: 'Бухгалтерия',  minW:4, maxW:8,  minH:4, maxH:7,  wallTex: Tex.PANEL,     floorTex: Tex.F_LINO },
};

// ── Items ────────────────────────────────────────────────────────
// heal is available for extending item effects
// function heal(hp: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); return `+${hp} здоровья`; }; }
function feed(v: number) { return (e: Entity) => { if (e.needs) e.needs.food = Math.min(100, e.needs.food + v); return 'Вы поели'; }; }
function drink(v: number) { return (e: Entity) => { if (e.needs) e.needs.water = Math.min(100, e.needs.water + v); return 'Вы попили'; }; }
function medicine(hp: number) { return (e: Entity) => { e.hp = Math.min((e.maxHp ?? 100), (e.hp ?? 0) + hp); return `Лечение +${hp}`; }; }

export const ITEMS: Record<string, ItemDef> = {
  bread:     { id:'bread',     name:'Хлеб',         type:ItemType.FOOD,     stack:5,  desc:'Чёрствый хлеб',          spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:8, value:5, use:feed(15) },
  canned:    { id:'canned',    name:'Тушёнка',      type:ItemType.FOOD,     stack:3,  desc:'Мясная консерва',        spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE], spawnW:5, value:15, use:feed(30) },
  kasha:     { id:'kasha',     name:'Каша',         type:ItemType.FOOD,     stack:3,  desc:'Холодная каша',          spawnRooms:[RoomType.KITCHEN],                  spawnW:4, value:8, use:feed(20) },
  rawmeat:   { id:'rawmeat',   name:'Сырое мясо',   type:ItemType.FOOD,     stack:2,  desc:'Подозрительное мясо',    spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:2, value:3, use:feed(10) },

  water:     { id:'water',     name:'Вода',         type:ItemType.DRINK,    stack:3,  desc:'Бутылка воды',           spawnRooms:[RoomType.KITCHEN,RoomType.STORAGE,RoomType.BATHROOM], spawnW:10, value:3, use:drink(25) },
  tea:       { id:'tea',       name:'Чай',          type:ItemType.DRINK,    stack:3,  desc:'Холодный чай',           spawnRooms:[RoomType.KITCHEN,RoomType.COMMON],  spawnW:4, value:4, use:drink(15) },
  kompot:    { id:'kompot',    name:'Компот',       type:ItemType.DRINK,    stack:2,  desc:'Мутный компот',          spawnRooms:[RoomType.KITCHEN],                  spawnW:3, value:6, use:drink(20) },

  bandage:   { id:'bandage',   name:'Бинт',         type:ItemType.MEDICINE, stack:5,  desc:'Рулон бинта',            spawnRooms:[RoomType.MEDICAL,RoomType.BATHROOM],spawnW:5, value:10, use:medicine(15) },
  pills:     { id:'pills',     name:'Таблетки',     type:ItemType.MEDICINE, stack:3,  desc:'Обезболивающее',         spawnRooms:[RoomType.MEDICAL],                  spawnW:3, value:20, use:medicine(25) },
  antidep:   { id:'antidep',   name:'Антидепрессант',type:ItemType.MEDICINE, stack:2,  desc:'Помогает с психикой',    spawnRooms:[RoomType.MEDICAL],                  spawnW:2, value:30, use:medicine(10) },

  pipe:      { id:'pipe',      name:'Труба',        type:ItemType.WEAPON,   stack:1,  desc:'Тяжёлая труба. Урон 18. Прочность 50', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:3, value:25 },
  wrench:    { id:'wrench',    name:'Ключ гаечный', type:ItemType.WEAPON,   stack:1,  desc:'Увесистый. Урон 12. Прочность 60',     spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:4, value:15 },
  knife:     { id:'knife',     name:'Нож',          type:ItemType.WEAPON,   stack:1,  desc:'Кухонный нож. Урон 8. Прочность 40',   spawnRooms:[RoomType.KITCHEN],                  spawnW:3, value:12 },
  rebar:     { id:'rebar',     name:'Арматура',     type:ItemType.WEAPON,   stack:1,  desc:'Кусок арматуры. Урон 25. Прочность 80', spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:2, value:30 },
  axe:       { id:'axe',       name:'Топор',        type:ItemType.WEAPON,   stack:1,  desc:'Пожарный топор. Урон 30. Прочность 70', spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:50 },
  makarov:   { id:'makarov',   name:'Макаров',      type:ItemType.WEAPON,   stack:1,  desc:'Пистолет ПМ. Урон 20. Патроны 9мм',    spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:80 },
  shotgun:   { id:'shotgun',   name:'Обрез',        type:ItemType.WEAPON,   stack:1,  desc:'Обрез. Урон 8×6. Дробь',               spawnRooms:[RoomType.STORAGE],                  spawnW:0, value:120 },
  nailgun:   { id:'nailgun',   name:'Гвоздомёт',    type:ItemType.WEAPON,   stack:1,  desc:'Скорострельный. Урон 12. Гвозди',      spawnRooms:[RoomType.PRODUCTION],                  spawnW:1, value:60 },

  ammo_9mm:  { id:'ammo_9mm',  name:'Патроны 9мм',  type:ItemType.AMMO,     stack:20, desc:'Патроны для Макарова',                  spawnRooms:[RoomType.STORAGE,RoomType.PRODUCTION], spawnW:2, value:15 },
  ammo_shells:{ id:'ammo_shells',name:'Дробь',       type:ItemType.AMMO,     stack:8,  desc:'Дробовые патроны',                     spawnRooms:[RoomType.STORAGE],                  spawnW:1, value:20 },
  ammo_nails:{ id:'ammo_nails', name:'Гвозди',      type:ItemType.AMMO,     stack:30, desc:'Гвозди для гвоздомёта',                spawnRooms:[RoomType.PRODUCTION,RoomType.STORAGE], spawnW:3, value:8 },

  flashlight:{ id:'flashlight', name:'Фонарик',     type:ItemType.TOOL,     stack:1,  desc:'Освещает путь',          spawnRooms:[RoomType.STORAGE,RoomType.LIVING],  spawnW:2, value:35 },
  toiletpaper:{id:'toiletpaper',name:'Туал. бумага', type:ItemType.MISC,     stack:5,  desc:'Рулон',                  spawnRooms:[RoomType.BATHROOM,RoomType.STORAGE],spawnW:6, value:2 },
  cigs:      { id:'cigs',      name:'Сигареты',     type:ItemType.MISC,     stack:3,  desc:'Пачка «Прима»',          spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.SMOKING],   spawnW:4, value:8 },
  book:      { id:'book',      name:'Книга',        type:ItemType.MISC,     stack:1,  desc:'Потрёпанный том',        spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.OFFICE],   spawnW:3, value:5 },
  note:      { id:'note',      name:'Записка',      type:ItemType.NOTE,     stack:1,  desc:'Чья-то записка',         spawnRooms:[RoomType.LIVING,RoomType.COMMON,RoomType.STORAGE,RoomType.OFFICE], spawnW:3, value:1 },

  key:       { id:'key',       name:'Ключ',         type:ItemType.KEY,      stack:1,  desc:'Подходит к двери',       spawnRooms:[],                                 spawnW:0, value:50 },
};

export const WEAPON_DMG: Record<string, number> = {
  pipe: 18, wrench: 12, knife: 8, rebar: 25, axe: 30,
  makarov: 20, shotgun: 8, nailgun: 12, '': 3,
};

// ── Monsters ─────────────────────────────────────────────────────
// Monster definitions now live in src/entities/ (per-monster files).
// Re-export from the central monster registry for backward compat.
export { MONSTERS, type MonsterDef } from '../entities/monster';

// ── NPC names ────────────────────────────────────────────────────
const FIRST_M = ['Иван','Пётр','Алексей','Дмитрий','Сергей','Андрей','Николай','Михаил','Виктор','Олег','Григорий','Борис','Фёдор','Геннадий','Валерий','Юрий','Анатолий','Владимир','Константин','Евгений'];
const FIRST_F = ['Мария','Анна','Елена','Ольга','Наталья','Татьяна','Ирина','Светлана','Людмила','Галина','Нина','Валентина','Екатерина','Лариса','Тамара','Зинаида','Раиса','Вера','Надежда','Любовь'];
const LAST = ['Иванов','Петров','Сидоров','Кузнецов','Попов','Васильев','Соколов','Михайлов','Новиков','Фёдоров','Морозов','Волков','Алексеев','Лебедев','Семёнов','Егоров','Павлов','Козлов','Степанов','Орлов'];

export function randomName(): string {
  const male = Math.random() < 0.5;
  const first = male ? FIRST_M : FIRST_F;
  const last = LAST[Math.floor(Math.random() * LAST.length)];
  const suffix = male ? '' : 'а';
  return `${first[Math.floor(Math.random() * first.length)]} ${last}${suffix}`;
}

// ── Lore notes ───────────────────────────────────────────────────
export const NOTES = [
  'Стены дышат. Я слышу как бетон стонет ночью.',
  'Не ходите в коридоры после самосбора. Они голодны.',
  'Дверь закрыта. Ключ проглочен стеной. Мы заперты.',
  'Этажей нет. Есть только бесконечный лабиринт из комнат.',
  'Я видел свою квартиру в другом конце. Там жил кто-то другой. С МОИМ лицом.',
  'Бетонник не атакует если не двигаться. Наврали. Он просто медленный.',
  'Запас еды тает. Кухня перестроилась. Консервы вросли в стену.',
  'Самосбор — не землетрясение. Это ХРУЩ переваривает сам себя.',
  'Они выходят из стен. Буквально. Бетон расступается и закрывается за ними.',
  'Мой сосед ушёл за водой два самосбора назад. Коридор, по которому он шёл, больше не существует.',
  'Если слышишь скрежет — беги в комнату и закрой дверь. Герметично.',
  'Мы считали этажи. Их нет. Только тор. Бесконечный серый тор.',
  'Кто-то нашёл выход. Вернулся через стену с другой стороны.',
  'Записка: «НЕ СПАТЬ В КОРИДОРАХ»',
  'Ползун не видит. Он чувствует вибрации. Замри.',
];

// ── Helper: make fresh needs ─────────────────────────────────────
export function freshNeeds(): Needs {
  return { food: 70 + Math.random() * 30, water: 70 + Math.random() * 30, sleep: 60 + Math.random() * 40, pee: Math.random() * 30, poo: Math.random() * 20 };
}
