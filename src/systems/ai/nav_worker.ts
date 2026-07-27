/* ── Navigation next-hop bake worker ───────────────────────────────
 * One instance per pooled core. Receives the immutable region-adjacency
 * graph (small: portal pairs + CSR region→portal lists — kilobytes, NOT the
 * 7 MB world geometry) plus a [srcLo, srcHi) source-region range, runs the
 * SAME `computeRegionNextRows` kernel the main thread uses, and transfers back
 * only its own contiguous block of matrix rows. Deterministic and
 * partition-independent: a row's contents depend only on the graph, never on
 * how [1, R) was split or on core count, so the merged matrix is bit-identical
 * to the single-threaded bake.
 */

import { computeRegionNextRows, REGION_UNREACHABLE } from './region_next';

interface NavBakeRequest {
  R: number;
  portalRegionA: Int32Array;
  portalRegionB: Int32Array;
  regOffsets: Int32Array;
  regFlat: Int32Array;
  srcLo: number;
  srcHi: number;
}

self.onmessage = (e: MessageEvent) => {
  const { R, portalRegionA, portalRegionB, regOffsets, regFlat, srcLo, srcHi } = e.data as NavBakeRequest;
  const rows = srcHi - srcLo;
  const out = new Uint16Array(rows * R);
  out.fill(REGION_UNREACHABLE);
  // Scratch sized to the full region count (BFS may traverse any region).
  const queue = new Int32Array(R);
  const firstStep = new Int32Array(R);
  const epoch = new Int32Array(R);
  computeRegionNextRows(
    R, portalRegionA, portalRegionB, regOffsets, regFlat,
    srcLo, srcHi, srcLo * R, out, queue, firstStep, epoch,
  );
  // Transfer the slice's buffer back (zero-copy) with its base row index.
  (self.postMessage as (m: unknown, t: Transferable[]) => void)({ srcLo, rows, out }, [out.buffer]);
};
