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
  startPrompt: string;
  languageHint: string;
  mobileHint: string;
  desktopHint: (move: string, interact: string, controls: string) => string;
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
    startPrompt: 'Введите имя и нажмите ENTER',
    languageHint: '←/→ язык',
    mobileHint: 'Тап — начать  |  левый джойстик — ходьба  |  правый — камера  |  центр — атака',
    desktopHint: (move, interact, controls) => `${move} — движение  |  Мышь — обзор  |  ${interact} — действие  |  ${controls} — все клавиши`,
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
    startPrompt: 'Enter name and press ENTER',
    languageHint: '←/→ language',
    mobileHint: 'Tap — start  |  left stick — walk  |  right stick — camera  |  center — attack',
    desktopHint: (move, interact, controls) => `${move} — move  |  Mouse — look  |  ${interact} — action  |  ${controls} — all keys`,
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
