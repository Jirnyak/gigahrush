import type { Entity } from '../core/types';
import type { World } from '../core/world';
import type { TutorialGuideTarget } from '../systems/target_guide';
import { projectWorldPoint, SCR_W, SCR_H } from './webgl';

/** On-screen guidance for the current target — tutorial step or active task: a
 *  pulsing bracket on it when it is in view, and an arrow around the crosshair
 *  pointing where to turn when it is not. Reads state, decides nothing. */

const MARKER_COLOR = '#d8b25a';
const TEXT_COLOR = '#e6ddc4';
const SHADOW_COLOR = 'rgba(0,0,0,0.75)';
/** Beyond this the bracket would be a speck; the arrow carries the guidance instead. */
const MAX_MARKER_DEPTH = 26;
const ARROW_RADIUS = 30;
/** Bracket size in SCR units. Clamped both ways: a target one step away must not
 *  blow the bracket off-screen, a far one must stay findable. */
const BRACKET_MIN = 7;
const BRACKET_MAX = 26;
/** Inside this yaw window the target is effectively ahead — no turn arrow. */
const AHEAD_YAW = 0.22;

function shortDistance(dist: number): string {
  return `${Math.max(0, Math.round(dist))}м`;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  text: string,
  centerX: number,
  y: number,
  pulse: number,
): void {
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillText(text, centerX + 1 * sx, y + 1 * sy);
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(text, centerX, y);
  ctx.globalAlpha = 1;
}

function drawBracket(
  ctx: CanvasRenderingContext2D,
  sx: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  pulse: number,
): void {
  const arm = Math.max(3 * sx, Math.min(halfW, halfH) * 0.45);
  ctx.lineWidth = Math.max(1, 1.4 * sx);
  ctx.strokeStyle = MARKER_COLOR;
  ctx.globalAlpha = 0.45 + 0.55 * pulse;
  const left = cx - halfW;
  const right = cx + halfW;
  const top = cy - halfH;
  const bottom = cy + halfH;
  ctx.beginPath();
  ctx.moveTo(left, top + arm); ctx.lineTo(left, top); ctx.lineTo(left + arm, top);
  ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
  ctx.moveTo(right, bottom - arm); ctx.lineTo(right, bottom); ctx.lineTo(right - arm, bottom);
  ctx.moveTo(left + arm, bottom); ctx.lineTo(left, bottom); ctx.lineTo(left, bottom - arm);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTurnArrow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  centerX: number,
  centerY: number,
  relAngle: number,
  pulse: number,
): void {
  // relAngle is the yaw offset to the target: 0 = dead ahead, positive = to the
  // right. The arrow orbits the crosshair and points the way the player must turn.
  const screenAngle = relAngle - Math.PI / 2;
  const radius = ARROW_RADIUS * sx;
  const ax = centerX + Math.cos(screenAngle) * radius;
  const ay = centerY + Math.sin(screenAngle) * radius * (sy / sx);
  const len = 7 * sx;
  const wing = 4.5 * sx;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(screenAngle);
  ctx.globalAlpha = 0.5 + 0.5 * pulse;
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.5, -wing);
  ctx.lineTo(-len * 0.15, 0);
  ctx.lineTo(-len * 0.5, wing);
  ctx.closePath();
  ctx.fillStyle = MARKER_COLOR;
  ctx.fill();
  // Dark outline keeps the arrow readable over both lit walls and black corridors.
  ctx.lineWidth = Math.max(1, 0.8 * sx);
  ctx.strokeStyle = SHADOW_COLOR;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawTargetGuide(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  time: number,
  world: World,
  player: Entity,
  target: TutorialGuideTarget,
): void {
  const dx = world.delta(player.x, target.x);
  const dy = world.delta(player.y, target.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  let rel = Math.atan2(dy, dx) - player.angle;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;

  const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
  const projected = projectWorldPoint(world, target.x, target.y);
  const centerX = (SCR_W / 2) * sx;
  const centerY = (SCR_H / 2) * sy;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Bracket: only when the target is genuinely in front and within reading range.
  // Position and size are clamped to the viewport — a target one step away would
  // otherwise project a bracket far outside the screen and show nothing at all.
  if (projected && projected.depth > 0.35 && projected.depth < MAX_MARKER_DEPTH) {
    const half = Math.max(BRACKET_MIN, Math.min(BRACKET_MAX, projected.unitHeight * 0.4));
    const halfW = half * sx;
    const halfH = half * sy;
    const markerX = Math.max(halfW + 2 * sx, Math.min(SCR_W * sx - halfW - 2 * sx, projected.x * sx));
    const rawY = (projected.groundY - projected.unitHeight * 0.45) * sy;
    const markerY = Math.max(halfH + 12 * sy, Math.min(SCR_H * sy - halfH - 30 * sy, rawY));
    drawBracket(ctx, sx, markerX, markerY, halfW, halfH, pulse);
  }

  // Turn arrow: shown whenever the target is not straight ahead, independent of the
  // bracket, so the player always knows which way to look.
  if (Math.abs(rel) > AHEAD_YAW) {
    drawTurnArrow(ctx, sx, sy, centerX, centerY, rel, pulse);
  }

  // One fixed label slot just under the crosshair. A label that follows the marker
  // is unreadable in a small portal iframe — it clips off the edge exactly when the
  // player is most lost — and the bottom of the screen is already taken by the
  // vitals bar and the weapon panel.
  drawLabel(ctx, sx, sy, `${target.label} · ${shortDistance(dist)}`, centerX, centerY + 46 * sy, pulse);

  ctx.restore();
}
