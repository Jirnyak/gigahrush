/* Пустая матрица для онлайн-сборки Cloudflare: ассет Worker ограничен 25 МБ,
   марковское ядро туда не влезает (см. commit.md §6). Контракт экспортов
   обязан совпадать с настоящей матрицей — рантайм импортирует из неё и
   словарь тегов, и распаковку ребра, а алиас подставляется только на сборке,
   поэтому tsc расхождение не поймает. Пустой граф уводит генератор в
   онлайн-заглушку ещё до первого обхода. */

export const COMPILED_CATEGORIES = {};
export const COMPILED_SKELETONS = [];
export const COMPILED_MARKOV_GRAPH = {};
export const COMPILED_PATTERN_DISTANCES = {};
export const COMPILED_TAG_BITS: Record<string, number> = {};
export const COMPILED_MASK_TABLE: readonly number[] = [];

export const MARKOV_EDGE_COUNT_SCALE = 1 << 14;

export function markovEdgeCount(edge: number): number {
  return (edge / MARKOV_EDGE_COUNT_SCALE) | 0;
}

export function markovEdgeMask(_edge: number): number {
  return 0;
}
