💡 **What:**
Replaced a nested iteration with an O(1) Map lookup inside a single array traversal. A reverse map `ROOM_NAME_TO_KEY` was added at the module level. Inside `findSpectralRooms`, we now loop over `world.rooms` exactly once instead of executing `Array.prototype.find()` on `world.rooms` for each defined key in `SPECTRAL_CHASOVNYA_ROOM_NAMES`.

🎯 **Why:**
The old `findSpectralRooms` function iterated over K keys and for each key, called `.find()` over the N rooms array. This resulted in an O(K * N) performance curve. Since `world.rooms` can contain thousands of items (in large map generation contexts), optimizing this loop to run only once O(N) provides a solid micro-optimization.

📊 **Measured Improvement:**
In a benchmark utilizing 10,000 rooms iterating 1,000 times on the mock `world` structure:
- Baseline: ~463.88ms
- Improved: ~225.53ms

This resulted in an execution time reduction of over 50% (>2x speedup) for this specific codepath. The improvement effectively eliminates repeated passes over the large candidate array.
