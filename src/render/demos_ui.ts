/* ── Инфосеть Демос: read-only A-Life profile browser ─────────── */

import { type Entity, type GameState } from '../core/types';
import { generateNpcProfileSprite } from '../entities/procedural_visuals';
import { type DemosProfile, getDemosSnapshot } from '../systems/demos';
import { controlBindingLabel, menuCloseHint } from '../systems/controls';
import { S } from './pixutil';
import { drawGlitchText, drawNeuroPanel } from './hud_fx';
import { fitText } from './ui_text';

const PORTRAIT_CACHE_MAX = 24;
const portraitCache = new Map<string, HTMLCanvasElement>();

function cacheKey(profile: DemosProfile): string {
  return `${profile.npcVisualId ?? ''}:${profile.spriteSeed}:${profile.sprite}:${profile.occupation}:${profile.faction}:${profile.female ? 1 : 0}`;
}

function trimPortraitCache(): void {
  while (portraitCache.size > PORTRAIT_CACHE_MAX) {
    const first = portraitCache.keys().next().value;
    if (first === undefined) return;
    portraitCache.delete(first);
  }
}

function portraitCanvas(profile: DemosProfile): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = cacheKey(profile);
  const cached = portraitCache.get(key);
  if (cached) {
    portraitCache.delete(key);
    portraitCache.set(key, cached);
    return cached;
  }
  const data = generateNpcProfileSprite(
    profile.spriteSeed,
    profile.occupation,
    profile.faction,
    profile.female,
    profile.sprite,
    profile.npcVisualId,
  );
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const bytes = new Uint8ClampedArray(S * S * 4);
  bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  ctx.putImageData(new ImageData(bytes, S, S), 0, 0);
  portraitCache.set(key, canvas);
  trimPortraitCache();
  return canvas;
}

function drawFallbackPortrait(
  ctx: CanvasRenderingContext2D,
  profile: DemosProfile,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const data = generateNpcProfileSprite(
    profile.spriteSeed,
    profile.occupation,
    profile.faction,
    profile.female,
    profile.sprite,
    profile.npcVisualId,
  );
  const srcX0 = 10;
  const srcX1 = 54;
  const srcY0 = 0;
  const srcY1 = 40;
  const px = w / (srcX1 - srcX0 + 1);
  const py = h / (srcY1 - srcY0 + 1);
  for (let sy = srcY0; sy <= srcY1; sy++) {
    for (let sx = srcX0; sx <= srcX1; sx++) {
      const c = data[sy * S + sx];
      const a = c >>> 24;
      if (a === 0) continue;
      const r = c & 0xff;
      const g = (c >>> 8) & 0xff;
      const b = (c >>> 16) & 0xff;
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(x + (sx - srcX0) * px, y + (sy - srcY0) * py, Math.ceil(px), Math.ceil(py));
    }
  }
}

function drawProfilePortrait(
  ctx: CanvasRenderingContext2D,
  profile: DemosProfile,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = 'rgba(2,12,16,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = profile.dead ? 'rgba(160,60,70,0.55)' : 'rgba(0,220,190,0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const canvas = portraitCanvas(profile);
  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.07));
  if (canvas) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 10, 0, 45, 40, x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.imageSmoothingEnabled = true;
  } else {
    drawFallbackPortrait(ctx, profile, x + pad, y + pad, w - pad * 2, h - pad * 2);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  sy: number,
  color = '#cbd7d7',
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `${7.5 * sy}px monospace`;
  ctx.fillStyle = '#668f91';
  const labelW = Math.min(84 * sy, w * 0.42);
  ctx.fillText(fitText(ctx, label, labelW), x, y);
  ctx.fillStyle = color;
  ctx.fillText(fitText(ctx, value, Math.max(16, w - labelW - 4 * sy)), x + labelW, y);
}

export function drawDemosMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  entities: readonly Entity[],
  sx: number,
  sy: number,
  uiTime = state.time,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,5,0.88)';
  ctx.fillRect(0, 0, w, h);

  const panelW = Math.min(w - 14 * sx, 520 * sx);
  const panelH = Math.min(h - 14 * sy, 326 * sy);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;
  drawNeuroPanel(ctx, px, py, panelW, panelH, uiTime, 913);

  ctx.textBaseline = 'top';
  drawGlitchText(ctx, 'ИНФОСЕТЬ ДЕМОС', px + 12 * sx, py + 10 * sy, uiTime, 914, '#25ffd0', 13 * sy);

  const snapshot = getDemosSnapshot(state, entities, state.demosCursor, state.demosSearchActive ? '' : state.demosSearch);
  const searchX = px + 12 * sx;
  const searchY = py + 32 * sy;
  const searchW = panelW - 24 * sx;
  const searchH = 18 * sy;
  ctx.fillStyle = state.demosSearchActive ? 'rgba(0,46,42,0.85)' : 'rgba(0,18,22,0.78)';
  ctx.fillRect(searchX, searchY, searchW, searchH);
  ctx.strokeStyle = state.demosSearchActive ? 'rgba(40,255,210,0.85)' : 'rgba(0,150,140,0.35)';
  ctx.strokeRect(searchX + 0.5, searchY + 0.5, searchW - 1, searchH - 1);
  ctx.font = `${8 * sy}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#5e8';
  const cursor = state.demosSearchActive && Math.floor(uiTime * 2) % 2 === 0 ? '_' : '';
  const query = state.demosSearch || 'alife:ID / имя / plot:ID';
  ctx.fillText(fitText(ctx, `поиск: ${query}${cursor}`, searchW - 10 * sx), searchX + 5 * sx, searchY + 4 * sy);

  if (!snapshot.profile) {
    ctx.font = `${10 * sy}px monospace`;
    ctx.fillStyle = snapshot.notFound ? '#f86' : '#789';
    const text = snapshot.notFound ? 'Профиль не найден в текущей A-Life популяции.' : 'A-Life популяция ещё не готова.';
    ctx.fillText(fitText(ctx, text, panelW - 24 * sx), px + 12 * sx, py + 72 * sy);
  } else {
    const p = snapshot.profile;
    const portraitW = Math.min(116 * sx, panelW * 0.28);
    const portraitH = Math.min(142 * sy, panelH - 106 * sy);
    const portraitX = px + 14 * sx;
    const portraitY = py + 62 * sy;
    drawProfilePortrait(ctx, p, portraitX, portraitY, portraitW, portraitH);

    ctx.font = `bold ${10.5 * sy}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.dead ? '#a77' : '#eff';
    const infoX = portraitX + portraitW + 12 * sx;
    const infoY = portraitY;
    const infoW = px + panelW - infoX - 14 * sx;
    ctx.fillText(fitText(ctx, p.name, infoW), infoX, infoY);
    ctx.font = `${7.5 * sy}px monospace`;
    ctx.fillStyle = '#789';
    ctx.fillText(fitText(ctx, `${p.idLabel}${p.plotIdLabel ? `  ${p.plotIdLabel}` : ''}`, infoW), infoX, infoY + 14 * sy);

    let y = infoY + 32 * sy;
    drawLine(ctx, 'отношение', `${p.relationScore} / ${p.relationLabel}`, infoX, y, infoW, sy, p.relationColor); y += 12 * sy;
    drawLine(ctx, 'фракция', p.factionLabel, infoX, y, infoW, sy); y += 12 * sy;
    drawLine(ctx, 'занятие', p.occupationLabel, infoX, y, infoW, sy); y += 12 * sy;
    drawLine(ctx, 'уровень', `L${p.level}`, infoX, y, infoW, sy, '#edb'); y += 12 * sy;
    drawLine(ctx, 'где сейчас', p.locationLabel, infoX, y, infoW, sy, p.dead ? '#b77' : '#9cf'); y += 12 * sy;
    drawLine(ctx, 'статус', `${p.statusLabel}, ${p.questLabel}`, infoX, y, infoW, sy); y += 12 * sy;
    drawLine(ctx, 'здоровье', p.healthLabel, infoX, y, infoW, sy, p.dead ? '#b77' : '#cfd'); y += 12 * sy;
    drawLine(ctx, 'счёт', p.moneyLabel, infoX, y, infoW, sy, '#dcb'); y += 12 * sy;
    drawLine(ctx, 'карма', p.karmaLabel, infoX, y, infoW, sy, Number(p.karmaLabel) < 0 ? '#fa8' : '#9d9');

    ctx.font = `${7 * sy}px monospace`;
    ctx.fillStyle = '#688';
    ctx.fillText(
      fitText(ctx, `профиль ${p.cursor + 1}/${p.total}  ${p.floorKey}`, panelW - 28 * sx),
      px + 14 * sx,
      py + panelH - 38 * sy,
    );
  }

  ctx.font = `${7 * sy}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#456';
  const searchHint = state.demosSearchActive
    ? 'печать — фильтр  |  Backspace — стереть  |  Del — очистить  |  Enter — применить'
    : `${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} или колесо — листать  |  Enter — поиск`;
  ctx.fillText(
    fitText(ctx, `${searchHint}  |  ${menuCloseHint()} — закрыть`, panelW - 18 * sx),
    px + panelW / 2,
    py + panelH - 18 * sy,
  );
  ctx.textAlign = 'left';
}
