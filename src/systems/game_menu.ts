export const GAME_MENU_ITEMS = [
  { id: 'continue', label: 'Продолжить' },
  { id: 'new_game', label: 'Новая игра' },
  { id: 'save', label: 'Сохранить' },
  { id: 'load', label: 'Загрузить' },
  { id: 'keys', label: 'Клавиши' },
  { id: 'interface', label: 'Интерфейс' },
  { id: 'graphics', label: 'Графика' },
] as const;

export type GameMenuItemId = typeof GAME_MENU_ITEMS[number]['id'];
