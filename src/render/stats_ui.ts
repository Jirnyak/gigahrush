/* ── Inventory panel (fullscreen) ──────────────────────────────── */

import { type Entity, type GameState, ItemType, DamageType } from '../core/types';
import { ITEMS, WEAPON_STATS } from '../data/catalog';
import { itemInstanceName } from '../data/items';
import { getEquippedToolDurability, getWeaponReadiness } from '../systems/inventory';
import { controlHint, menuCloseHint } from '../systems/controls';
import { RPG_LEVEL_CAP, xpForLevel } from '../systems/rpg';
import { zhelemishStatsLine } from '../systems/status';
import { drawNeuroPanel, drawGlitchText, textJitter, flicker } from './hud_fx';
import { fitTextStable as fitStatText, formatUiNumber, wrapTextLines } from './ui_text';
import { drawInventoryFinanceBlock, readFinanceSnapshot } from './economy_ui';
import { fullscreenInventoryLayout, type FullscreenInventoryLayout, type UiRect } from './ui_layout';
import { drawItemGridIcon } from './item_sprites';

function damageTypeLabel(dt: DamageType | undefined): { text: string; color: string } {
  switch (dt) {
    case DamageType.FIRE: return { text: '🔴 огонь', color: '#b35a3f' };
    case DamageType.ENERGY: return { text: '🔵 энерго', color: '#4d8fa0' };
    case DamageType.PSI: return { text: '🟣 пси', color: '#9a6a9c' };
    case DamageType.BUCKSHOT: return { text: '🟡 дробь', color: '#c2a24c' };
    case DamageType.BIO: return { text: '🟢 био', color: '#6f9a55' };
    case DamageType.KINETIC:
    default: return { text: '⚫ кинетика', color: '#aaa' };
  }
}

/** Одна строка правой колонки: текст, цвет, кегль в текстовых единицах и
 *  БАЗОВАЯ ЛИНИЯ, по которой её кладёт `fillText`. */
interface InventoryDetailLine {
  text: string;
  color: string;
  fontUnits: number;
  y: number;
}

/** Вертикаль правой колонки инвентаря — ПОТОК, а не постоянный отступ: описание
 *  предмета занимает от одной до четырёх строк, ниже могут встать строка урона,
 *  заголовок сопротивлений и по строке на каждое сопротивление. Всё, что ниже,
 *  уезжает вместе с ними.
 *
 *  Это единственная арифметика вертикали: рисование идёт по ней, слой нажатия
 *  спрашивает её через `inventoryActionRows`. Второй копии быть не должно —
 *  именно она стоила игроку строки «ИСП./ВЫК.»: попадание считалось по
 *  фиксированному `details.y + 37*ts`, а текст рисовался по потоку, и полосы не
 *  пересекались ни на одном размере холста. */
interface InventoryDetailFlow {
  lines: InventoryDetailLine[];
  hasItem: boolean;
  hasUse: boolean;
  priceY: number;
  priceText: string;
  /** Базовая линия строки «ИСП./ВЫК.». */
  actionY: number;
  /** Базовая линия строки имени игрока. */
  titleY: number;
  /** Базовая линия строки СИЛ/ЛОВ/ИНТ. */
  attrY: number;
}

function inventoryDetailFlow(
  ctx: CanvasRenderingContext2D,
  player: Entity,
  state: GameState,
  layout: FullscreenInventoryLayout,
): InventoryDetailFlow {
  const ts = layout.textScale;
  const details = layout.details;
  const inv = player.inventory ?? [];
  const validInvSelection = state.invSel < inv.length;
  const item = validInvSelection ? inv[state.invSel] : undefined;
  const def = item ? ITEMS[item.defId] : undefined;
  const lines: InventoryDetailLine[] = [];
  let infoY = details.y + 7.5 * ts;
  let priceY = infoY;
  let priceText = '';
  let actionY = infoY;
  let hasUse = false;

  if (item && def) {
    ctx.font = `${5.6 * ts}px "Press Start 2P", monospace`;
    for (const text of wrapTextLines(ctx, def.desc, details.w, 4, { stable: true, mode: 'clip' })) {
      lines.push({ text, color: '#999', fontUnits: 5.6, y: infoY });
      infoY += 6.6 * ts;
    }
    if (def.type === ItemType.WEAPON) {
      const ws = WEAPON_STATS[def.id];
      if (ws) {
        const dt = damageTypeLabel(ws.damageType);
        lines.push({ text: `Урон: ${dt.text}`, color: dt.color, fontUnits: 5.6, y: infoY });
        infoY += 6.6 * ts;
      }
    }
    if (def.resistances) {
      lines.push({ text: 'Сопротивления:', color: '#7996a4', fontUnits: 5.6, y: infoY });
      infoY += 6.6 * ts;
      for (const [dtStr, val] of Object.entries(def.resistances)) {
        const dt = parseInt(dtStr, 10) as DamageType;
        if (!isNaN(dt) && val) {
          const dtInfo = damageTypeLabel(dt);
          lines.push({ text: `  ${dtInfo.text}: ${val}%`, color: dtInfo.color, fontUnits: 5.6, y: infoY });
          infoY += 6.6 * ts;
        }
      }
    }
    priceY = infoY + 1.4 * ts;
    priceText = `Цена: ${def.value ?? 0}₽`;
    actionY = infoY + 7.4 * ts;
    hasUse = !!(def.use || def.type === ItemType.WEAPON || def.type === ItemType.TOOL || def.resistances);
    infoY = actionY + 4 * ts;
  } else if (!validInvSelection) {
    lines.push({ text: 'Пустой слот', color: '#555', fontUnits: 5.2, y: infoY });
    infoY += 3 * ts;
  }

  const titleY = Math.max(infoY + 4 * ts, details.y + 12 * ts);
  return {
    lines,
    hasItem: !!(item && def),
    hasUse,
    priceY,
    priceText,
    actionY,
    titleY,
    attrY: titleY + 6.6 * ts,
  };
}

export type InventoryAttrKey = 'str' | 'agi' | 'int';

const ATTR_SEPARATOR = '  ';

/** Сегменты строки характеристик ровно в том виде, в каком их склеивает
 *  `fillText`: ключ подсказки показывается только пока есть что тратить. */
function inventoryAttrSegments(rpg: NonNullable<Entity['rpg']>): { key: InventoryAttrKey; text: string }[] {
  const hint = rpg.attrPoints > 0;
  return [
    { key: 'str', text: `${hint ? controlHint('attrStr') : ''}СИЛ ${rpg.str}` },
    { key: 'agi', text: `${hint ? controlHint('attrAgi') : ''}ЛОВ ${rpg.agi}` },
    { key: 'int', text: `${hint ? controlHint('attrInt') : ''}ИНТ ${rpg.int}` },
  ];
}

function inventoryAttrLine(rpg: NonNullable<Entity['rpg']>): string {
  return inventoryAttrSegments(rpg).map(seg => seg.text).join(ATTR_SEPARATOR);
}

export interface InventoryActionRows {
  /** Полоса «ИСП.» — только когда строка действительно нарисована. */
  use?: UiRect;
  /** Полоса «ВЫК.». */
  drop?: UiRect;
  /** Сегменты строки СИЛ/ЛОВ/ИНТ, каждый под своими же буквами. */
  attr: { key: InventoryAttrKey; rect: UiRect }[];
}

/** Полосы попадания строк инвентаря, которые ставит поток отрисовки.
 *
 *  Горизонталь (две колонки действий и ширина колонки характеристик) принадлежит
 *  `fullscreenInventoryLayout`; вертикаль — только потоку выше. Полосы намеренно
 *  узкие: сверху к строке действий примыкает «Цена», снизу — имя игрока, и
 *  расширять полосу значило бы снова ловить палец на чужой надписи. */
export function inventoryActionRows(
  ctx: CanvasRenderingContext2D,
  player: Entity,
  state: GameState,
  sx: number,
  sy: number,
): InventoryActionRows {
  const layout = fullscreenInventoryLayout(ctx.canvas.width, ctx.canvas.height, sx, sy);
  const ts = layout.textScale;
  const flow = inventoryDetailFlow(ctx, player, state, layout);
  const rows: InventoryActionRows = { attr: [] };

  if (flow.hasItem) {
    const y = flow.actionY - 6 * ts;
    const h = 8.4 * ts;
    if (flow.hasUse) rows.use = { x: layout.use.x, y, w: layout.use.w, h };
    rows.drop = { x: layout.drop.x, y, w: layout.drop.w, h };
  }

  const rpg = player.rpg;
  if (rpg) {
    ctx.font = `${5 * ts}px "Press Start 2P", monospace`;
    const barW = Math.max(24 * layout.scale, layout.attr.w);
    const segs = inventoryAttrSegments(rpg);
    // Мерить надо ровно ту строку, которую положил fillText: `fitStatText` и
    // обрезает, и переводит, так что сегменты берутся из НЕЁ, а не из исходных.
    const parts = fitStatText(ctx, inventoryAttrLine(rpg), barW).split(ATTR_SEPARATOR);
    if (parts.length === segs.length) {
      const sepW = ctx.measureText(ATTR_SEPARATOR).width;
      const top = flow.attrY - 6.4 * ts;
      const h = 8 * ts;
      let from = 0;
      for (let i = 0; i < segs.length; i++) {
        const w = ctx.measureText(parts[i]).width + (i < segs.length - 1 ? sepW : 0);
        if (w > 0) rows.attr.push({ key: segs[i].key, rect: { x: layout.attr.x + from, y: top, w, h } });
        from += w;
      }
    }
  }

  return rows;
}

export function drawInventory(
  ctx: CanvasRenderingContext2D,
  player: Entity, state: GameState,
  sx: number, sy: number,
  uiTime = state.time,
): void {
  const inv = player.inventory ?? [];
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const time = uiTime;
  const layout = fullscreenInventoryLayout(cw, ch, sx, sy);
  sx = layout.scale;
  sy = layout.scale;
  const ts = layout.textScale;
  const gridCols = layout.grid.cols;
  const gridRows = layout.grid.rows;

  // Fullscreen neuro-panel background
  ctx.fillStyle = '#00040a';
  ctx.fillRect(0, 0, cw, ch);
  drawNeuroPanel(ctx, 0, 0, cw, ch, time, 80);

  // Title + money + close hint
  drawGlitchText(ctx, 'ИНВЕНТАРЬ', 8 * sx, 9 * ts, time, 800, '#6f96a4', 7.2 * ts);
  ctx.font = `${7.2 * ts}px "Press Start 2P", monospace`;
  const finance = readFinanceSnapshot(player, state);
  const mj = textJitter(time, 801);
  ctx.fillStyle = `rgba(194,162,76,${flicker(time, 802)})`;
  const titleMoney = finance.hasBanking
    ? `₽${Math.round(finance.cash)} сч ${Math.round(finance.accountRubles)}`
    : `₽${Math.round(finance.cash)}`;
  ctx.fillText(fitStatText(ctx, titleMoney, 92 * ts), 96 * ts + mj.dx, 9 * ts + mj.dy);
  ctx.fillStyle = '#456';
  ctx.font = `${5.8 * ts}px "Press Start 2P", monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`${menuCloseHint()} закрыть`, cw - 8 * ts, 9 * ts);
  ctx.textAlign = 'left';

  // ── LEFT COLUMN: grid + item desc + weapon + money ───────
  const cellSz = layout.grid.cell;
  const gridX = layout.grid.x;
  const gridY = layout.grid.y;


  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const idx = row * gridCols + col;
      const cx = gridX + col * cellSz;
      const cy = gridY + row * cellSz;
      const selected = idx === state.invSel;

      ctx.fillStyle = selected ? 'rgba(50, 180, 150, 0.15)' : 'rgba(10, 20, 25, 0.72)';
      ctx.fillRect(cx, cy, cellSz - 2, cellSz - 2);
      ctx.strokeStyle = selected ? '#0fa' : '#2a4a4a';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cellSz - 3, cellSz - 3);
      ctx.lineWidth = 1;

      // VHS Scanlines effect for cell background
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let sl = 0; sl < cellSz - 2; sl += 3) {
        ctx.fillRect(cx, cy + sl, cellSz - 2, 1);
      }

      if (idx < inv.length) {
        const item = inv[idx];
        drawItemGridIcon(ctx, item.defId, itemInstanceName(item), cx, cy, cellSz, sx, sy, selected, selected ? 1 : 0.86);
        if (item.count > 1) {
          ctx.fillStyle = '#6f8a72';
          ctx.font = `${5 * sy}px "Press Start 2P", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(`×${item.count}`, cx + cellSz / 2, cy + cellSz - 5 * sy);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  // Selected item details live in the right column so the 8x8 grid keeps the left side.
  const details = layout.details;
  ctx.textAlign = 'left';

  // Одна арифметика вертикали на отрисовку и на тап — см. `inventoryDetailFlow`.
  const flow = inventoryDetailFlow(ctx, player, state, layout);

  if (flow.hasItem) {
    const item = inv[state.invSel];
    ctx.fillStyle = '#ccc';
    ctx.font = `${6.2 * ts}px "Press Start 2P", monospace`;
    ctx.fillText(fitStatText(ctx, `${itemInstanceName(item)} ×${item.count}`, details.w), details.x, details.y);
  }
  for (const line of flow.lines) {
    ctx.fillStyle = line.color;
    ctx.font = `${line.fontUnits * ts}px "Press Start 2P", monospace`;
    ctx.fillText(line.text, details.x, line.y);
  }
  if (flow.hasItem) {
    ctx.fillStyle = '#ab8339';
    ctx.font = `${5.1 * ts}px "Press Start 2P", monospace`;
    ctx.fillText(fitStatText(ctx, flow.priceText, details.w), details.x, flow.priceY);

    if (flow.hasUse) {
      ctx.fillStyle = '#5f8a5f';
      ctx.fillText(fitStatText(ctx, `${controlHint('gameMenu')} исп.`, layout.use.w), layout.use.x, flow.actionY);
    }
    ctx.fillStyle = '#a86';
    ctx.fillText(fitStatText(ctx, `${controlHint('drop')} вык.`, layout.drop.w), layout.drop.x, flow.actionY);
  }

  // ── RIGHT COLUMN: stats ──────────────────────────────────
  const stX = details.x;
  const barW = Math.max(24 * sx, details.w);
  let stY = flow.titleY;
  // The right column runs to the bottom of the canvas: it stopped at the grid
  // bottom, so shrinking the grid stole rows from finance and equipment.
  const contentBottom = ch - 6 * ts;

  // Name, level and spendable points on one row. The three-line breakdown of
  // what every attribute multiplies used to live under it — nobody read it, and
  // it ate exactly the room the equipment block needs at the bottom.
  ctx.fillStyle = '#c2a24c';
  ctx.font = `${5.4 * ts}px "Press Start 2P", monospace`;
  const nameStr = player.name ?? 'Вы';
  const titleLine = player.rpg ? `${nameStr}  Ур.${player.rpg.level}  Очки ${player.rpg.attrPoints}` : nameStr;
  ctx.fillText(fitStatText(ctx, titleLine, barW), stX, stY);
  stY += 6.6 * ts;

  // Attributes in their own compact row; the keys are shown only while there is
  // something to spend on them.
  if (player.rpg) {
    ctx.font = `${5 * ts}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#b3703f';
    ctx.fillText(fitStatText(ctx, inventoryAttrLine(player.rpg), barW), stX, stY);
    stY += 6.2 * ts;
  }

  // XP bar
  if (player.rpg) {
    const capped = player.rpg.level >= RPG_LEVEL_CAP;
    const xpNeeded = capped ? 1 : xpForLevel(player.rpg.level + 1);
    stY = drawCompactMeter(
      ctx,
      capped ? `XP: максимум ${RPG_LEVEL_CAP}` : `XP: ${player.rpg.xp}/${xpNeeded}`,
      stX,
      stY,
      barW,
      ts,
      capped ? 1 : player.rpg.xp / xpNeeded,
      '#6e9268',
      '#6e8a72',
    );
  }

  // HP bar
  stY = drawCompactMeter(
    ctx,
    `ХП: ${formatUiNumber(player.hp)}/${formatUiNumber(player.maxHp ?? 100)}`,
    stX,
    stY,
    barW,
    ts,
    (player.hp ?? 0) / (player.maxHp ?? 100),
    '#a2483e',
    '#aaa',
  );

  // PSI bar
  if (player.rpg) {
    stY = drawCompactMeter(
      ctx,
      `ПСИ: ${formatUiNumber(player.rpg.psi)}/${formatUiNumber(player.rpg.maxPsi)}`,
      stX,
      stY,
      barW,
      ts,
      player.rpg.maxPsi > 0 ? player.rpg.psi / player.rpg.maxPsi : 0,
      '#8a6a9c',
      '#8a6a9c',
    );
  }

  // Needs
  if (player.needs) {
    const needs: [string, number, string][] = [
      ['Еда', player.needs.food, '#7e914e'],
      ['Вода', player.needs.water, '#4d7f96'],
      ['Сон', player.needs.sleep, '#6c76a4'],
      ['Туалет', Math.max(0, 100 - player.needs.pee), '#ab8339'],
    ];
    for (const [label, val, color] of needs) {
      stY = drawCompactMeter(ctx, `${label}: ${Math.round(val)}`, stX, stY, barW, ts, val / 100, color, '#aaa');
    }
  }

  const equipmentLines = inventoryEquipmentLines(player);
  const equipmentH = inventoryEquipmentBlockHeight(equipmentLines.length, ts);
  const columnsH = Math.max(equipmentH, 39 * ts);
  const columnsY = Math.max(stY + 4 * ts, contentBottom - columnsH);
  const columnsGap = 7 * ts;
  const financeW = Math.max(34 * ts, Math.floor((barW - columnsGap) * 0.48));
  const equipmentW = Math.max(34 * ts, barW - financeW - columnsGap);

  const zhelemishLine = zhelemishStatsLine(player, time);
  if (zhelemishLine && stY + 6 * ts <= columnsY - 1 * ts) {
    stY += 2 * ts;
    ctx.fillStyle = '#9c6';
    ctx.font = `${5 * ts}px "Press Start 2P", monospace`;
    ctx.fillText(fitStatText(ctx, zhelemishLine, barW), stX, stY);
    stY += 6 * ts;
  }

  drawInventoryFinanceBlock(ctx, player, state, stX, columnsY, financeW, ts, time, contentBottom);
  drawInventoryEquipmentBlock(ctx, equipmentLines, stX + financeW + columnsGap, columnsY, equipmentW, ts, time, contentBottom);
}

interface EquipmentLine {
  text: string;
  color: string;
}

function inventoryEquipmentLines(player: Entity): EquipmentLine[] {
  const weapon = getWeaponReadiness(player);
  const weaponState = weapon.cannotFireReason
    ? `${weapon.resourceLabel}  ${weapon.cannotFireReason}`
    : `${weapon.resourceLabel}  ${weapon.cooldownLabel}`;
  const toolName = player.tool ? (ITEMS[player.tool]?.name ?? player.tool) : 'нет';
  const toolDur = getEquippedToolDurability(player);
  const toolDurLabel = toolDur ? `${Math.max(0, Math.ceil(toolDur.cur))}/${toolDur.max}` : '--';

  const armorName = player.armorDefId ? (ITEMS[player.armorDefId]?.name ?? player.armorDefId) : 'нет';

  const lines: EquipmentLine[] = [{ text: `Броня: ${armorName}`, color: '#fff' }];
  const armorResists = armorResistLine(player.armorDefId);
  if (armorResists) lines.push({ text: armorResists, color: '#9db' });
  lines.push(
    { text: `Оружие: ${weapon.name}`, color: '#ccc' },
    { text: `${weapon.role}  ур.${weapon.damageLabel}  ${weaponState}`, color: weapon.warning ? '#f84' : '#9d9' },
  );
  /* Подробность ствола идёт СРАЗУ за его же двумя строками. Раньше место
     выбирал `splice(3, ...)` по счёту от начала блока, и любая строка,
     добавленная выше, уводила подробность в чужое место. */
  const weaponExtra = weapon.statLabel || [weapon.reachLabel, weapon.controlLabel].filter(Boolean).join('  ');
  if (weaponExtra) lines.push({ text: weaponExtra, color: '#8ad' });
  lines.push(
    { text: `Инструмент: ${toolName}`, color: '#8cf' },
    { text: `износ ${toolDurLabel}`, color: '#8cf' },
  );
  return lines;
}

/* Подписи колонок резиста в блоке снаряжения.
 *
 * Шесть пар в одну строку с именем брони не влезали: `Броня: Броня Ликвидатора
 * Защита: КИН:80% …` — это семьдесят знаков, а колонка снаряжения держит около
 * сорока, и `fitStatText` резал строку на третьей колонке. Игрок видел начало
 * таблицы и многоточие вместо остального.
 *
 * Поэтому резист живёт СОБСТВЕННОЙ строкой блока и без процентов: числа здесь
 * и так проценты, а «Защита:» повторяет заголовок «ЭКИПИРОВКА» над блоком.
 * Шесть пар по пять знаков с пробелами — тридцать пять знаков, и полная строка
 * даже верхнего комплекта помещается целиком. */
const ARMOR_RESIST_LABELS: readonly (readonly [DamageType, string])[] = [
  [DamageType.KINETIC, 'КИН'],
  [DamageType.BUCKSHOT, 'ДРБ'],
  [DamageType.ENERGY, 'ЭНР'],
  [DamageType.FIRE, 'ОГН'],
  [DamageType.PSI, 'ПСИ'],
  [DamageType.BIO, 'БИО'],
];

function armorResistLine(armorDefId: string | undefined): string {
  const res = armorDefId ? ITEMS[armorDefId]?.resistances : undefined;
  if (!res) return '';
  return ARMOR_RESIST_LABELS
    .filter(([type]) => res[type])
    .map(([type, label]) => `${label}${res[type]}`)
    .join(' ');
}

function inventoryEquipmentBlockHeight(lineCount: number, sy: number): number {
  return (9.2 + lineCount * 6.2 + 2.2) * sy;
}

function drawInventoryEquipmentBlock(
  ctx: CanvasRenderingContext2D,
  lines: readonly EquipmentLine[],
  x: number,
  y: number,
  w: number,
  sy: number,
  time: number,
  maxBottom = Number.POSITIVE_INFINITY,
): number {
  if (y + 8.2 * sy > maxBottom) return y;
  drawGlitchText(ctx, 'ЭКИПИРОВКА', x, y, time, 840, '#6f96a4', 5.8 * sy);
  let cy = y + 8.2 * sy;
  ctx.font = `${4.7 * sy}px "Press Start 2P", monospace`;
  const lineH = 6.2 * sy;
  for (const line of lines) {
    if (cy + lineH * 0.35 > maxBottom) break;
    ctx.fillStyle = line.color;
    ctx.fillText(fitStatText(ctx, line.text, w), x, cy);
    cy += lineH;
  }
  return cy + 2.2 * sy;
}

function drawCompactMeter(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  sy: number,
  pct: number,
  color: string,
  labelColor: string,
): number {
  ctx.fillStyle = labelColor;
  ctx.font = `${4.5 * sy}px "Press Start 2P", monospace`;
  ctx.fillText(fitStatText(ctx, label, w), x, y);
  y += 6.4 * sy;
  drawStatBar(ctx, x, y, w, 1.8 * sy, pct, color);
  return y + 7.4 * sy;
}

function drawStatBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  pct: number, color: string,
): void {
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
}
