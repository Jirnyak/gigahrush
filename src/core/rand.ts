/* ── Tiny shared randomness utilities ─────────────────────────── */
/*   Use these instead of inlining `Math.floor(Math.random()*…)`. */
/*   Keeps call-sites short and search-friendly.                  */

/** Random non-negative integer seed in [0, 99999), suitable for
 *  decals, mark stamping and other procedural variation. */
export function randSeed(): number {
  return Math.floor(Math.random() * 99999);
}

/** Inclusive integer in [a, b]. */
export function irand(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}
