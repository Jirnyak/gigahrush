🎯 **What:**
The task required adding testing coverage for the `isGamePushCloudSaveSizeAllowed` function in `src/systems/platform_bridge.ts`. Testing simple size thresholds ensures reliability and prevents players from generating rejected cloud saves due to malformed payload lengths or integer overflows.

📊 **Coverage:**
Additional tests were added in `tests/platform-bridge.test.ts` to assert functionality of `isGamePushCloudSaveSizeAllowed`. Furthermore, similar edge case test assertions were added for `isPortalCloudSaveSizeAllowed`.
The tests cover:
- Allowed limit.
- Exceeding limit.
- Negative sizes (e.g., `-1`).
- `NaN` values.
- `Infinity`.

✨ **Result:**
Enhanced the robustness and code coverage around platform cloud save size checks with new verified tests.
