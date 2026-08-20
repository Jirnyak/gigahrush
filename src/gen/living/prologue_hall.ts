/* ── Разборный зал: сцена-пролог жилого этажа ──────────────────────
 *
 * Большой зал в стороне от Актового: сюда сносят то, что осталось после
 * самосбора, и здесь взвод ликвидаторов разбирает последствия. Игрок этого
 * не видит своими глазами — он в сорока клетках отсюда, — но мир не ждёт его
 * взгляда, чтобы случиться.
 *
 * Сцена ставит людей и наводит камеру. Дальше ничего не поставлено: Стрелок
 * меняет фракцию, и бой идёт по обычным правилам. Полковник гибнет потому,
 * что против него стволы сотого уровня, а не потому, что так написано в такте.
 * Он может и выжить — тогда сцена закончится по своему потолку, а этаж
 * останется с живым полковником и мёртвым взводом. Это допустимый исход.
 *
 * ЧЕРНОВИК РЕЧИ. Все `text` ниже — рабочая заглушка в тоне канона, помечена
 * DRAFT. Финальные реплики приходят от внешнего сценариста
 * (`scenarist.md`, Закон Внешнего Сценариста) и заменяют их построчно.
 */

import {
  Cell,
  Faction,
  Occupation,
  RoomType,
  Tex,
  W,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { designNpcFloorKey, registerFloorSideQuest, type PlotNpcDef } from '../../data/plot';
import { registerFloorScene } from '../../systems/cinematics';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import { applyNamedRoom, findNamedRoom } from '../named_rooms';
import { connectProtectedRoom, protectRoom, stampRoom } from '../shared';
import { LIVING_NAMED_ROOMS } from './rooms';

export const PROLOGUE_HALL_ALIAS = 'prologue_hall' as const;
export const PROLOGUE_SCENE_ID = 'living_prologue' as const;
export const PROLOGUE_COLONEL_ID = 'prologue_colonel' as const;
export const STRELOK_ID = 'strelok' as const;
const LIVING_FLOOR_KEY = designNpcFloorKey('living');

const HALL_W = 20;
const HALL_H = 14;
/** Насколько зал отнесён от Актового: столько камера и летит. */
const HALL_DISTANCE = 40;
/** Сколько свободных клеток и в какой рамке нужно рядом, чтобы зал не замуровало. */
const HALL_APPROACH_CELLS = 6;
const HALL_APPROACH_RING = 6;
/** Докуда расширять поиск места, если рядом с сороковой клеткой выхода нет. */
const HALL_SEARCH_REACH = 220;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Запас чистых клеток вокруг зала: по нему потом пойдёт проход наружу. */
const HALL_CLEARANCE = 3;

/* ── Люди ────────────────────────────────────────────────────── */

const COLONEL_DEF: PlotNpcDef = {
  name: 'Полковник Гаревой',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 260,
  maxHp: 260,
  money: 180,
  speed: 1.0,
  // Со стволом, и не для урона: безоружный NPC видит на 8 клеток, вооружённый —
  // на дальность своего оружия. Полковник без пистолета просто не замечал
  // происходящего в другом конце собственного зала.
  weapon: 'makarov',
  inventory: [
    { defId: 'bandage', count: 3 },
    { defId: 'ammo_9mm', count: 24 },
    { defId: 'liquidator_token', count: 2 },
  ],
  // DRAFT — заменяется пакетом сценариста.
  talkLines: [
    'Разбор идёт по описи. Что вынесли — то и записано, остальное осталось за дверью.',
    'После отбоя первым в коридор идёт не смелый, а тот, у кого фильтр целый.',
  ],
  talkLinesPost: [
    'Зал закрыт. Дальше по этажу ходи с оглядкой.',
  ],
  talkQuestResponse: 'Принял. Стой, где стоишь, и не мешай разбору.',
};

const STRELOK_DEF: PlotNpcDef = {
  name: 'Стрелок',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 900,
  maxHp: 900,
  money: 0,
  speed: 1.35,
  weapon: 'ak47',
  inventory: [
    { defId: 'bandage', count: 4 },
    { defId: 'ammo_762', count: 120 },
  ],
  // DRAFT — заменяется пакетом сценариста. Ничего про Пустоту и Творца
  // (`scenarist.md:148`): до раскрытия он просто человек с чужим приказом.
  talkLines: [
    'Считать умеют все. Немногие умеют не считать вслух.',
  ],
  talkLinesPost: [
    'Меня тут не было.',
  ],
  talkQuestResponse: 'Не сейчас.',
};

registerFloorSideQuest(LIVING_FLOOR_KEY, PROLOGUE_COLONEL_ID, COLONEL_DEF, [], [
  'living', 'liquidator', 'prologue',
]);
registerFloorSideQuest(LIVING_FLOOR_KEY, STRELOK_ID, STRELOK_DEF, [], [
  'living', 'liquidator', 'prologue', 'antagonist',
]);

/* ── Зал ─────────────────────────────────────────────────────── */

/**
 * Годится ли место под зал. Мало не задеть чужие квартиры — рядом обязан быть
 * коридор, иначе зал встанет глухим блоком посреди жилого массива.
 *
 * Так и случалось: `connectProtectedRoom` ищет свободный пол не дальше тридцати
 * клеток и, не найдя, молча оставляет комнату без единого проёма. Зал получался
 * замурован — недостижим для игрока и без дороги для камеры, отчего та летела к
 * нему напрямую, то есть сквозь стены.
 */

/**
 * Место для зала: ровно `HALL_DISTANCE` клеток от Актового по случайному
 * направлению, дальше — расходящийся поиск. Возврат безусловный: комната
 * объявлена в таблице этажа, и `assertNamedRooms` не простит недорытого.
 */
/**
 * Принадлежит ли клетка настоящему ЖИЛЬЮ. `aptMask` шире: им помечают и рамки
 * защищённых POI, и служебные комнаты. Резать поверх такого можно — квартиру
 * нельзя, это чужой дом.
 */
function isApartmentCell(world: World, ci: number): boolean {
  if (!world.aptMask[ci]) return false;
  const roomId = world.roomMap[ci];
  if (roomId === undefined || roomId < 0) return false;
  return (world.rooms[roomId]?.apartmentId ?? -1) >= 0;
}

/** Что достижимо пешком от стартовой комнаты. */
function reachableFromStart(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  const start = findNamedRoom(world, 'tutor_hall');
  if (!start) return mask;
  const queue = [world.idx(world.wrap(start.x + Math.floor(start.w / 2)), world.wrap(start.y + Math.floor(start.h / 2)))];
  mask[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const ci = queue[head];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = world.wrap(x + dx);
      const ny = world.wrap(y + dy);
      const ni = world.idx(nx, ny);
      if (mask[ni] || world.solid(nx, ny)) continue;
      mask[ni] = 1;
      queue.push(ni);
    }
  }
  return mask;
}

/**
 * Не задевает ли зал чужие квартиры — вместе с запасом на подход.
 *
 * Мало проверить сам прямоугольник: `protectRoom` пометит рамку зала своей, и
 * если сразу за ней начинается жильё, прокопу некуда идти — сквозь квартиры
 * резать нельзя. Так зал и оказывался замурован в кольце соседей.
 */
function freeOfApartments(world: World, rx: number, ry: number): boolean {
  for (let dy = -HALL_CLEARANCE; dy <= HALL_H - 1 + HALL_CLEARANCE; dy++) {
    for (let dx = -HALL_CLEARANCE; dx <= HALL_W - 1 + HALL_CLEARANCE; dx++) {
      if (world.aptMask[world.idx(rx + dx, ry + dy)]) return false;
    }
  }
  return true;
}

/**
 * Место для зала: достижимая клетка примерно в `HALL_DISTANCE` от Актового,
 * вокруг которой помещается прямоугольник, не задевающий чужие квартиры.
 *
 * Раньше место искалось вслепую по азимуту, а связность добывалась потом —
 * проёмом или прокопом. На трети этажей это не удавалось, и зал вставал глухим
 * блоком: игрок в него не попадал, камера дороги не находила и летела напрямую,
 * то есть сквозь стены. Теперь наоборот: сначала связное место, потом стройка.
 */
function findHallOrigin(world: World, reachable: Uint8Array): { x: number; y: number } {
  const start = findNamedRoom(world, 'tutor_hall');
  const fromX = start ? start.x + Math.floor(start.w / 2) : Math.floor(W / 2);
  const fromY = start ? start.y + Math.floor(start.h / 2) : Math.floor(W / 2);
  const bearing = rng() * Math.PI * 2;

  let fallback: { x: number; y: number } | null = null;
  for (let ring = 0; ring <= HALL_SEARCH_REACH; ring += 2) {
    for (let step = 0; step < 32; step++) {
      const angle = bearing + (step / 32) * Math.PI * 2;
      const reach = HALL_DISTANCE + ring;
      const cx = world.wrap(fromX + Math.round(Math.cos(angle) * reach));
      const cy = world.wrap(fromY + Math.round(Math.sin(angle) * reach));
      // Якорь обязан быть уже связан с миром — тогда зал строится вокруг живого
      // коридора, а не рядом с ним.
      if (!reachable[world.idx(cx, cy)]) continue;
      const x = world.wrap(cx - Math.floor(HALL_W / 2));
      const y = world.wrap(cy - Math.floor(HALL_H / 2));
      if (!freeOfApartments(world, x, y)) continue;
      if (!fallback) fallback = { x, y };
      if (countReachableAround(world, x, y, reachable) >= HALL_APPROACH_CELLS) return { x, y };
    }
  }
  return fallback ?? { x: world.wrap(fromX + HALL_DISTANCE), y: world.wrap(fromY - Math.floor(HALL_H / 2)) };
}

/** Сколько связанных с миром клеток лежит в рамке вокруг будущих стен. */
function countReachableAround(world: World, rx: number, ry: number, reachable: Uint8Array): number {
  let found = 0;
  for (let ring = 1; ring <= HALL_APPROACH_RING; ring++) {
    for (let dx = -ring; dx <= HALL_W - 1 + ring; dx++) {
      for (const dy of [-ring, HALL_H - 1 + ring]) {
        if (reachable[world.idx(rx + dx, ry + dy)]) found++;
      }
    }
    for (let dy = -ring; dy <= HALL_H - 1 + ring; dy++) {
      for (const dx of [-ring, HALL_W - 1 + ring]) {
        if (reachable[world.idx(rx + dx, ry + dy)]) found++;
      }
    }
    if (found >= HALL_APPROACH_CELLS) break;
  }
  return found;
}

/** Следы отбоя: кровь по полу. Тел не остаётся — их в игре нет, остаётся то, что впиталось. */
function stainHall(world: World, rx: number, ry: number): void {
  for (let i = 0; i < 14; i++) {
    const x = rx + 1 + Math.floor(rng() * (HALL_W - 2));
    const y = ry + 1 + Math.floor(rng() * (HALL_H - 2));
    const radius = 1.2 + rng() * 2.6;
    stampSurfaceSplat(world, x, y, 0.5, 0.5, radius, 0.3 + rng() * 0.3, 17100 + i, 92, 16, 18, false);
  }
  for (let i = 0; i < 5; i++) {
    const x = rx + 2 + Math.floor(rng() * (HALL_W - 4));
    const y = ry + 2 + Math.floor(rng() * (HALL_H - 4));
    stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.9 + rng() * 1.1, 0.2, 17200 + i, 46, 40, 34, false);
  }
  world.markFloorTexDirty();
}

/**
 * Прокопать зал к остальному этажу, если общий соединитель не справился.
 *
 * `connectProtectedRoom` пробивает один проём в ближайший коридор и ищет его не
 * дальше тридцати клеток. В глухом жилом массиве этого не хватает, и зал
 * оставался замурованным: недостижимым для игрока и без дороги для камеры,
 * из-за чего та летела к нему напрямую — сквозь стены.
 *
 * Поэтому здесь честная проверка достижимости от стартовой комнаты и, если её
 * нет, прокоп волной: ищем кратчайшую цепочку клеток от зала до уже достижимого
 * пространства, идя ТОЛЬКО по тем клеткам, которые копать можно. Чужие квартиры
 * (`aptMask`) непроходимы для этой волны — их бульдозерить нельзя.
 */
function ensureHallReachable(world: World, hx: number, hy: number): void {
  // Маску считаем ЗАНОВО, уже по вырытому залу. Прежняя, снятая до постройки,
  // помнила на этом месте коридор и уверяла, что всё достижимо, — из-за чего
  // прокоп молча не выполнялся ни разу.
  const reachable = reachableFromStart(world);
  const inside = world.idx(world.wrap(hx + 1), world.wrap(hy + 1));
  if (reachable[inside]) return;

  // Волна от зала по копаемым клеткам до первой достижимой.
  const prev = new Int32Array(W * W).fill(-1);
  const seen = new Uint8Array(W * W);
  // Волна стартует с кольца СНАРУЖИ стен зала. Изнутри она не вышла бы: рамку
  // зала только что пометил своей `protectRoom`, а защищённые клетки волна не
  // трогает — и упиралась в собственную защиту, так и не начав копать.
  const dig: number[] = [];
  for (let dx = -1; dx <= HALL_W; dx++) {
    for (const dy of [-1, HALL_H]) {
      const ci = world.idx(world.wrap(hx + dx), world.wrap(hy + dy));
      if (!seen[ci]) { seen[ci] = 1; dig.push(ci); }
    }
  }
  for (let dy = -1; dy <= HALL_H; dy++) {
    for (const dx of [-1, HALL_W]) {
      const ci = world.idx(world.wrap(hx + dx), world.wrap(hy + dy));
      if (!seen[ci]) { seen[ci] = 1; dig.push(ci); }
    }
  }
  let hit = -1;
  for (let head = 0; head < dig.length && hit < 0; head++) {
    const ci = dig[head];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = world.wrap(x + dx);
      const ny = world.wrap(y + dy);
      const ni = world.idx(nx, ny);
      if (seen[ni]) continue;
      // Неприкосновенны настоящие квартиры и лифты. Прочая защищённая клетка —
      // это чей-то POI или рамка соседней комнаты: резать поверх такого не жалко,
      // а вот жильё трогать нельзя.
      if (isApartmentCell(world, ni) || world.cells[ni] === Cell.LIFT) continue;
      seen[ni] = 1;
      prev[ni] = ci;
      if (reachable[ni]) { hit = ni; break; }
      dig.push(ni);
    }
  }
  if (hit < 0) {
    // Волна не выбралась: зал в кольце чужих квартир. Тогда режем напрямую к
    // стартовой комнате, снося всё на линии, кроме самих квартир и лифтов —
    // перестроить коридор не жалко, чужое жильё трогать нельзя.
    carveStraightApproach(world, hx, hy);
    return;
  }
  // Проём в стене зала: цепочка ведёт снаружи, а войти внутрь ещё нужно.
  const firstOutside = (() => { let ci = hit; while (prev[ci] >= 0) ci = prev[ci]; return ci; })();
  {
    const x = firstOutside % W;
    const y = (firstOutside / W) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = world.wrap(x + dx);
      const ny = world.wrap(y + dy);
      const inHall = ((nx - hx + W) % W) < HALL_W && ((ny - hy + W) % W) < HALL_H;
      if (!inHall) continue;
      const ni = world.idx(nx, ny);
      if (world.cells[ni] === Cell.WALL) { world.cells[ni] = Cell.FLOOR; world.floorTex[ni] = Tex.F_CONCRETE; }
      world.aptMask[firstOutside] = 0;
      break;
    }
  }
  // Ширина в две клетки: коридор в одну проходим глазом, но не всегда проходим
  // субклеточной навигацией, и маршрута для камеры снова не находится.
  for (let ci = prev[hit]; ci >= 0; ci = prev[ci]) {
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]] as const) {
      const wi = world.idx(world.wrap(x + dx), world.wrap(y + dy));
      if (isApartmentCell(world, wi) || world.cells[wi] === Cell.LIFT) continue;
      world.aptMask[wi] = 0;
      if (world.cells[wi] === Cell.WALL) {
        world.cells[wi] = Cell.FLOOR;
        world.floorTex[wi] = Tex.F_CONCRETE;
      }
    }
  }
  world.markCellsDirty();
}

/** Прямой прорез от зала к стартовой комнате: последняя мера, когда обхода нет. */
function carveStraightApproach(world: World, hx: number, hy: number): void {
  const start = findNamedRoom(world, 'tutor_hall');
  if (!start) return;
  let x = world.wrap(hx + Math.floor(HALL_W / 2));
  let y = world.wrap(hy + Math.floor(HALL_H / 2));
  const tx = world.wrap(start.x + Math.floor(start.w / 2));
  const ty = world.wrap(start.y + Math.floor(start.h / 2));
  for (let guard = 0; guard < W && (x !== tx || y !== ty); guard++) {
    const dx = world.delta(x, tx);
    const dy = world.delta(y, ty);
    if (Math.abs(dx) >= Math.abs(dy)) x = world.wrap(x + Math.sign(dx));
    else y = world.wrap(y + Math.sign(dy));
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]] as const) {
      const ci = world.idx(world.wrap(x + ox), world.wrap(y + oy));
      if (isApartmentCell(world, ci) || world.cells[ci] === Cell.LIFT) continue;
      if (world.cells[ci] !== Cell.FLOOR) {
        world.cells[ci] = Cell.FLOOR;
        world.floorTex[ci] = Tex.F_CONCRETE;
      }
      world.aptMask[ci] = 0;
    }
  }
  world.markCellsDirty();
}

/**
 * Вырыть зал. Зовётся из генератора жилого ПОСЛЕ лабиринта: `connectProtectedRoom`
 * ищет готовые коридоры, а до них соединять не с чем.
 */
export function carvePrologueHall(world: World, nextRoomId: number): void {
  const reachable = reachableFromStart(world);
  const at = findHallOrigin(world, reachable);
  const room = stampRoom(world, nextRoomId, RoomType.COMMON, at.x, at.y, HALL_W, HALL_H, -1);
  applyNamedRoom(room, PROLOGUE_HALL_ALIAS, LIVING_NAMED_ROOMS[PROLOGUE_HALL_ALIAS]);
  protectRoom(world, at.x, at.y, HALL_W, HALL_H, Tex.CONCRETE, Tex.CONCRETE);
  connectProtectedRoom(world, at.x, at.y, HALL_W, HALL_H);
  ensureHallReachable(world, at.x, at.y);
  stainHall(world, at.x, at.y);
}

/* ── Сцена ───────────────────────────────────────────────────── */

const COLONEL_VOICE = '#cfd8c8';
const STRELOK_VOICE = '#c8a66a';

registerFloorScene({
  id: PROLOGUE_SCENE_ID,
  floorKey: LIVING_FLOOR_KEY,
  anchorRoomAlias: PROLOGUE_HALL_ALIAS,
  /* Первый приход на жилой за прогон — то есть первые секунды новой игры, ещё до
   * первого слова Ольги. Отладочный повтор — команда «СЦЕНА: запустить по id».
   * Реестр принимает и `{ kind: 'event', eventType, tag }`, если сцену когда-нибудь
   * захочется отдать сюжетному шагу. */
  trigger: { kind: 'first_visit' },
  // Бой на сотню человек идёт дольше, чем разговор: потолок держит верхнюю границу.
  maxSeconds: 210,
  actors: [
    { role: 'colonel', packageId: PROLOGUE_COLONEL_ID, ox: -3, oy: 0 },
    { role: 'strelok', packageId: STRELOK_ID, ox: 4, oy: 0 },
    // Взвод и будущие перебежчики стоят ВПЕРЕМЕШКУ и в одинаковой форме: до
    // такта `defect` их не отличить, и в этом весь смысл внезапного предательства.
    {
      role: 'platoon',
      count: 26,
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      level: 6,
      ox: -4,
      oy: 1,
      spread: 7,
    },
    // Оценивать урон сходятся не только по службе: зал полон соседей.
    {
      role: 'cleaners',
      count: 16,
      faction: Faction.CITIZEN,
      occupation: Occupation.CLEANER,
      level: 2,
      ox: -7,
      oy: -4,
      spread: 6,
    },
    {
      role: 'onlookers',
      count: 14,
      faction: Faction.CITIZEN,
      occupation: Occupation.HOUSEWIFE,
      level: 1,
      ox: 1,
      oy: 5,
      spread: 6,
    },
    // Половина взвода. Стрелка с горсткой людей просто задавили числом —
    // предательство должно раскалывать зал пополам, а не быть вылазкой меньшинства.
    {
      role: 'traitors',
      count: 26,
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      level: 40,
      ox: -2,
      oy: 1,
      spread: 7,
    },
    {
      role: 'wild',
      count: 16,
      faction: Faction.WILD,
      source: 'alife',
      // За краем зала, но в пределах видимости боя: на двадцати пяти клетках они
      // не заметили бы никого и простояли бы всю драку в соседнем коридоре.
      ox: 13,
      oy: -5,
      spread: 5,
      deferred: true,
    },
  ],
  beats: [
    // Дорога до зала идёт коридорами и вдвое длиннее прямой: без запаса по
    // скорости зритель полминуты смотрит на бетон.
    { kind: 'fly', to: { ox: -8, oy: -5 }, look: { role: 'colonel' }, speed: 22, height: 0.95 },
    { kind: 'orbit', around: { role: 'platoon' }, radius: 7, speed: 0.28, height: 0.95, seconds: 7 },

    { kind: 'say', role: 'colonel', text: 'Разбор по описи. Кто нашёл — тот и назвал, остальное за дверью.', color: COLONEL_VOICE },
    { kind: 'say', role: 'colonel', text: 'Второй взвод — на трубу. Фильтры проверить до того, как полезете.', color: COLONEL_VOICE },
    { kind: 'fly', to: { ox: 8, oy: -4 }, look: { role: 'strelok' }, speed: 5, height: 0.72 },
    { kind: 'say', role: 'strelok', text: 'Опись хорошая. Только считает не тех.', color: STRELOK_VOICE },
    { kind: 'say', role: 'colonel', text: 'Стрелок. Встал в строй.', color: COLONEL_VOICE },
    { kind: 'say', role: 'strelok', text: 'Уже стою. Просто не в вашем.', color: STRELOK_VOICE },

    // Предательство: смена стороны. Кто в кого стреляет, решает матрица отношений.
    { kind: 'defect', roles: ['strelok', 'traitors'], faction: Faction.WILD, playerRelation: -90 },
    { kind: 'materialize', role: 'wild' },
    { kind: 'log', text: 'Где-то в соседнем коридоре разом стало людно.', color: '#8a7' },
    // Поводок снят: до этой строки зал был декорацией, дальше он живёт сам.
    { kind: 'release' },

    { kind: 'orbit', around: { role: 'colonel' }, radius: 6, speed: -0.4, height: 0.9, seconds: 5 },
    { kind: 'awaitDeath', role: 'colonel', timeout: 90 },

    { kind: 'fly', to: { ox: 2, oy: -3 }, look: { role: 'strelok' }, speed: 4, height: 0.62 },
    { kind: 'say', role: 'strelok', text: 'Опись закрыта. Подписывать некому.', color: STRELOK_VOICE },
    { kind: 'say', role: 'strelok', text: 'Приберите. И передайте: считать я приду сам.', color: STRELOK_VOICE },
    { kind: 'orbit', around: { role: 'strelok' }, radius: 4, speed: 0.5, height: 0.95, seconds: 5 },

    // Уходят живыми: запись A-Life переезжает, смерть не пишется.
    { kind: 'depart', roles: ['strelok', 'traitors', 'wild'], toFloorKey: designNpcFloorKey('maintenance') },
    { kind: 'pause', seconds: 2 },
  ],
});
