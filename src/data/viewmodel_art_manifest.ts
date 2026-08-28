/**
 * Что художник нарисовал для рук, откуда это взято и чьё оно.
 *
 * Второй, параллельный путь к картинке вьюмодели: процедурный пакет остаётся
 * умолчанием, а строка отсюда означает, что для этой пары «вещь + кадр» лежит
 * настоящий PNG и берётся он. Сам PNG в браузер не попадает НИКОГДА — исходники
 * запекаются в `src/render/viewmodel/generated_frames.ts` и уезжают в сборку
 * обычным кодом.
 *
 * Список ведёт запекатель, а не рука: `node scripts/generate-viewmodel-sprites.mjs`
 * сканирует `viewmodels/<itemId>/<frame>.png`, дописывает новые строки, убирает
 * строки исчезнувших файлов и ПЕРЕПИСЫВАЕТ `sourcePath`, `sha256`, `width` и
 * `height` — это факты файла, а не авторские значения. Всё остальное в строке
 * (`slot`, `author`, `consent`, любые заметки) принадлежит человеку и переживает
 * перегенерацию без изменений.
 *
 * Пустой список — законное состояние: значит, арта нет и руки рисует процедура.
 */

import { S } from '../core/pixutil';

/** Рука, для которой нарисован кадр. Те же имена, что у слотов вьюмодели. */
export type ViewmodelArtSlot = 'weapon' | 'tool';

/** Кадр позы. Совпадает с `ViewmodelFrameKey`: других кадров вьюмодель не знает. */
export type ViewmodelArtFrame = 'idle' | 'fire' | 'swing' | 'swing2' | 'reload';

/**
 * Сторона исходника. Кадр принимается ТОЛЬКО этого размера и кладётся в холст
 * один в один: у вьюмодели положение дула и кисти несёт смысл, поэтому ни
 * обрезки прозрачных полей, ни подгонки масштаба здесь нет.
 */
export const VIEWMODEL_ART_SIDE = S * 2;

export interface ViewmodelArtManifestRow {
  /** Ключ кадра `<itemId>:<frame>` — ровно тот, по которому спрашивает рендер. */
  id: string;
  /** Идентификатор предмета из `src/data/items.ts`. */
  itemId: string;
  frame: ViewmodelArtFrame;
  /** В какой руке вещь. Ставится человеком: по папке слот не угадать. */
  slot: ViewmodelArtSlot;
  /** Путь к исходнику от корня репозитория. Факт, пишется запекателем. */
  sourcePath: string;
  /** SHA-256 файла-исходника. Факт, пишется запекателем. */
  sha256: string;
  /** Ширина исходника в пикселях. Факт, пишется запекателем. */
  width: number;
  /** Высота исходника в пикселях. Факт, пишется запекателем. */
  height: number;
  author?: string;
  consent?: string;
}

export const VIEWMODEL_ART_MANIFEST: readonly ViewmodelArtManifestRow[] = [
];

/** Ключ кадра для поиска и в манифесте, и в запечённом модуле. */
export function viewmodelArtFrameId(itemId: string, frame: ViewmodelArtFrame): string {
  return `${itemId}:${frame}`;
}

/** Строка манифеста по ключу `<itemId>:<frame>`. Нет строки — нет и арта. */
export function viewmodelArtManifestRow(id: string | undefined): ViewmodelArtManifestRow | undefined {
  if (!id) return undefined;
  return VIEWMODEL_ART_MANIFEST.find(row => row.id === id);
}
