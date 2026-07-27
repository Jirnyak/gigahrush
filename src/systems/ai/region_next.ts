/* ── Region next-hop kernel (pure, worker-safe) ────────────────────
 * The hot inner loop of the HPA* navigation bake: one BFS per source
 * region over the region-adjacency graph, filling the dense R×R next-hop
 * matrix. This is the single 98%-of-bake cost (`buildRegionNext`), extracted
 * as a PURE function so the synchronous main-thread bake and the parallel
 * Web Workers run BIT-IDENTICAL code — the only difference is which slice of
 * source rows each caller computes. No World, DOM, RNG or module state: safe
 * to import from a worker bundle.
 *
 * Determinism / partition-independence: each source region's BFS reads only
 * the immutable graph (CSR portal lists + per-portal region pair) and writes
 * only its own matrix row via per-call scratch, so a row is identical no
 * matter how [1, R) is split across workers or whether it runs synchronously.
 */

export const REGION_NONE = 0;
export const REGION_UNREACHABLE = 65535;

// Below this region count the worker fan-out overhead (payload clone +
// postMessage round-trip) outweighs the parallel win, so the bake runs the
// synchronous kernel instead. Small floors bake in well under a frame anyway.
export const MIN_REGIONS_FOR_WORKERS = 2048;

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
export type RegionNextSolver = (graph: RegionGraph) => Promise<Uint16Array>;

/**
 * Compute next-hop rows for source regions in [srcLo, srcHi) into `out`.
 *
 * `out[src*R - outBase + col]` = the next region to step into on a shortest
 * (fewest region hops) route src→col, or REGION_UNREACHABLE if disconnected.
 *   - Full matrix (sync bake):  out = Uint16Array(R*R), outBase = 0.
 *   - Worker slice:             out = Uint16Array((srcHi-srcLo)*R), outBase = srcLo*R.
 * `out` must be pre-filled with REGION_UNREACHABLE. `queue`/`firstStep`/`epoch`
 * are caller-provided scratch of length ≥ R (reused across all src here).
 */
export function computeRegionNextRows(
  R: number,
  portalRegionA: Int32Array,
  portalRegionB: Int32Array,
  regOffsets: Int32Array,
  regFlat: Int32Array,
  srcLo: number,
  srcHi: number,
  outBase: number,
  out: Uint16Array,
  queue: Int32Array,
  firstStep: Int32Array,
  epoch: Int32Array,
): void {
  // Zero the visited-epoch scratch so a fresh local epochId counter (starting
  // at 1) can never collide with stale marks from a previous bake/worker.
  epoch.fill(0);
  let epochId = 0;

  for (let src = srcLo; src < srcHi; src++) {
    // Region with no portals is isolated — its row stays UNREACHABLE.
    if (regOffsets[src + 1] === regOffsets[src]) continue;

    const rowBase = src * R - outBase;
    out[rowBase + src] = src;
    epochId++;
    epoch[src] = epochId;

    let qH = 0, qT = 0;
    queue[qT++] = src;
    while (qH < qT) {
      const cur = queue[qH++];
      const cEnd = regOffsets[cur + 1];
      for (let a = regOffsets[cur]; a < cEnd; a++) {
        const pi = regFlat[a];
        const ra = portalRegionA[pi];
        const nbr = ra === cur ? portalRegionB[pi] : ra;
        if (nbr === REGION_NONE || epoch[nbr] === epochId) continue;
        epoch[nbr] = epochId;
        // First hop out of src is the neighbour itself; deeper hops inherit
        // the first step recorded on `cur`.
        const step = cur === src ? nbr : firstStep[cur];
        out[rowBase + nbr] = step;
        firstStep[nbr] = step;
        queue[qT++] = nbr;
      }
    }
  }
}
