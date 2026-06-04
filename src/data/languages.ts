export type TitleLanguageId = 'ru' | 'en';
export type TitleFlagKind = 'soviet' | 'british_empire';

export interface TitleLanguageDef {
  id: TitleLanguageId;
  code: string;
  name: string;
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  ageLabel: string;
  sexLabel: string;
  sexMaleLabel: string;
  sexFemaleLabel: string;
  seedLabel: string;
  seedPlaceholder: string;
  startPrompt: string;
  setupTitle: string;
  setupSubtitle: string;
  setupStartLabel: string;
  setupStartValue: string;
  setupLanguageLabel: string;
  setupActorCapLabel: string;
  setupNameHint: string;
  setupAgeHint: string;
  setupSexHint: string;
  setupSeedHint: string;
  setupLanguageHint: string;
  setupActorCapHint: string;
  setupStartHint: string;
  setupControlHint: string;
  actorCapValue: (value: number, min: number, max: number) => string;
  languageHint: string;
  mobileHint: string;
  desktopHint: (move: string, interact: string) => string;
  desktopCombatHint: (attack: string, fullscreen: string, controls: string, ui: string) => string;
  flag: TitleFlagKind;
}

export const TITLE_LANGUAGES: readonly TitleLanguageDef[] = [
  {
    id: 'ru',
    code: 'RU',
    name: 'Русский',
    title: 'ГИГАХРУЩ',
    subtitle: 'бесконечный бетонный лабиринт',
    nameLabel: 'НЕТ-ИМЯ',
    namePlaceholder: 'введите имя',
    ageLabel: 'ВОЗРАСТ',
    sexLabel: 'ПОЛ',
    sexMaleLabel: 'мужской',
    sexFemaleLabel: 'женский',
    seedLabel: 'СИД',
    seedPlaceholder: 'пусто = случайный',
    startPrompt: 'Выберите язык и нажмите ENTER',
    setupTitle: 'НАСТРОЙКА ЗАБЕГА',
    setupSubtitle: 'меню запуска',
    setupStartLabel: 'СТАРТ',
    setupStartValue: 'начать игру',
    setupLanguageLabel: 'ЯЗЫК',
    setupActorCapLabel: 'ЛИМИТ NPC/МОБОВ',
    setupNameHint: 'текст вводится прямо с клавиатуры',
    setupAgeHint: '1-100; влияет на соц. контекст персонажа',
    setupSexHint: '←/→ переключить',
    setupSeedHint: 'пусто оставит случайный маршрутный сид',
    setupLanguageHint: '←/→ переключить язык',
    setupActorCapHint: '←/→ шаг 1024',
    setupStartHint: 'ENTER запускает выбранный забег',
    setupControlHint: '↑/↓ выбор  |  ←/→ изменить  |  текст печатается в выбранном поле  |  ENTER старт',
    actorCapValue: (value, min, max) => `${value} (${min}-${max})`,
    languageHint: '←/→ язык  |  ENTER далее',
    mobileHint: 'Тап — далее  |  ДЕЙСТ — действие  |  КАРТ/ЗАД/UI — рельса',
    desktopHint: (move, interact) => `Клик захватывает курсор перед стартом  |  ${move} — движение  |  ${interact} — действие`,
    desktopCombatHint: (attack, fullscreen, controls, ui) => `ЛКМ/${attack} — атака  |  ${fullscreen} — полный экран  |  ${controls} — клавиши  |  ${ui} — интерфейс`,
    flag: 'soviet',
  },
  {
    id: 'en',
    code: 'ENG',
    name: 'English',
    title: 'GIGAHRUSH',
    subtitle: 'endless concrete labyrinth',
    nameLabel: 'NET-NAME',
    namePlaceholder: 'enter name',
    ageLabel: 'AGE',
    sexLabel: 'SEX',
    sexMaleLabel: 'male',
    sexFemaleLabel: 'female',
    seedLabel: 'SEED',
    seedPlaceholder: 'blank = random',
    startPrompt: 'Choose language and press ENTER',
    setupTitle: 'RUN SETUP',
    setupSubtitle: 'launch menu',
    setupStartLabel: 'START',
    setupStartValue: 'start game',
    setupLanguageLabel: 'LANGUAGE',
    setupActorCapLabel: 'NPC/MOB LIMIT',
    setupNameHint: 'type directly while this row is selected',
    setupAgeHint: '1-100; affects social context',
    setupSexHint: '←/→ switch',
    setupSeedHint: 'blank keeps a random route seed',
    setupLanguageHint: '←/→ switch language',
    setupActorCapHint: '←/→ step 1024',
    setupStartHint: 'ENTER starts this run',
    setupControlHint: '↑/↓ select  |  ←/→ change  |  type into the selected text field  |  ENTER start',
    actorCapValue: (value, min, max) => `${value} (${min}-${max})`,
    languageHint: '←/→ language  |  ENTER next',
    mobileHint: 'Tap — next  |  ACT — interact  |  MAP/QUEST/UI — rail',
    desktopHint: (move, interact) => `Click captures cursor before start  |  ${move} — move  |  ${interact} — action`,
    desktopCombatHint: (attack, fullscreen, controls, ui) => `LMB/${attack} — attack  |  ${fullscreen} — fullscreen  |  ${controls} — keys  |  ${ui} — interface`,
    flag: 'british_empire',
  },
];

export function normalizeTitleLanguageId(value: unknown): TitleLanguageId {
  return TITLE_LANGUAGES.some(def => def.id === value) ? value as TitleLanguageId : 'ru';
}

export function titleLanguageDef(id: TitleLanguageId): TitleLanguageDef {
  return TITLE_LANGUAGES.find(def => def.id === id) ?? TITLE_LANGUAGES[0];
}

export function nextTitleLanguageId(id: TitleLanguageId, dir: number): TitleLanguageId {
  const current = TITLE_LANGUAGES.findIndex(def => def.id === id);
  const start = current >= 0 ? current : 0;
  const next = (start + TITLE_LANGUAGES.length + Math.sign(dir || 1)) % TITLE_LANGUAGES.length;
  return TITLE_LANGUAGES[next].id;
}
