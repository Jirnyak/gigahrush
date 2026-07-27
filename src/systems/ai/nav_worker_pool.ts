/* ── Navigation bake worker pool ───────────────────────────────────
 * Builds a `RegionNextSolver` that fans the R×R next-hop bake (step 4, ~98% of
 * nav-bake cost) across a pool of Web Workers sized to the machine — the more
 * cores, the more workers, no hardcoded cap. Copy-mode: each worker gets its
 * own transferred slice buffers (the page is NOT cross-origin isolated, so no
 * SharedArrayBuffer); the graph payload it reads is tiny (portal pairs + CSR
 * lists, kilobytes), so cloning per worker is cheap next to the BFS work saved.
 *
 * Returns null when Workers are unavailable (Node tests, no-DOM) — the caller
 * then runs the identical synchronous kernel. Workers are created lazily on the
 * first bake and reused across floors/samosbor rebakes for the session.
 */

import type { RegionGraph, RegionNextSolver } from './region_next';
import { REGION_UNREACHABLE } from './region_next';

/**
 * Worker budget from core count. Leave one core for the main thread and one for
 * the loading-animation worker, so the bake pool never starves the compositor.
 * `hardwareConcurrency` is a hint (often the logical-thread count); clamp to a
 * sane floor of 2 so a 3-4 core machine still parallelizes.
 */
function poolSize(): number {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(2, cores - 2);
}

let _pool: Worker[] | null = null;
let _poolTried = false;

function ensurePool(): Worker[] | null {
  if (_poolTried) return _pool;
  _poolTried = true;
  if (typeof Worker === 'undefined') return null;
  try {
    const n = poolSize();
    const pool: Worker[] = [];
    for (let i = 0; i < n; i++) {
      pool.push(new Worker(new URL('./nav_worker.ts', import.meta.url), { type: 'module' }));
    }
    _pool = pool;
  } catch {
    _pool = null; // Worker construction blocked (CSP, bundling) → sync fallback.
  }
  return _pool;
}

/**
 * Partition [1, R) into `parts` contiguous source-region ranges balanced by
 * cumulative portal degree, not region count: BFS cost for a source scales with
 * the edges its component touches, so equal-degree slabs finish closer together
 * than equal-count ones. Returns [lo, hi) pairs (hi exclusive), skipping empties.
 */
function partitionByDegree(graph: RegionGraph, parts: number): Array<[number, number]> {
  const { R, regOffsets } = graph;
  const totalDeg = regOffsets[R] - regOffsets[1];
  const target = totalDeg / parts;
  const ranges: Array<[number, number]> = [];
  let lo = 1;
  let acc = 0;
  let cut = target;
  for (let src = 1; src < R; src++) {
    acc += regOffsets[src + 1] - regOffsets[src];
    if (acc >= cut && ranges.length < parts - 1) {
      ranges.push([lo, src + 1]);
      lo = src + 1;
      cut += target;
    }
  }
  if (lo < R) ranges.push([lo, R]);
  return ranges;
}

interface NavBakeReply {
  srcLo: number;
  rows: number;
  out: Uint16Array;
}

/**
 * Create the parallel solver. Returns a function that lazily spawns the worker
 * pool on its FIRST call (so no workers are created on the title screen, and
 * none at all in a no-Worker environment) and thereafter fans each bake across
 * it. Falls back to null-signalling by rejecting only when the pool cannot be
 * built — but since spawning is lazy, this factory itself never returns null;
 * the sync fallback is chosen at bake time by prewarmNavigationTreeAsync when a
 * worker bake rejects. The solver clones the (tiny) graph arrays per worker,
 * awaits every slice, and stitches them into the dense R×R matrix.
 */
export function createWorkerRegionNextSolver(): RegionNextSolver {
  return (graph: RegionGraph): Promise<Uint16Array> => {
    const { R } = graph;
    const pool = ensurePool();
    if (!pool || pool.length === 0) {
      // No workers here — reject so the caller runs the identical sync kernel.
      return Promise.reject(new Error('nav worker pool unavailable'));
    }
    const ranges = partitionByDegree(graph, pool.length);
    const regionNext = new Uint16Array(R * R);
    regionNext.fill(REGION_UNREACHABLE);
    // Row 0 (REGION_NONE) has no source; leave it UNREACHABLE, matching sync.

    return new Promise<Uint16Array>((resolve, reject) => {
      let pending = ranges.length;
      if (pending === 0) { resolve(regionNext); return; }

      ranges.forEach(([srcLo, srcHi], i) => {
        const w = pool[i];
        const onMessage = (e: MessageEvent) => {
          w.removeEventListener('message', onMessage);
          w.removeEventListener('error', onError);
          const { srcLo: base, out } = e.data as NavBakeReply;
          regionNext.set(out, base * R);
          if (--pending === 0) resolve(regionNext);
        };
        const onError = (err: ErrorEvent) => {
          w.removeEventListener('message', onMessage);
          w.removeEventListener('error', onError);
          reject(err.error ?? new Error('nav worker failed'));
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        // Clone the graph arrays per worker (copy-mode, no SharedArrayBuffer).
        w.postMessage({
          R,
          portalRegionA: graph.portalRegionA.slice(),
          portalRegionB: graph.portalRegionB.slice(),
          regOffsets: graph.regOffsets.slice(),
          regFlat: graph.regFlat.slice(),
          srcLo,
          srcHi,
        });
      });
    });
  };
}
