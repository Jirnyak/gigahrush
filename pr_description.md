🧹 [Code Health] Reduce parameters for trubnyy_avtomat drawing functions

🎯 **What:**
Refactored procedural drawing functions (`put`, `rect`, `ellipse`, `ellipseBand`) in `src/entities/trubnyy_avtomat.ts` to reduce their parameter counts. `rect` and `ellipse` were previously taking 9 parameters; they now take 6, by bundling `r`, `g`, `b`, and `seed` into a `style` options object. `put` and `ellipseBand` now take pre-packed `color` (uint32) instead of individual color components.

💡 **Why:**
Functions with a high number of parameters are difficult to read, maintain, and prone to parameter-ordering bugs. Grouping related styling arguments into options objects and using uniform color integers makes the function signatures cleaner and the calling code easier to grok without needing to remember exact parameter positions.

✅ **Verification:**
- `npm run typecheck` passes successfully.
- `npm run test:unit` executed and passes with no regressions.
- Checked content registry with `npm run content:audit`.

✨ **Result:**
Cleaner drawing utility signatures and more readable caller code inside `generateSprite()` in `trubnyy_avtomat.ts`, improving code health while perfectly preserving the sprite generation output.
