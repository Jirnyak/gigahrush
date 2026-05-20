/* ── Monster variant definitions: cheap modifiers, no runtime scans ── */

import { FloorLevel, MonsterKind } from '../core/types';

export type MonsterVariantFlag =
  | 'wall_bias'
  | 'lamp_bias'
  | 'water_bias'
  | 'document_bias'
  | 'ambush'
  | 'ranged_bias'
  | 'swarm'
  | 'armored'
  | 'coward'
  | 'fog_bias';

export type MonsterVariantCueMark =
  | 'cracks'
  | 'wet_drips'
  | 'silence_stitches'
  | 'panel_edges'
  | 'wild_rags'
  | 'lamp_halo'
  | 'black_slime'
  | 'pipe_bands'
  | 'garbage_flecks'
  | 'concrete_bite';

export interface MonsterVariantCue {
  tint: readonly [number, number, number];
  mark: MonsterVariantCueMark;
  audioCue: string;
  bark: string;
  color: string;
}

export interface MonsterVariantDef {
  id: string;
  baseKind: MonsterKind;
  prefix: string;
  spawnWeight: number;
  hpMult: number;
  speedMult: number;
  dmgMult: number;
  flags: readonly MonsterVariantFlag[];
  readabilityCue: string;
  rule: string;
  floors: readonly FloorLevel[];
  lootHint: string;
  counterplay: string;
  deathLogHint: string;
  rumorIds: readonly string[];
  cue?: MonsterVariantCue;
  rumorId?: string;
}

export const MONSTER_VARIANTS: readonly MonsterVariantDef[] = [
  {
    id: 'cracked_sborka',
    baseKind: MonsterKind.SBORKA,
    prefix: 'Треснутая',
    spawnWeight: 4.5,
    hpMult: 0.62,
    speedMult: 1.34,
    dmgMult: 0.8,
    flags: ['swarm'],
    readabilityCue: 'Красные трещины и сухой треск перед быстрым касанием.',
    rule: 'Проверяет ранний дешевый выстрел и широкий проход: хрупкая, но первая сокращает дистанцию.',
    floors: [FloorLevel.LIVING, FloorLevel.KVARTIRY],
    lootHint: 'проволока, кладовой мусор, обрывок изоленты',
    counterplay: 'Гасите дешевым выстрелом до контакта: треснутая сборка быстро добегает, но разваливается первой.',
    deathLogHint: 'Смерть от треснутой сборки должна читать поздний выстрел по хрупкой, но уже добежавшей цели.',
    rumorIds: ['variant_cracked_sborka', 'monster_sborka_fast'],
    cue: {
      tint: [184, 68, 78],
      mark: 'cracks',
      audioCue: 'сухой треск панельной щепы',
      bark: 'Треск в коридоре: эта сборка быстрая и хрупкая, сбивай до касания.',
      color: '#f88',
    },
    rumorId: 'variant_cracked_sborka',
  },
  {
    id: 'fog_sborka',
    baseKind: MonsterKind.SBORKA,
    prefix: 'Туманная',
    spawnWeight: 1.1,
    hpMult: 0.9,
    speedMult: 1.08,
    dmgMult: 1.22,
    flags: ['fog_bias', 'ambush'],
    readabilityCue: 'Силуэт пропадает в тумане, но первый звук приходит сбоку.',
    rule: 'Туманная сборка не про скорость, а про ранний отход к углу до невидимого контакта.',
    floors: [FloorLevel.LIVING, FloorLevel.HELL],
    lootHint: 'влажная сажа самосбора и треснувший узел',
    counterplay: 'Не ждите силуэт в тумане: отходите к углу и стреляйте по первому звуку, пока она не вошла в упор.',
    deathLogHint: 'Смерть от туманной сборки должна указывать, что игрок ждал видимый силуэт вместо угла и звука.',
    rumorIds: ['monster_sborka_fast', 'ecology_sborka_swarm'],
  },
  {
    id: 'wet_polzun',
    baseKind: MonsterKind.POLZUN,
    prefix: 'Мокрый',
    spawnWeight: 2.8,
    hpMult: 1.35,
    speedMult: 0.92,
    dmgMult: 1.05,
    flags: ['water_bias', 'armored'],
    readabilityCue: 'Синеватые потеки и мокрый шлепок рядом с лотком.',
    rule: 'В воде и ванной держит темп и броню; на сухом прямом проходе остается только толстым телом.',
    floors: [FloorLevel.MAINTENANCE],
    lootHint: 'мокрая ветошь, ванная грязь, фильтрующий слой',
    counterplay: 'Не деритесь в лотке или ванной: на сухом прямом проходе мокрый ползун остается толстым, но теряет темп.',
    deathLogHint: 'Смерть от мокрого ползуна должна читать бой в воде или ванной вместо сухого прямого отхода.',
    rumorIds: ['variant_wet_polzun', 'monster_polzun_floor'],
    cue: {
      tint: [72, 148, 156],
      mark: 'wet_drips',
      audioCue: 'мокрый шлепок по плитке',
      bark: 'Слышен мокрый шлепок: мокрый ползун крепче у воды, выводи на сухой проход.',
      color: '#6cf',
    },
    rumorId: 'variant_wet_polzun',
  },
  {
    id: 'silent_polzun',
    baseKind: MonsterKind.POLZUN,
    prefix: 'Тихий',
    spawnWeight: 0.85,
    hpMult: 0.72,
    speedMult: 1.28,
    dmgMult: 1.25,
    flags: ['ambush'],
    readabilityCue: 'У двери появляется отсутствие эха и серый тихий скреб.',
    rule: 'Наказывает спину к проему и поздний разворот, а не честный обмен в открытом проходе.',
    floors: [FloorLevel.LIVING],
    lootHint: 'шумовой крючок, мокрая ветошь',
    counterplay: 'Не держите дверь спиной: тихий ползун слабее обычного, но наказывает поздний разворот в тесном месте.',
    deathLogHint: 'Смерть от тихого ползуна должна указывать на дверь за спиной и слишком поздний разворот.',
    rumorIds: ['variant_silent_polzun', 'ecology_polzun_low'],
    cue: {
      tint: [154, 154, 146],
      mark: 'silence_stitches',
      audioCue: 'почти пустой скреб без эха',
      bark: 'Скреб без эха: тихий ползун слабее, но уже у спины. Не держи дверь за собой.',
      color: '#ccc',
    },
    rumorId: 'variant_silent_polzun',
  },
  {
    id: 'panel_tvar',
    baseKind: MonsterKind.TVAR,
    prefix: 'Панельная',
    spawnWeight: 2.4,
    hpMult: 1.35,
    speedMult: 0.88,
    dmgMult: 1.1,
    flags: ['wall_bias', 'armored'],
    readabilityCue: 'Серые панельные ребра, скол бетона и удержание стены.',
    rule: 'У бетонной кромки держит удар и давление; центр комнаты выключает ее лучший угол.',
    floors: [FloorLevel.LIVING, FloorLevel.KVARTIRY],
    lootHint: 'бетонная крошка, панельная стружка',
    counterplay: 'Вытягивайте от стены в центр комнаты: панельная тварь держит удар, но хуже давит без бетонной кромки.',
    deathLogHint: 'Смерть от панельной твари должна указывать на бой у стены вместо центра комнаты.',
    rumorIds: ['variant_panel_tvar', 'ecology_tvar_wall'],
    cue: {
      tint: [132, 130, 118],
      mark: 'panel_edges',
      audioCue: 'глухой скол бетона у стены',
      bark: 'Бетон скалывается у кромки: панельную тварь тяни в центр комнаты.',
      color: '#cca',
    },
    rumorId: 'variant_panel_tvar',
  },
  {
    id: 'hungry_tvar',
    baseKind: MonsterKind.TVAR,
    prefix: 'Голодная',
    spawnWeight: 1.4,
    hpMult: 0.75,
    speedMult: 1.36,
    dmgMult: 1.25,
    flags: ['ambush', 'swarm'],
    readabilityCue: 'Сырой жир и органический скреб ускоряются сразу после запаха.',
    rule: 'Быстрый голодный рывок срывается приманкой до выстрела или немедленным разрывом дистанции.',
    floors: [FloorLevel.HELL, FloorLevel.LIVING],
    lootHint: 'сырой жир, органическая крошка, кусок мяса',
    counterplay: 'Бросайте приманку до выстрела или рвите дистанцию сразу: голодная тварь живет меньше, но быстро добегает до задержавшегося.',
    deathLogHint: 'Смерть от голодной твари должна читать задержку без приманки или поздний отход.',
    rumorIds: ['monster_tvar_walls', 'ecology_tvar_wall'],
  },
  {
    id: 'office_zombie',
    baseKind: MonsterKind.ZOMBIE,
    prefix: 'Конторская',
    spawnWeight: 2.0,
    hpMult: 1.12,
    speedMult: 0.82,
    dmgMult: 1.05,
    flags: ['document_bias', 'armored'],
    readabilityCue: 'Канцелярский хрип тянется к папке и бланкам, а не к пустым рукам.',
    rule: 'Меняет тактику через документы: разгружайте бумаги и не принимайте медленный, упорный хват вблизи.',
    floors: [FloorLevel.MINISTRY, FloorLevel.LIVING],
    lootHint: 'обглоданный бланк, канцелярская мелочь',
    counterplay: 'Не тащите документы в ближний бой: конторская мертвячина медленнее, но упорнее идет за бумагами.',
    deathLogHint: 'Смерть от конторского мертвяка должна читать бумаги в инвентаре и ближний бой с папкой.',
    rumorIds: ['monster_zombie_human', 'ecology_zombie_neighbor'],
  },
  {
    id: 'wild_zombie',
    baseKind: MonsterKind.ZOMBIE,
    prefix: 'Дикая',
    spawnWeight: 2.5,
    hpMult: 0.78,
    speedMult: 1.24,
    dmgMult: 1.14,
    flags: ['swarm'],
    readabilityCue: 'Рваный хрип ускоряется в толпе и дверной каше.',
    rule: 'Опасен темпом входа в crowd; пустой проход превращает его в хрупкую цель.',
    floors: [FloorLevel.KVARTIRY, FloorLevel.LIVING],
    lootHint: 'рваная одежда, карманный бытовой хлам',
    counterplay: 'Не пускайте в толпу: дикий мертвяк быстрее обычного, но быстро падает, если вывести в пустой проход.',
    deathLogHint: 'Смерть от дикого мертвяка должна указывать на толпу или дверной затор вместо пустого прохода.',
    rumorIds: ['variant_wild_zombie', 'monster_zombie_human'],
    cue: {
      tint: [146, 72, 54],
      mark: 'wild_rags',
      audioCue: 'рваный хрип и быстрые шаги',
      bark: 'Рваный хрип ускоряется: дикий мертвяк быстрый, но падает в пустом проходе.',
      color: '#fa6',
    },
    rumorId: 'variant_wild_zombie',
  },
  {
    id: 'blind_eye',
    baseKind: MonsterKind.EYE,
    prefix: 'Слепой',
    spawnWeight: 0.9,
    hpMult: 0.65,
    speedMult: 0.78,
    dmgMult: 1.55,
    flags: ['ranged_bias', 'coward'],
    readabilityCue: 'Тусклый зеленый залп без уверенного взгляда, затем короткая слабость.',
    rule: 'Бьет больнее из линии, но плохо держит упор после выстрела; нужно сближаться в паузу.',
    floors: [FloorLevel.MAINTENANCE, FloorLevel.HELL],
    lootHint: 'сгусток сажи, треснувшее стекло',
    counterplay: 'Сближайтесь сразу после залпа: слепой глаз бьет больнее, но плохо держит бой в упоре.',
    deathLogHint: 'Смерть от слепого глаза должна читать открытую линию и отсутствие сближения после залпа.',
    rumorIds: ['ecology_eye_line'],
  },
  {
    id: 'black_slime_eye',
    baseKind: MonsterKind.EYE,
    prefix: 'Чернослизный',
    spawnWeight: 0.65,
    hpMult: 0.55,
    speedMult: 0.82,
    dmgMult: 0.85,
    flags: ['ranged_bias', 'ambush', 'water_bias'],
    readabilityCue: 'Черный бульк в темной воде открывает грязную линию обзора.',
    rule: 'Слаб сам по себе, но получает первый выстрел, если игрок проверяет воду лицом.',
    floors: [FloorLevel.MAINTENANCE],
    lootHint: 'проба черной слизи, стеклянная пыль',
    counterplay: 'Не проверяйте темную воду лицом: чернослизный глаз слабый, но открывает бой из грязной линии обзора.',
    deathLogHint: 'Смерть от чернослизного глаза должна указывать на темную воду и непроверенную линию.',
    rumorIds: ['variant_black_slime_eye', 'ecology_eye_line'],
    cue: {
      tint: [28, 34, 38],
      mark: 'black_slime',
      audioCue: 'вязкий бульк из темной воды',
      bark: 'В темной воде булькнул глаз: слабый, но стреляет первым из грязной линии.',
      color: '#78a',
    },
    rumorId: 'variant_black_slime_eye',
  },
  {
    id: 'lamp_eye',
    baseKind: MonsterKind.EYE,
    prefix: 'Ламповый',
    spawnWeight: 1.7,
    hpMult: 0.95,
    speedMult: 1.05,
    dmgMult: 1.18,
    flags: ['lamp_bias', 'ranged_bias'],
    readabilityCue: 'Желтый ореол, ламповый гул и зеленый щелчок на светлой прямой.',
    rule: 'Пока держит игрока на свету, сильнее; угол, темный коридор или уход от лампы возвращают паузу.',
    floors: [FloorLevel.LIVING, FloorLevel.MINISTRY],
    lootHint: 'перегоревшая нить, стеклянная пыль',
    counterplay: 'Уходите из освещенного прямого коридора за угол: ламповый глаз сильнее, пока держит вас на свету.',
    deathLogHint: 'Смерть от лампового глаза должна читать стояние на освещенной прямой без угла.',
    rumorIds: ['variant_lamp_eye', 'monster_eye_lamps'],
    cue: {
      tint: [238, 196, 72],
      mark: 'lamp_halo',
      audioCue: 'ламповый гул перед зеленым щелчком',
      bark: 'Лампа загудела и смотрит: ламповый глаз силен на свету, уходи за угол.',
      color: '#fd6',
    },
    rumorId: 'variant_lamp_eye',
  },
  {
    id: 'rebar_veteran',
    baseKind: MonsterKind.REBAR,
    prefix: 'Закаленная',
    spawnWeight: 0.75,
    hpMult: 1.55,
    speedMult: 0.78,
    dmgMult: 1.08,
    flags: ['armored'],
    readabilityCue: 'Тяжелый прут почти не спешит, но звенит глубже обычной арматуры.',
    rule: 'Ближняя рукопашная тратит время и здоровье; дистанция, дробь или тяжелое оружие решают броню.',
    floors: [FloorLevel.MAINTENANCE, FloorLevel.HELL],
    lootHint: 'тяжелый прут, витая проволока',
    counterplay: 'Не тратьте рукопашную: закаленная арматура медленная, но требует дистанции, дроби или тяжелого оружия.',
    deathLogHint: 'Смерть от закаленной арматуры должна читать рукопашный размен вместо дистанции или дроби.',
    rumorIds: ['monster_rebar_metal', 'ecology_rebar_still'],
  },
  {
    id: 'rust_rebar',
    baseKind: MonsterKind.REBAR,
    prefix: 'Ржавая',
    spawnWeight: 1.45,
    hpMult: 0.72,
    speedMult: 1.22,
    dmgMult: 1.28,
    flags: ['ambush'],
    readabilityCue: 'Ржавый прут лежит слишком ровно у складской стойки.',
    rule: 'Быстро бросается из укрытия склада, но плохо держит ответный огонь вне стойки.',
    floors: [FloorLevel.MAINTENANCE],
    lootHint: 'ржавчина, хрупкий прут',
    counterplay: 'Обходите ровное железо у склада: ржавая арматура быстрее бросается из-за стойки, но хуже держит ответный огонь.',
    deathLogHint: 'Смерть от ржавой арматуры должна указывать на шаг к ровному железу у склада.',
    rumorIds: ['monster_rebar_metal', 'ecology_rebar_still'],
  },
  {
    id: 'deep_shadow',
    baseKind: MonsterKind.SHADOW,
    prefix: 'Глубокий',
    spawnWeight: 0.85,
    hpMult: 1.05,
    speedMult: 1.12,
    dmgMult: 1.18,
    flags: ['ambush', 'fog_bias'],
    readabilityCue: 'Глубокая тень держит второй силуэт в тумане или у темного выхода.',
    rule: 'Опасен вторым темпом после первого удара; светлый выход за спиной важнее погони.',
    floors: [FloorLevel.HELL, FloorLevel.VOID],
    lootHint: 'темный след, холодная пыль',
    counterplay: 'Держите светлый выход за спиной: глубокий теневик опасен не броней, а темпом второго удара.',
    deathLogHint: 'Смерть от глубокого теневика должна читать погоню в темноту без светлого выхода.',
    rumorIds: ['monster_shadow_silence', 'ecology_shadow_afterimage'],
  },
  {
    id: 'thin_shadow',
    baseKind: MonsterKind.SHADOW,
    prefix: 'Тонкий',
    spawnWeight: 1.25,
    hpMult: 0.62,
    speedMult: 1.5,
    dmgMult: 0.8,
    flags: ['coward', 'ambush'],
    readabilityCue: 'Тонкая тень отступает слишком охотно в темный коридор.',
    rule: 'Слабее, но провоцирует лишний шаг за ней; правильная тактика - не гнаться вслепую.',
    floors: [FloorLevel.MINISTRY, FloorLevel.LIVING],
    lootHint: 'холодная пыль, пустой темный след',
    counterplay: 'Не гонитесь вслепую: тонкий теневик слабее, но провоцирует лишний шаг в темный коридор.',
    deathLogHint: 'Смерть от тонкого теневика должна указывать на погоню в темный коридор.',
    rumorIds: ['ecology_shadow_afterimage', 'hunter_shadow_wide_passage'],
  },
  {
    id: 'court_nightmare',
    baseKind: MonsterKind.NIGHTMARE,
    prefix: 'Протокольное',
    spawnWeight: 1.25,
    hpMult: 1.18,
    speedMult: 0.82,
    dmgMult: 1.28,
    flags: ['document_bias'],
    readabilityCue: 'Протокол давит на мысли сильнее, если в кармане пачка бумаг.',
    rule: 'Документы и длинный бой усиливают цену ошибки; лишнюю бумагу нужно сбросить до давления.',
    floors: [FloorLevel.MINISTRY],
    lootHint: 'испорченный протокол, ПСИ-пыль',
    counterplay: 'Сбрасывайте лишнюю бумагу и не затягивайте бой: протокольное кошмарище медленнее, но бьет сильнее, если вы тащите пачку бумаг.',
    deathLogHint: 'Смерть от протокольного кошмарища должна читать затянутый бой с лишними бумагами.',
    rumorIds: ['ecology_nightmare_pressure'],
  },
  {
    id: 'wet_nightmare',
    baseKind: MonsterKind.NIGHTMARE,
    prefix: 'Водяное',
    spawnWeight: 0.8,
    hpMult: 0.95,
    speedMult: 1.22,
    dmgMult: 1.05,
    flags: ['water_bias'],
    readabilityCue: 'Мокрый ПСИ-налет ползет по линии воды перед давлением.',
    rule: 'Выигрывает, пока игрок пятится по воде; короткий удар с сухой линии лучше долгого отступления.',
    floors: [FloorLevel.MAINTENANCE],
    lootHint: 'мокрый сгусток, ПСИ-налет',
    counterplay: 'Уходите с мокрой линии и бейте коротко: водяное кошмарище выигрывает бой, пока вы пятитесь по воде.',
    deathLogHint: 'Смерть от водяного кошмарища должна указывать на отход по мокрой линии.',
    rumorIds: ['ecology_nightmare_pressure'],
  },
  {
    id: 'choir_matka',
    baseKind: MonsterKind.MATKA,
    prefix: 'Хоровая',
    spawnWeight: 0.7,
    hpMult: 1.08,
    speedMult: 1.0,
    dmgMult: 0.95,
    flags: ['swarm', 'fog_bias'],
    readabilityCue: 'Мокрый хор мелких голосов собирается раньше, чем видна сама матка.',
    rule: 'Заставляет выбрать цель: бить источник приплода или чистить проход от мелких.',
    floors: [FloorLevel.HELL],
    lootHint: 'маточный узел, теплая слизь',
    counterplay: 'Решайте сразу: убивать матку или чистить приплод. Хоровая матка зовет новых мелких и быстро забивает проход.',
    deathLogHint: 'Смерть от хоровой матки должна читать промедление с источником приплода.',
    rumorIds: ['monster_matka_spawn'],
  },
  {
    id: 'office_idol',
    baseKind: MonsterKind.IDOL,
    prefix: 'Канцелярский',
    spawnWeight: 1.0,
    hpMult: 0.9,
    speedMult: 1.0,
    dmgMult: 1.22,
    flags: ['document_bias', 'ranged_bias'],
    readabilityCue: 'Бумаги шуршат вокруг неподвижной черной фигуры, ПСИ-удар приходит через кабинет.',
    rule: 'Наказывает открытую среднюю дистанцию в административных комнатах и игрока с бумагами.',
    floors: [FloorLevel.MINISTRY],
    lootHint: 'чернильный камень, ПСИ-пыль',
    counterplay: 'Не спорьте с ним на средней дистанции: канцелярский идол неподвижен, но бьет сильнее по открытому кабинету.',
    deathLogHint: 'Смерть от канцелярского идола должна указывать на открытую линию и затянутую перестрелку.',
    rumorIds: ['monster_idol_static', 'ecology_idol_stares'],
  },
  {
    id: 'pipe_robot',
    baseKind: MonsterKind.ROBOT,
    prefix: 'Трубный',
    spawnWeight: 1.15,
    hpMult: 1.25,
    speedMult: 0.86,
    dmgMult: 1.12,
    flags: ['water_bias', 'ranged_bias', 'armored'],
    readabilityCue: 'Синие трубные полосы и мокрый металлический стук перед плазмой.',
    rule: 'Держит длинные мокрые линии, но оставляет окно ответа после залпа.',
    floors: [FloorLevel.MAINTENANCE],
    lootHint: 'проводка, мокрая плата, редкая энергоячейка',
    counterplay: 'Не стойте в мокром прямом проходе: трубный робот крепче обычного, но замирает после плазмы.',
    deathLogHint: 'Смерть от трубного робота должна читать стояние в мокрой прямой после первого предупреждения.',
    rumorIds: ['variant_pipe_robot', 'ecology_robot_plasma'],
    cue: {
      tint: [74, 126, 138],
      mark: 'pipe_bands',
      audioCue: 'стук по трубе и короткий заряд плазмы',
      bark: 'Труба отвечает зарядом: трубный робот опасен в мокрой прямой, бей после плазмы.',
      color: '#7df',
    },
    rumorId: 'variant_pipe_robot',
  },
  {
    id: 'false_spirit',
    baseKind: MonsterKind.SPIRIT,
    prefix: 'Ложный',
    spawnWeight: 0.9,
    hpMult: 0.9,
    speedMult: 1.28,
    dmgMult: 1.02,
    flags: ['ambush', 'coward'],
    readabilityCue: 'Холодный сквозняк приходит сбоку, а дверь за спиной не меняет его путь.',
    rule: 'Обходит закрытую дверь через стены, но плохо держит точный ответ на дистанции.',
    floors: [FloorLevel.VOID, FloorLevel.MINISTRY],
    lootHint: 'пустая записка, холодный сквозняк',
    counterplay: 'Не закрывайтесь дверью: ложный дух проходит через стену и заходит сбоку, но плохо держит точный выстрел.',
    deathLogHint: 'Смерть от ложного духа должна объяснять неверную ставку на дверь вместо смены позиции.',
    rumorIds: ['ecology_spirit_wall'],
  },
  {
    id: 'garbage_krysnozhka',
    baseKind: MonsterKind.KRYSNOZHKA,
    prefix: 'Помойная',
    spawnWeight: 3.2,
    hpMult: 0.8,
    speedMult: 1.22,
    dmgMult: 0.85,
    flags: ['swarm', 'coward'],
    readabilityCue: 'Пакеты шуршат мелкими ногами, а запах еды тянет рой к карману.',
    rule: 'Учит держать еду в контейнере и бросать приманку дальше себя.',
    floors: [FloorLevel.KVARTIRY, FloorLevel.LIVING, FloorLevel.MAINTENANCE],
    lootHint: 'мусор гнезда, грязный жир',
    counterplay: 'Сбивайте первый рывок и не храните приманку в кармане: помойный рой слабый, но быстро окружает.',
    deathLogHint: 'Смерть от помойной крысоножки должна читать запах еды и поздний первый выстрел.',
    rumorIds: ['variant_garbage_krysnozhka', 'ecology_krysnozhka_bait'],
    cue: {
      tint: [114, 96, 54],
      mark: 'garbage_flecks',
      audioCue: 'шорох пакетов и мелких ножек',
      bark: 'Пакеты зашуршали ножками: помойный рой слабый, но быстро окружает.',
      color: '#ca6',
    },
    rumorId: 'variant_garbage_krysnozhka',
  },
  {
    id: 'betonoed',
    baseKind: MonsterKind.BETONNIK,
    prefix: 'Бетоноед',
    spawnWeight: 0,
    hpMult: 0.42,
    speedMult: 1.22,
    dmgMult: 0.85,
    flags: ['wall_bias', 'armored'],
    readabilityCue: 'Слабая стена хрустит изнутри, бетонная крошка сыпется до контакта.',
    rule: 'Превращает стену в короткое решение: шум, огонь, герметик или блок-комплект.',
    floors: [],
    lootHint: 'арматурная крошка, бетонный осколок',
    counterplay: 'Если слабая стена дрожит, решайте сразу: шумом отвлечь, огнем отогнать, герметиком закрыть или блок-комплектом сделать проход.',
    deathLogHint: 'Смерть от бетоноеда должна читать нерешенную слабую стену и позднее действие.',
    rumorIds: ['variant_betonoed'],
    cue: {
      tint: [168, 160, 132],
      mark: 'concrete_bite',
      audioCue: 'хруст бетона за тонкой стеной',
      bark: 'Стена хрустит изнутри: бетоноед слаб, но решает проход. Шум, огонь, герметик или блок-комплект.',
      color: '#dc9',
    },
    rumorId: 'variant_betonoed',
  },
];

export const MONSTER_VARIANT_CUE_IDS = [
  'cracked_sborka',
  'wet_polzun',
  'silent_polzun',
  'panel_tvar',
  'wild_zombie',
  'black_slime_eye',
  'lamp_eye',
  'pipe_robot',
  'garbage_krysnozhka',
  'betonoed',
] as const;

export const MONSTER_VARIANTS_BY_KIND: Partial<Record<MonsterKind, readonly MonsterVariantDef[]>> = {};
export const MONSTER_VARIANTS_BY_FLOOR: Partial<Record<FloorLevel, readonly MonsterVariantDef[]>> = {};
export const MONSTER_VARIANT_BY_ID: Record<string, MonsterVariantDef> = {};

for (const v of MONSTER_VARIANTS) {
  MONSTER_VARIANT_BY_ID[v.id] = v;
  MONSTER_VARIANTS_BY_KIND[v.baseKind] = [...(MONSTER_VARIANTS_BY_KIND[v.baseKind] ?? []), v];
  for (const floor of v.floors) {
    MONSTER_VARIANTS_BY_FLOOR[floor] = [...(MONSTER_VARIANTS_BY_FLOOR[floor] ?? []), v];
  }
}

export function variantsForKind(kind: MonsterKind): readonly MonsterVariantDef[] {
  return MONSTER_VARIANTS_BY_KIND[kind] ?? [];
}

export function monsterVariantRumorIds(variantId: string | undefined): readonly string[] {
  if (!variantId) return [];
  const variant = MONSTER_VARIANT_BY_ID[variantId];
  if (!variant) return [];
  return variant.rumorIds.length > 0 ? variant.rumorIds : variant.rumorId ? [variant.rumorId] : [];
}

export function chooseMonsterVariant(kind: MonsterKind, floor: FloorLevel, rng = Math.random): MonsterVariantDef | undefined {
  const variants = variantsForKind(kind).filter(v => v.floors.includes(floor) && v.spawnWeight > 0);
  let total = 0;
  let chosen: MonsterVariantDef | undefined;
  for (const variant of variants) {
    total += variant.spawnWeight;
    if (rng() * total < variant.spawnWeight) chosen = variant;
  }
  return chosen;
}
