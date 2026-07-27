// Some floor generators clobber module-level RUNTIME singletons as a side effect
// of building a floor — live state that gameplay reads every frame. Resetting it
// is correct for a real floor load (fresh floor → fresh runtime state), but harmful
// when we regenerate a *throwaway* base while that floor is still live (the
// save-time delta base in floor_memory / main.ts). Such systems register a
// snapshot/restore pair here; `withPreservedGenerationRuntime` wraps a throwaway
// regen so the live singletons survive it — mirroring how `withSeededRandom`
// saves/restores the global RNG state.
//
// Generic and content-agnostic: this file imports nothing from gen/ or content.
// Kvartiry's social-pressure module (and any future offender) registers itself.

export interface GenerationRuntimeGuard {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const guards: GenerationRuntimeGuard[] = [];

export function registerGenerationRuntimeGuard(guard: GenerationRuntimeGuard): void {
  guards.push(guard);
}

// Run `fn` (a throwaway floor regen) with every registered live singleton
// snapshotted before and restored after, even if `fn` throws. Returns fn's result.
export function withPreservedGenerationRuntime<T>(fn: () => T): T {
  if (guards.length === 0) return fn();
  const snapshots = guards.map(guard => guard.snapshot());
  try {
    return fn();
  } finally {
    for (let i = 0; i < guards.length; i++) guards[i].restore(snapshots[i]);
  }
}
