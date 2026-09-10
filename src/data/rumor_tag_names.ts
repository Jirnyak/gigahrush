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

/* ── Имена предупреждений ─────────────────────────────────────────
 * Предупреждение доезжает до игрока хвостом реплики: «<текст слуха>. риск
 * самосбора, опасность.» — то есть коротким именным оборотом в нижнем
 * регистре, а не предложением.
 *
 * Пословная сборка (`humanizeTag`) для этого не годится и осталась только
 * запасным ходом. Она даёт не русский текст, а подстрочник: `hack_error`
 * читался «hack error», `black_market_theft` — «черная рынок кража». Разница
 * между этими двумя случаями только в том, что второй проходил проверку на
 * латиницу, а смысла в нём было столько же. Поэтому имя пишется целиком на
 * тег, а не собирается из слов.
 *
 * Новый тег обязан прийти со своей строкой: `tests/rumor-tag-names.test.ts`
 * держит ноль утечек, а не потолок. */
const WARNING_TAG_NAMES: Record<string, string> = {
  acid_sample_containment: 'зелёную пробу держи отдельно от еды',
  airlock: 'ищи шлюз',
  arena_champion: 'у арены новый чемпион',
  armed_player: 'при оружии верят хуже',
  betonov_expedition_notes: 'записки Бетонова в цене',
  betonov_wrong_lift: 'маршрут Бетонова режет мокрый пролёт',
  black_hand: 'чёрная ладонь на стене',
  black_market_theft: 'кража на чёрном рынке',
  black_sample_burn: 'чёрную пробу — под пломбу или в печь',
  borrowed_light: 'заёмный свет',
  borshchevik_sap: 'борщевик ждёт, пока войдёшь в сок',
  candle_procession: 'свечная процессия после отбоя',
  chalk_route_mark: 'меловая метка маршрута',
  child_at_door: 'ребёнок просит открыть',
  closed_door: 'закрытая створка не спасает',
  concealment: 'кто-то промолчал за тебя',
  contact_decay: 'касание списывает тепло',
  container: 'контейнер',
  container_full: 'выходной ящик забит',
  contraband: 'пакет у двери — не только помощь',
  contract_created: 'выдан новый наряд',
  contract_done: 'контракт закрыт',
  contract_failed: 'контракт провален',
  contract_pressure: 'наряды стали щедрее и злее',
  costly_shortcut: 'у среза есть цена',
  danger: 'опасный участок',
  debt_link: 'долг тянется с чужого рынка',
  defensive_neutral: 'пятится — не загоняй',
  document_scent: 'идёт на бумагу в кармане',
  dry_edge_counterplay: 'держи сухую кромку',
  economy: 'экономика',
  external_cell: 'внешняя ячейка зовёт',
  fair_trade: 'честный обмен',
  false_cleanup_patrol: 'ложный обход после отбоя',
  false_exit_door: 'дверь только зовётся выходом',
  false_liquidator_mask: 'номер на маске мелом',
  false_safe_corner: 'угол только зовётся безопасным',
  floor_transition: 'кто-то сменил этаж',
  fog_boss_dead: 'тварь тумана упала',
  fog_exposure: 'пришёл из тумана',
  fractal_floor: 'этаж повторился мелко',
  gigahrush_normalized: 'дом уже считают нормальным',
  govnyak_bad_batch: 'гремучая партия говняка',
  govnyak_confiscation: 'говняк заберут в акт',
  govnyak_debt: 'говнячный долг',
  govnyak_recovery: 'говнячный долг сходит',
  gpvm_late_worker: 'опоздавшего признали несвоевременным',
  gpvm_yesterday_delay: 'вчера задержали на третьем окне',
  green_source: 'зелёное пришло с чужого экрана',
  hack_error: 'на отказ терминала приходит охранитель',
  hidden_infected: 'заражённого спрятали до сортировки',
  idol_counterfeit: 'пошла копия идола',
  idol_cult_handoff: 'идол уходит культу с рук',
  idol_liquidator_report: 'на идола сняли рапорт ликвидаторов',
  idol_ministry_report: 'идол попал в министерскую бумагу',
  istotit_admit_debt: 'вписал второго под колокол',
  istotit_choir: 'клирос зовёт по имени',
  istotit_refuse_debt: 'не открыл под Истотит',
  istotit_shelter: 'золотая дверь принимает не всех',
  kostorez_windup: 'косторез страшен в конце замаха',
  kv_ammo_smelter: 'горячий ящик гильзоплавки',
  last_sound_beam: 'бьёт по последнему шуму',
  lift: 'проверь лифт',
  lift_return_cue: 'возвращайся первой кнопкой',
  light_lock: 'под лампой он точнее',
  line_of_sight: 'держит линию через проём',
  liquidator_order: 'ликвидаторский наряд',
  locked_container: 'запертый ящик',
  maronary_beep: 'зелёный писк Маронария',
  maronary_map: 'карта спорит с маршрутом',
  meat_walls_hell: 'стены потеплели',
  meat_worm: 'мясной червь под лотком',
  metro: 'ошибка метро',
  metro_red_line: 'красная нижняя линия',
  metro_repeat_station: 'станция повторилась',
  metro_safe_return: 'назад по белым лампам',
  metro_wrong_stop: 'остановка не туда',
  ministry_access: 'министерский допуск',
  ministry_audit: 'министерская ревизия',
  minor_cult_betonovorot: 'бетоноворотчики замазали проход',
  minor_cult_rust: 'ржавые сняли петли',
  minor_cult_techno_toilet: 'технотуалетчики замкнули санузел',
  mirror_run: 'зеркальная проводка',
  missing_reflection: 'отражение без жильца',
  missing_shift: 'смена пропала',
  nii_access_protocol: 'допуск НИИ идёт под журнал',
  nii_sample_leak: 'проба утекла на рынок',
  nii_shift_protocol: 'смена НИИ говорит номерами',
  numbered_lift: 'номерной лифт',
  obzh_school: 'школьный ОБЖ',
  office_field: 'канцелярское поле гаснет о шкаф',
  old_world_unreliable: 'память старого мира врёт',
  ovs_quarantine: 'карантин по ОВС',
  player_helped: 'о тебе говорят хорошо',
  player_hurt: 'о тебе говорят плохо',
  production_shortage: 'дефицит на производстве',
  protocol_pressure: 'полные карманы бумаг мешают',
  quest: 'задание',
  radio_chess: 'радио-шахматы опоздали на цикл',
  raid_warning: 'готовят рейд',
  rail_platform_edge: 'не стой у края платформы',
  rail_train_empty: 'пустой состав уже всех высадил',
  rail_trains: 'по рельсам ходят составы',
  ration_audit: 'ревизия пайковых талонов',
  ration_black_market: 'талоны скупают на чёрном рынке',
  red_adhesive: 'красная липучка в проходе',
  resource_recovery: 'запас вышел из красной риски',
  resource_shortage: 'запас просел ниже метки',
  roof_attic_lead: 'наводка на чердак',
  room_growth: 'комната лезет в коридор',
  safeguard_windup: 'сейфгард белеет перед резом',
  samosbor_istotit: 'самосбор под колокол',
  samosbor_maronary: 'самосбор на зелёный писк',
  samosbor_veretar: 'самосбор через белое окно',
  samosbor_warning: 'риск самосбора',
  same_door_sleep: 'сверь номер своей двери',
  sample_handoff_choice: 'у пробы пять дверей',
  school_shelter: 'школьное убежище',
  scrap_wake: 'шум металла будит ржавника',
  sealed_door: 'двери могут лгать',
  second_beat_shadow: 'второй силуэт ложный',
  shelter_space: 'место у гермы продают',
  shelter_tally_hidden: 'ведомость укрытия спрятали',
  shelter_tally_theft: 'ведомость укрытия украли',
  shelter_tally_trade: 'ведомость укрытия продали',
  silver_slime: 'прозрачная проба вызывает вопросы',
  social: 'социальный след',
  soft_recruitment: 'тихая вербовка',
  steam_valves: 'паровые клапаны свистят',
  stolen_goods: 'краденое разложено по долгам',
  swarm: 'рой идёт из вентиляции',
  teleport_cells: 'клетки перескока',
  theft: 'кража',
  treskotnik_windup: 'трескотник замирает перед рывком',
  unsealed_sample: 'пломба сорвана',
  veretar_window_curtain: 'белое окно занавесили',
  veretar_window_lost: 'белый обход забрал свидетеля',
  veretar_window_rescue: 'свидетеля оттащили от белого окна',
  veretar_window_seal: 'белую щель заклеили',
  void_contract: 'ордер Пустоты не закрывают',
  void_rumor: 'запись без свидетеля',
  wall_brace: 'упор о стену держит броню',
  warm_lift_button: 'тёплая кнопка лифта',
  water_riot_theft: 'воруют водные талоны',
  weak_wall: 'слабая стена хрустит',
  weapon_permit_theft: 'украли оружейную бумагу',
  webbed_room: 'комната в белых нитях',
  welded_herma: 'герму заварили временно',
  wet_line_shot: 'мокрая прямая под выстрел',
  wet_pressure_line: 'мокрая линия давит',
  white_slime_no_open: 'белый остаток не вскрывать',
  white_slime_unsealed: 'белая проба без пломбы',
  wild_kitchen_rules: 'у дикого котла свои правила',
  wild_passage_trade: 'дикий обход покупают',
  wild_raid: 'дикие идут на запах кухни',
  witness: 'свидетель',
  wrong_medical_talon: 'талон чужой',
  zhelemish_curse: 'желемыш зовут первым даром',
};

/** Аргумент — `reveal.tag` слуха с `kind: 'warning'`, а НЕ тег мирового события
 *  и не id слуха. Пространства разные: `veretar_window_sample` и
 *  `veretar_photo_taken` — теги события, по ним `veretarWindowEventRumorId`
 *  выбирает слух, а сами те слухи раскрывают предмет, а не предупреждение.
 *  Ветки на такие имена сюда не доходят никогда. */
export function warningTagName(tag: string): string {
  return WARNING_TAG_NAMES[tag] ?? humanizeTag(tag);
}

function humanizeTag(tag: string): string {
  const parts = tag.split('_').filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(part => TAG_WORDS[part] ?? part).join(' ');
}
