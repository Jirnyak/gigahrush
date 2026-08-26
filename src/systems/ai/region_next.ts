/* ── Ядро колонок следующего шага (чистое) ─────────────────────────
 * Один BFS по графу смежности регионов, заполняющий КОЛОНКУ следующих шагов к
 * заданному целевому региону: `col[cur]` — куда шагнуть из `cur`, чтобы идти к
 * `rT`. Колонка считается по требованию и живёт в LRU у `pathfinding`.
 *
 * Здесь же раньше жил `computeRegionNextRows` — строитель плотной матрицы R×R,
 * ради параллельной сборки которой существовал целый воркерный пул. Матрица
 * стоила 1132 МБ на жилом этаже и 1720 МБ на квартирах и убивала вкладку по
 * OOM; замер показал, что колонки дают ту же достижимость (300/300 пар) при
 * той же средней длине маршрута (±0.0%). Матрица и пул удалены, осталось это.
 *
 * Функция чистая: ни World, ни DOM, ни RNG, ни модульного состояния. Читает
 * только неизменяемый граф (CSR-списки порталов и пара регионов на портал) и
 * пишет в переданный ей буфер.
 */

export const REGION_NONE = 0;
export const REGION_UNREACHABLE = 65535;

// Below this region count the worker fan-out overhead (payload clone +
// postMessage round-trip) outweighs the parallel win, so the bake runs the
// synchronous kernel instead. Small floors bake in well under a frame anyway.

/** Immutable region-adjacency graph, flattened to transferable typed arrays. */
export interface RegionGraph {
  R: number;
  /** regionA/regionB per portal, indexed by portal id. */
  portalRegionA: Int32Array;
  portalRegionB: Int32Array;
  /** CSR: region r owns portals regFlat[regOffsets[r] .. regOffsets[r+1]). */
  regOffsets: Int32Array;
  regFlat: Int32Array;
}

/**
 * Parallel step-4 executor: given the region graph, return the full R×R
 * next-hop matrix (rows 1..R-1 computed, row 0 all UNREACHABLE). Injected into
 * the bake so the worker pool stays out of the RED pathfinding module; null in
 * Node/no-Worker environments, where the bake falls back to the sync kernel.
 */


/**
 * Compute ONE column of the next-hop matrix: for the given target region `rT`,
 * fill `col[cur]` = the next region to step into on a shortest (fewest hops)
 * route cur→rT, or REGION_UNREACHABLE if disconnected. `col[rT] = rT`.
 *
 * This is the memory-frugal alternative to the dense R×R matrix used on
 * devices that cannot afford `R²·2` bytes (phones — a mid floor's matrix is
 * hundreds of MB and trips the iOS/WebKit per-tab memory ceiling). One BFS
 * rooted at rT over the same immutable region graph; the caller keeps a small
 * LRU of recently-requested columns instead of all R of them. `col` must be
 * length ≥ R and pre-filled with REGION_UNREACHABLE; `queue` is scratch of
 * length ≥ R.
 *
 * The graph is undirected, so a BFS from rT is a shortest-hop tree: whenever a
 * node is first reached via neighbour `p`, `p` is exactly one hop closer to rT,
 * so the next step from that node toward rT is `p`. This yields a valid
 * shortest route (it may pick a different equal-length chain than the row
 * kernel's tie-break, which is acceptable — the dense matrix is PC-only).
 */
export function computeRegionNextColumn(
  R: number,
  portalRegionA: Int32Array,
  portalRegionB: Int32Array,
  regOffsets: Int32Array,
  regFlat: Int32Array,
  rT: number,
  col: Uint16Array,
  queue: Int32Array,
): void {
  if (rT <= REGION_NONE || rT >= R) return;
  if (regOffsets[rT + 1] === regOffsets[rT]) return; // Isolated target.

  col[rT] = rT;
  let qH = 0, qT = 0;
  queue[qT++] = rT;
  while (qH < qT) {
    const cur = queue[qH++];
    const cEnd = regOffsets[cur + 1];
    for (let a = regOffsets[cur]; a < cEnd; a++) {
      const pi = regFlat[a];
      const ra = portalRegionA[pi];
      const nbr = ra === cur ? portalRegionB[pi] : ra;
      // `nbr` is one hop farther from rT than `cur`; its step toward rT is
      // `cur` itself. col[nbr] !== UNREACHABLE means already reached (closer).
      if (nbr === REGION_NONE || col[nbr] !== REGION_UNREACHABLE) continue;
      col[nbr] = cur;
      queue[qT++] = nbr;
    }
  }
}
