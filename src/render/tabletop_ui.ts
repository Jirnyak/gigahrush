/* ── Tabletop panels: the drawing half of the game registry ──────────────────
 *
 * `systems/tabletop.ts` holds the rules; this holds the panel. They are split
 * because `systems/` sits below `render/` in the layer order and must not reach
 * up into it — so a game registers its rules there and its panel here, keyed by
 * the same id. `npc_ui.ts` then draws whatever table is open without naming a
 * single game.
 */

export type TabletopPanelDraw = (
  ctx: CanvasRenderingContext2D,
  snapshot: never,
  px: number,
  py: number,
  pw: number,
  ph: number,
  sx: number,
  sy: number,
  time: number,
) => void;

const panels = new Map<string, TabletopPanelDraw>();

/** Called from `render/<game>_ui.ts`. The id must match the rules registration
 *  in `systems/<game>.ts`. */
export function registerTabletopPanel(id: string, draw: TabletopPanelDraw): void {
  panels.set(id, draw);
}

export function tabletopPanel(id: string): TabletopPanelDraw | undefined {
  return panels.get(id);
}
