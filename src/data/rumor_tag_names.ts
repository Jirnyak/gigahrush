/* ── Русские имена тегов слухов ───────────────────────────────────
 * Чистые словари отображения: ни рантайма, ни мутации мира. Живут в data/,
 * потому что читают их ДВА пути формирования слуха — обычный (`systems/rumor`)
 * и марковский (`systems/markov_rumor`), — а импортировать один из другого
 * нельзя: обычный уже импортирует марковский, и вышел бы цикл. Пока словари
 * лежали только в обычном, марковская ветка печатала игроку сырой внутренний
 * id: вместо «риск самосбора» — `samosbor warning`, вместо «досье ЧБ» —
 * `chernobog`.
 */

const TAG_WORDS: Record<string, string> = {
  airlock: 'шлюз',
  armed: 'оружие',
  audit: 'ревизия',
  bad: 'плохая',
  batch: 'партия',
  betonov: 'Бетонов',
  black: 'черная',
  borrowed: 'заемный',
  boss: 'босс',
  chernobog: 'Чернобог',
  choir: 'хор',
  confiscation: 'конфискация',
  container: 'контейнер',
  contract: 'контракт',
  counterfeit: 'подделка',
  cult: 'культ',
  danger: 'опасность',
  debt: 'долг',
  done: 'закрыт',
  door: 'дверь',
  economy: 'экономика',
  external: 'внешняя',
  failed: 'провален',
  fair: 'честный',
  fog: 'туман',
  forged: 'подделка',
  green: 'зеленый',
  hand: 'ладонь',
  hidden: 'спрятано',
  idol: 'идол',
  istotit: 'Истотит',
  kostorez: 'косторез',
  lift: 'лифт',
  light: 'свет',
  liquidator: 'ликвидатор',
  lost: 'потеря',
  market: 'рынок',
  maronary: 'Маронарий',
  metro: 'метро',
  ministry: 'министерство',
  numbered: 'номерной',
  obzh: 'ОБЖ',
  player: 'игрок',
  production: 'производство',
  quest: 'задание',
  quiet: 'тихий',
  ration: 'паек',
  recovery: 'восстановление',
  report: 'рапорт',
  rescue: 'спасение',
  safeguard: 'сейфгард',
  samosbor: 'самосбор',
  school: 'школа',
  seal: 'пломба',
  sealed: 'гермодверь',
  shelter: 'укрытие',
  shortage: 'дефицит',
  silver: 'серебро',
  slime: 'слизь',
  social: 'социальный след',
  source: 'источник',
  steam: 'пар',
  stolen: 'украдено',
  tally: 'ведомость',
  theft: 'кража',
  trade: 'обмен',
  variant: 'вариант',
  veretar: 'Веретар',
  void: 'пустота',
  water: 'вода',
  weapon: 'оружие',
  white: 'белый',
  wild: 'дикие',
  window: 'окно',
  witness: 'свидетель',
  wrong: 'ошибка',
  zhelemish: 'желемыш',
};

export function containerTagName(tag: string): string {
  switch (tag) {
    case 'locked_container':
    case 'locked':
      return 'запертый ящик';
    case 'weapon':
      return 'оружейный ящик';
    case 'medical':
      return 'медицинский шкаф';
    case 'chernobog':
      return 'досье ЧБ';
    case 'paper':
      return 'картотека';
    case 'public':
      return 'общий ящик';
    case 'resident_relief':
      return 'ящик жилищной подмоги';
    case 'refuge':
      return 'ящик убежища';
    case 'ledger':
      return 'ведомость';
    case 'blackmail':
      return 'папка шантажа';
    case 'liquidator_archive':
      return 'архив ликвидаторов';
    case 'dry_after_wet_samosbor':
      return 'сухой запас после мокрого самосбора';
    default:
      return humanizeTag(tag);
  }
}

/** Аргумент — `reveal.tag` слуха с `kind: 'warning'`, а НЕ тег мирового события
 *  и не id слуха. Пространства разные: `veretar_window_sample` и
 *  `veretar_photo_taken` — теги события, по ним `veretarWindowEventRumorId`
 *  выбирает слух, а сами те слухи раскрывают предмет, а не предупреждение.
 *  Ветки на такие имена сюда не доходят никогда. */
export function warningTagName(tag: string): string {
  switch (tag) {
    case 'samosbor_warning':
      return 'риск самосбора';
    case 'sealed_door':
      return 'двери могут лгать';
    case 'airlock':
      return 'ищи шлюз';
    case 'danger':
      return 'опасный участок';
    case 'metro':
      return 'ошибка метро';
    case 'lift':
      return 'проверь лифт';
    case 'silver_slime':
      return 'прозрачная проба вызывает вопросы';
    case 'veretar_window_rescue':
      return 'свидетеля оттащили от белого окна';
    case 'veretar_window_seal':
      return 'белую щель заклеили';
    case 'veretar_window_curtain':
      return 'белое окно занавесили';
    case 'veretar_window_lost':
      return 'белый обход забрал свидетеля';
    default:
      return humanizeTag(tag);
  }
}

function humanizeTag(tag: string): string {
  const parts = tag.split('_').filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(part => TAG_WORDS[part] ?? part).join(' ');
}
