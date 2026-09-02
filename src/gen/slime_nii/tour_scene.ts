/* ── Экскурсия по НИИ слизи — сцена первого визита ────────────────
 *
 * Игрок выходит из верхнего санитарного шлюза, и институт показывает себя сам:
 * главный зал со сменой в халатах, длинная западная галерея и четыре гермокамеры
 * вдоль неё. Кадр едет коридорами, заглядывает в две камеры и возвращается в зал.
 * Это работающее учреждение с вытяжкой, светом и журналом, а не руины — и именно
 * поэтому то, что шевелится за гермой, читается как содержимое, а не как засада.
 *
 * Своего кода у сцены нет: она объявляет актёров и такты, отыгрывает общий
 * проигрыватель (`cutscene.md`). Тварей сцена берёт видами из общего реестра и
 * НИКОГДА не отпускает: такта `release` здесь нет вовсе, и это единственное, что
 * отделяет экскурсию от нападения. Обе камеры, куда заходит кадр, стоят на герме
 * (`DoorState.HERMETIC_CLOSED`), то есть по концу сцены отпущенные проигрывателем
 * твари остаются взаперти — путь через гермодверь закрыт и для них.
 *
 * Геометрию галереи рвёт сам этаж (`index.ts`, `buildCameraGallery`) по цифрам
 * ниже; она же связывает четыре западные камеры в одну линию и для игрока.
 *
 * ЧЕРНОВИК РЕЧИ. Реплики — рабочая заглушка в тоне канона, помечена DRAFT.
 */

import { Faction, MonsterKind, Occupation, W } from '../../core/types';
import { designNpcFloorKey } from '../../data/plot';
import { registerFloorScene } from '../../systems/cinematics';

export const SLIME_NII_TOUR_SCENE_ID = 'slime_nii_institute_tour' as const;
/** Комната-якорь: верхний санитарный шлюз, он же место высадки игрока. */
export const SLIME_NII_ENTRY_ANCHOR = 'slime_nii_entry_lock' as const;
export const SLIME_NII_GALLERY_ANCHOR = 'slime_nii_west_gallery' as const;
/* Чистая лаборатория зелёной пробы — дом Олевии Кибер. Псевдонимы комнат НИИ
 * живут здесь все вместе: файл — лист графа импортов, и на него одинаково
 * смотрят и `index.ts`, который роет комнаты, и `olevia.ts`, который на них
 * ссылается. Обе стороны обязаны читать одну строку, иначе анкета снова
 * объявит дом, которого нет. */
export const SLIME_NII_CLEAN_LAB_ANCHOR = 'slime_nii_clean_lab' as const;

const SLIME_NII_FLOOR_KEY = designNpcFloorKey('slime_nii');

const CX = W >> 1;
const CY = W >> 1;

/* ── Цифры этажа ─────────────────────────────────────────────────
 *
 * Те же, по которым `buildRooms` ставит шлюз и западную батарею камер. Смещения
 * точек кадра считаются от них, а не от вкуса, и замок теста сверяет обе стороны:
 * промахнувшийся кадр не падает, он просто снимает не то.
 */
const ANCHOR_X = CX;
const ANCHOR_Y = CY + 176;
const CAMERA_BANK_X = CX - 236;
const CAMERA_BANK_W = 30;
const CAMERA_BANK_H = 22;
/** Ряды дверей западных камер: середина каждой камеры по высоте. */
export const CAMERA_ROWS = [CY - 38, CY, CY + 38, CY + 76].map(y => y + (CAMERA_BANK_H >> 1));

/** Галерея стоит вплотную к дверям камер: их восточная стена — её западная. */
export const GALLERY_X = CAMERA_BANK_X + CAMERA_BANK_W + 1;
export const GALLERY_W = 7;

const GALLERY_MID_X = GALLERY_X + (GALLERY_W >> 1);
const CHAMBER_MID_X = CAMERA_BANK_X + (CAMERA_BANK_W >> 1);
const CHAMBER_DOOR_X = CAMERA_BANK_X + CAMERA_BANK_W;

/** Точка кадра по абсолютным координатам этажа: этаж авторится ими, а не смещениями. */
function at(x: number, y: number): { ox: number; oy: number } {
  return { ox: x - ANCHOR_X, oy: y - ANCHOR_Y };
}

/* Главный зал: 184x102 от (420,504). Кадр входит с юга — там дверь из шлюза. */
const HALL_SOUTH = at(CX, CY + 80);
const HALL_MID = at(CX, CY + 48);
const GUIDE_POST = at(CX, CY + 44);
const STAFF_POST = at(CX, CY + 36);
const SHIFT_POST = at(CX + 24, CY + 54);

/** Подлёт к галерее: последняя клетка коридора первой камеры, откуда виден вход. */
const SPUR_APPROACH = at(GALLERY_MID_X + 26, CAMERA_ROWS[0]);
const GALLERY_ROW = CAMERA_ROWS.map(y => at(GALLERY_MID_X, y));
const CHAMBER = CAMERA_ROWS.map(y => at(CHAMBER_MID_X, y));
const CHAMBER_DOOR = CAMERA_ROWS.map(y => at(CHAMBER_DOOR_X, y));
const WATCH_POST = at(GALLERY_MID_X, CAMERA_ROWS[0] + 11);

/* Облёт внутри камеры 30x22: половина меньшей стороны минус клетка — это десять,
 * и четыре дают близкий кадр без скрёба по герме. */
const CHAMBER_ORBIT = 4;
const HALL_ORBIT = 5;

const DIRECTOR_VOICE = '#cfe0d8';
const STAFF_VOICE = '#c9d3c0';
const GUARD_VOICE = '#d8c9a8';

registerFloorScene({
  id: SLIME_NII_TOUR_SCENE_ID,
  floorKey: SLIME_NII_FLOOR_KEY,
  anchorRoomAlias: SLIME_NII_ENTRY_ANCHOR,
  trigger: { kind: 'first_visit' },
  /* Потолок с запасом: экскурсия укладывается примерно в две с половиной минуты,
   * но дорога камеры коридорами бывает вчетверо длиннее прямой, а упереться в
   * потолок значит потерять возвращение в зал и последнюю реплику. Это
   * предохранитель, а не темп: темп держат скорости пролётов. */
  maxSeconds: 210,
  actors: [
    /* Ведёт директор института — она здесь живёт и говорит своим голосом. Сцена
     * её не создаёт, а зовёт: пакет NPC уже стоит в кабинете протоколов. */
    { role: 'guide', packageId: 'slime_nii_director_larisa', ...GUIDE_POST },

    // Смена в халатах: институт обязан читаться работающим, а не законсервированным.
    {
      role: 'staff',
      count: 12,
      faction: Faction.SCIENTIST,
      occupation: Occupation.SCIENTIST,
      level: 3,
      ...STAFF_POST,
      spread: 14,
    },
    // Быт рядом с наукой: уборка идёт своим чередом, пока учёные говорят.
    {
      role: 'shift',
      count: 6,
      faction: Faction.CITIZEN,
      occupation: Occupation.CLEANER,
      level: 1,
      ...SHIFT_POST,
      spread: 8,
    },

    // Галерея: смотритель у входа и карантинная охрана у камеры на ключе.
    {
      role: 'watch',
      count: 3,
      faction: Faction.SCIENTIST,
      occupation: Occupation.DOCTOR,
      level: 4,
      ...WATCH_POST,
      spread: 2,
    },
    {
      role: 'guard',
      count: 2,
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      level: 7,
      ...GALLERY_ROW[2],
      spread: 2,
    },

    /* Содержимое камер. Виды — из общего реестра и из профиля этажа, поведения у
     * них своего нет. Обе камеры на герме: `release` здесь не будет ни одного
     * такта, а по концу сцены проигрыватель отпускает всех сам — и отпущенная
     * тварь остаётся ровно там, где стояла, потому что гермодверь непроходима
     * и для неё. */
    {
      role: 'box_north',
      monster: MonsterKind.SLIMEVIK,
      count: 2,
      level: 3,
      ...CHAMBER[0],
      spread: 3,
    },
    {
      role: 'box_south',
      monster: MonsterKind.CHERNOSLIZ,
      count: 1,
      level: 4,
      ...CHAMBER[3],
      spread: 2,
    },
  ],
  beats: [
    // Подлёт из шлюза в главный зал: без `look`, кадр смотрит по курсу и
    // поворачивает вместе с коридором.
    { kind: 'fly', to: HALL_SOUTH, speed: 18, height: 1.3 },
    // Короткий проход над залом — уже с прицелом на директора.
    { kind: 'fly', to: HALL_MID, look: { role: 'guide' }, speed: 6, height: 1.7 },

    // DRAFT
    { kind: 'say', role: 'guide', text: 'Институт работает. Вытяжка, свет, смена — всё по расписанию.', color: DIRECTOR_VOICE },
    { kind: 'orbit', around: { speaker: true }, radius: HALL_ORBIT, speed: 0.24, height: 1.0, seconds: 6 },
    { kind: 'say', role: 'staff', text: 'Ночная партия принята. Четыре камеры, четыре пломбы, вскрытий нет.', color: STAFF_VOICE },
    { kind: 'say', role: 'guide', text: 'Пойдёмте в западную галерею. Там видно, ради чего мы держим этаж сухим.', color: DIRECTOR_VOICE },

    // Дальний перегон на запад: кабинетом протоколов и коридором первой камеры.
    { kind: 'fly', to: SPUR_APPROACH, speed: 22, height: 1.4 },
    { kind: 'fly', to: GALLERY_ROW[0], look: { role: 'watch' }, speed: 5, height: 1.1 },
    { kind: 'say', role: 'watch', text: 'Смотровая галерея. Три камеры на герме, одна на ключе. Смотрим через дверь.', color: STAFF_VOICE },

    // Внутрь первой камеры. Кадр проходит гермодверь: ключей у камеры нет и не
    // нужно — так же начинается пролог жилого, из запертой Столовой.
    { kind: 'fly', to: CHAMBER[0], look: { role: 'box_north' }, speed: 3.5, height: 0.9 },
    { kind: 'orbit', around: { role: 'box_north' }, radius: CHAMBER_ORBIT, speed: 0.3, height: 0.9, seconds: 6 },

    // Обратно в галерею и вниз по ней, мимо второй и третьей дверей.
    { kind: 'fly', to: GALLERY_ROW[1], look: CHAMBER_DOOR[1], speed: 5, height: 1.2 },
    { kind: 'fly', to: GALLERY_ROW[2], look: { role: 'guard' }, speed: 5, height: 1.2 },
    { kind: 'say', role: 'guard', text: 'Третья на ключе. Головной слизень не спит — он ждёт смену.', color: GUARD_VOICE },

    { kind: 'fly', to: GALLERY_ROW[3], look: CHAMBER_DOOR[3], speed: 5, height: 1.1 },
    { kind: 'fly', to: CHAMBER[3], look: { role: 'box_south' }, speed: 3.5, height: 0.9 },
    { kind: 'orbit', around: { role: 'box_south' }, radius: CHAMBER_ORBIT, speed: -0.28, height: 0.95, seconds: 5 },

    /* Возвращение в зал. Оно не украшение: сцена кончается там, откуда кадру
     * недалеко до игрока, и обратный пролёт проигрывателя (12 секунд потолка)
     * успевает пройти дорогой, а не оборваться подменой кадра. */
    { kind: 'fly', to: GALLERY_ROW[3], speed: 6, height: 1.0 },
    { kind: 'fly', to: HALL_SOUTH, speed: 24, height: 1.5 },
    { kind: 'fly', to: HALL_MID, look: { role: 'guide' }, speed: 5, height: 1.1 },
    { kind: 'say', role: 'guide', text: 'Экскурсия закончена. Пломбы целы, журнал заполнен. Дальше вы ходите под свою подпись.', color: DIRECTOR_VOICE },
    { kind: 'orbit', around: { speaker: true }, radius: HALL_ORBIT, speed: 0.22, height: 1.0, seconds: 5 },
  ],
});
