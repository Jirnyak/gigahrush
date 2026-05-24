import { TITLE_LANGUAGES, type TitleLanguageId, type TitleFlagKind, titleLanguageDef } from '../data/languages';
import { controlBindingLabel } from '../systems/controls';
import { fitText } from './ui_text';

export interface TitleLanguageHit {
  id?: TitleLanguageId;
  field?: 'name' | 'seed' | 'start';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawTitleOptions {
  languageId: TitleLanguageId;
  playerName: string;
  runSeedText: string;
  activeField: 'name' | 'seed';
  cursorOn: boolean;
  mobile: boolean;
}

export function hitTitleLanguage(hits: readonly TitleLanguageHit[], x: number, y: number): TitleLanguageId | null {
  for (const hit of hits) {
    if (!hit.id) continue;
    if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) return hit.id;
  }
  return null;
}

export function hitTitleField(hits: readonly TitleLanguageHit[], x: number, y: number): 'name' | 'seed' | 'start' | null {
  for (const hit of hits) {
    if (!hit.field) continue;
    if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) return hit.field;
  }
  return null;
}

export function drawTitleScreen(ctx: CanvasRenderingContext2D, options: DrawTitleOptions): TitleLanguageHit[] {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const viewportScale = Math.min(w / 720, h / 520);
  const minScale = Math.min(0.72, Math.max(0.42, Math.min(w / 640, h / 360)));
  const s = Math.max(minScale, Math.min(1.35, viewportScale));
  const cx = w / 2;
  const cy = h / 2;
  const lang = titleLanguageDef(options.languageId);
  const shownName = options.playerName || lang.namePlaceholder;
  const nameCursor = options.cursorOn && options.activeField === 'name' ? '_' : '';
  const seedCursor = options.cursorOn && options.activeField === 'seed' ? '_' : '';
  const shownSeed = options.runSeedText || lang.seedPlaceholder;

  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#210006';
  for (let y = 0; y < h; y += 18 * s) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c00';
  ctx.font = `bold ${Math.round(48 * s)}px monospace`;
  ctx.fillText(lang.title, cx, cy - 122 * s);
  ctx.fillStyle = '#666';
  ctx.font = `${Math.round(16 * s)}px monospace`;
  ctx.fillText(lang.subtitle, cx, cy - 76 * s);

  const hits = drawLanguageSwitch(ctx, cx, cy - 44 * s, s, options.languageId);
  const fieldW = Math.min(w * 0.9, 460 * s);
  const fieldH = Math.max(20, 22 * s);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6cf';
  ctx.font = `${Math.round(14 * s)}px monospace`;
  ctx.fillText(fitText(ctx, `${lang.nameLabel}: ${shownName}${nameCursor}`, w * 0.9), cx, cy + 30 * s);
  hits.push({ field: 'name', x: cx - fieldW / 2, y: cy + 30 * s - fieldH + 5 * s, w: fieldW, h: fieldH });
  ctx.fillStyle = '#8fb';
  ctx.fillText(fitText(ctx, `${lang.seedLabel}: ${shownSeed}${seedCursor}`, w * 0.9), cx, cy + 50 * s);
  hits.push({ field: 'seed', x: cx - fieldW / 2, y: cy + 50 * s - fieldH + 5 * s, w: fieldW, h: fieldH });

  ctx.fillStyle = '#888';
  ctx.font = `${Math.round(16 * s)}px monospace`;
  ctx.fillText(fitText(ctx, lang.startPrompt, w * 0.9), cx, cy + 82 * s);
  hits.push({ field: 'start', x: cx - fieldW / 2, y: cy + 82 * s - 20 * s, w: fieldW, h: 28 * s });

  ctx.fillStyle = '#555';
  ctx.font = `${Math.round(12 * s)}px monospace`;
  if (options.mobile) {
    ctx.fillText(fitText(ctx, lang.mobileHint, w * 0.92), cx, cy + 118 * s);
  } else {
    ctx.fillText(fitText(ctx, lang.desktopHint(
      controlBindingLabel('moveForward'),
      controlBindingLabel('interact'),
    ), w * 0.92), cx, cy + 116 * s);
    ctx.fillText(fitText(ctx, lang.desktopCombatHint(
      controlBindingLabel('attack'),
      controlBindingLabel('fullscreen'),
      controlBindingLabel('controlsMenu'),
      controlBindingLabel('uiSettings'),
    ), w * 0.92), cx, cy + 130 * s);
  }

  ctx.fillStyle = '#705858';
  ctx.font = `${Math.round(11 * s)}px monospace`;
  ctx.fillText(fitText(ctx, lang.languageHint, w * 0.9), cx, cy + 150 * s);

  ctx.textAlign = 'left';
  return hits;
}

function drawLanguageSwitch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  s: number,
  activeId: TitleLanguageId,
): TitleLanguageHit[] {
  const chipW = 120 * s;
  const chipH = 44 * s;
  const gap = 10 * s;
  const totalW = TITLE_LANGUAGES.length * chipW + (TITLE_LANGUAGES.length - 1) * gap;
  const x0 = cx - totalW / 2;
  const hits: TitleLanguageHit[] = [];

  for (let i = 0; i < TITLE_LANGUAGES.length; i++) {
    const def = TITLE_LANGUAGES[i];
    const x = x0 + i * (chipW + gap);
    const active = def.id === activeId;
    ctx.fillStyle = active ? 'rgba(50,18,18,0.92)' : 'rgba(8,16,18,0.72)';
    ctx.strokeStyle = active ? '#d6b24c' : '#304a50';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.fillRect(x, y, chipW, chipH);
    ctx.strokeRect(x + 0.5, y + 0.5, chipW - 1, chipH - 1);

    drawFlag(ctx, def.flag, x + 7 * s, y + 7 * s, 42 * s, 28 * s);
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#ffd46a' : '#86a9ad';
    ctx.font = `bold ${Math.round(12 * s)}px monospace`;
    ctx.fillText(def.code, x + 56 * s, y + 18 * s);
    ctx.fillStyle = active ? '#d8c68a' : '#60777a';
    ctx.font = `${Math.round(9 * s)}px monospace`;
    ctx.fillText(fitText(ctx, def.name, chipW - 62 * s), x + 56 * s, y + 32 * s);
    hits.push({ id: def.id, x, y, w: chipW, h: chipH });
  }

  return hits;
}

function drawFlag(ctx: CanvasRenderingContext2D, kind: TitleFlagKind, x: number, y: number, w: number, h: number): void {
  if (kind === 'soviet') drawSovietFlag(ctx, x, y, w, h);
  else drawBritishEmpireFlag(ctx, x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawSovietFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#b00018';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x, y + h * 0.64, w, h * 0.36);
  ctx.fillStyle = '#ffd75a';
  drawStar(ctx, x + w * 0.26, y + h * 0.22, h * 0.11);

  ctx.save();
  ctx.fillStyle = '#ffd75a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * 0.74)}px "Arial Unicode MS", "Apple Symbols", "Noto Sans Symbols", sans-serif`;
  ctx.fillText('☭', x + w * 0.47, y + h * 0.61);
  ctx.restore();
}

function drawBritishEmpireFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#102a68';
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = h * 0.25;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = h * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = h * 0.34;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
