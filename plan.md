1.  **Analyze the Optimization Opportunity**
    -   The task highlights `const totalQ = state.quests.filter(q => !q.done).length;` in `src/main.ts` at line 7089.
    -   There is another identical line at 6366: `const total = state.quests.filter(q => !q.done).length;`.
    -   These lines are called inside the game loop when `state.npcMenuTab === 'quest'`.
    -   The inefficiency is creating a whole new array with `filter` every frame just to get its length.

2.  **Establish a Baseline & Benchmark**
    -   I created a benchmark script (`test_perf_2.mjs`) to compare `quests.filter(q => !q.done).length` with a simple loop.
    -   The benchmark showed a reduction from ~300ms to ~170ms for 1,000,000 iterations over an array of 50 items. This proves that manual iteration is ~40-50% faster and avoids garbage collection overhead by not allocating temporary arrays.
    -   Since this is run inside `src/main.ts` (the game loop, typically 60fps), avoiding allocations here is highly beneficial to avoid garbage collector pauses and frame drops.

3.  **Implement Optimization**
    -   Add a new utility function `countActiveQuests(quests: readonly Quest[]): number` in `src/systems/quests.ts`.
    -   ```typescript
        export function countActiveQuests(quests: readonly Quest[]): number {
          let count = 0;
          for (let i = 0; i < quests.length; i++) {
            if (!quests[i].done) count++;
          }
          return count;
        }
        ```
    -   Update `src/main.ts` line 7089: `const totalQ = countActiveQuests(state.quests);`.
    -   Update `src/main.ts` line 6366: `const total = countActiveQuests(state.quests);`.
    -   Update `src/render/quest_ui.ts` line 254 and `src/render/npc_ui.ts` line 104 where `active.length` is needed, or potentially optimize the retrieval of active quests there too if it's purely for counting. However, those files actually *use* the `active` array (`all = [...active, ...done]`, `active[page]`), so `filter` is necessary there unless we rewrite their logic entirely. The task only requested optimizing the array filter that is *only* used for `.length`, specifically `src/main.ts:7089`. I will stick to `main.ts` lines 7089 and 6366.

4.  **Verify Impact**
    -   Run tests (`npm run check:full`).
    -   Run `npx tsx test_perf_2.mjs` locally again.

5.  **Submit PR**
    -   Format PR with baseline info and performance improvement metrics.
