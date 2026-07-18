export const GAME_BUILD_VERSION: string =
  typeof __BUILD_VERSION__ !== 'undefined'
    ? __BUILD_VERSION__
    : '[ dev ]';
