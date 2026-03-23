/* ── Debug menu: commands + overlay rendering ────────────────── */

import {
  W, Cell, RoomType, Faction, ZoneFaction,
  EntityType, MonsterKind, Occupation, AIGoal,
  type Entity, type GameState,
} from '../core/types';
import { World } from '../core/world';
import { freshNeeds, randomName, ITEMS } from '../data/catalog';
import { FACTION_NAMES } from '../data/relations';
import { MONSTERS } from '../entities/monster';
import { addItem } from './inventory';
import { awardXP, randomRPG, getMaxHp } from './rpg';

/* ── Command execution ───────────────────────────────────────── */

export function execDebugCommand(
  idx: number,
  player: Entity,
  entities: Entity[],
  state: GameState,
  nextEntityId: { v: number },
): void {
  switch (idx) {
    case 0: { // All weapons + ammo
      const weapons = ['knife', 'wrench', 'pipe', 'rebar', 'axe', 'makarov', 'shotgun', 'nailgun'];
      for (const w of weapons) addItem(player, w, 1);
      addItem(player, 'ammo_9mm', 20);
      addItem(player, 'ammo_shells', 8);
      addItem(player, 'ammo_nails', 30);
      state.msgs.push({ text: 'Все оружия получены', time: state.time, color: '#ff0' });
      break;
    }
    case 1: { // Spawn one of each monster nearby
      const kinds = [
        MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.POLZUN, MonsterKind.BETONNIK,
        MonsterKind.ZOMBIE, MonsterKind.EYE, MonsterKind.NIGHTMARE, MonsterKind.SHADOW,
        MonsterKind.REBAR, MonsterKind.MATKA,
      ];
      for (let i = 0; i < kinds.length; i++) {
        const k = kinds[i];
        const def = MONSTERS[k];
        const ang = (i / kinds.length) * Math.PI * 2;
        entities.push({
          id: nextEntityId.v++, type: EntityType.MONSTER,
          x: player.x + Math.cos(ang) * 3,
          y: player.y + Math.sin(ang) * 3,
          angle: ang + Math.PI, pitch: 0, alive: true,
          speed: def.speed, sprite: def.sprite,
          hp: def.hp, maxHp: def.hp,
          monsterKind: k, attackCd: 0,
          ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
          rpg: randomRPG(player.rpg?.level ?? 1),
        });
      }
      state.msgs.push({ text: 'Все монстры заспавнены', time: state.time, color: '#ff0' });
      break;
    }
    case 2: { // Spawn random NPC nearby
      const nm = randomName();
      const rpg = randomRPG(player.rpg?.level ?? 1);
      const maxHp = getMaxHp(rpg);
      const factions = [Faction.CITIZEN, Faction.LIQUIDATOR, Faction.CULTIST, Faction.WILD];
      const faction = factions[Math.floor(Math.random() * factions.length)];
      entities.push({
        id: nextEntityId.v++, type: EntityType.NPC,
        x: player.x + Math.cos(player.angle) * 2,
        y: player.y + Math.sin(player.angle) * 2,
        angle: player.angle + Math.PI, pitch: 0, alive: true,
        speed: 1.2, sprite: Occupation.TRAVELER,
        name: nm.name, isFemale: nm.female,
        needs: freshNeeds(), hp: maxHp, maxHp,
        ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
        inventory: [], faction, occupation: Occupation.TRAVELER, isTraveler: true,
        rpg, money: 20 + Math.floor(Math.random() * 80),
      });
      state.msgs.push({ text: `NPC ${nm.name} заспавнен`, time: state.time, color: '#ff0' });
      break;
    }
    case 3: { // Spawn all items nearby
      const ids = Object.keys(ITEMS);
      for (let i = 0; i < ids.length; i++) {
        const def = ITEMS[ids[i]];
        const ang = (i / ids.length) * Math.PI * 2;
        entities.push({
          id: nextEntityId.v++, type: EntityType.ITEM_DROP,
          x: player.x + Math.cos(ang) * 2,
          y: player.y + Math.sin(ang) * 2,
          angle: 0, pitch: 0, alive: true, speed: 0, sprite: 16,
          inventory: [{ defId: def.id, count: def.stack }],
        });
      }
      state.msgs.push({ text: 'Все предметы заспавнены', time: state.time, color: '#ff0' });
      break;
    }
    case 4: { // Give 1M XP
      awardXP(player, 1_000_000, state.msgs, state.time);
      state.msgs.push({ text: '+1 000 000 XP', time: state.time, color: '#ff0' });
      break;
    }
  }
}

/* ── Debug overlay rendering (fullscreen two-column) ─────────── */

const ZONE_FACTION_NAMES: Record<ZoneFaction, string> = {
  [ZoneFaction.CITIZEN]: 'Граждане',
  [ZoneFaction.LIQUIDATOR]: 'Ликвидаторы',
  [ZoneFaction.CULTIST]: 'Культисты',
  [ZoneFaction.SAMOSBOR]: 'Самосбор',
  [ZoneFaction.WILD]: 'Дикие',
};

const CMD_LABELS = [
  'Все оружия',
  'Спавн монстров',
  'Спавн NPC',
  'Спавн предметов',
  '1 000 000 XP',
];

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  w: number, h: number,
  world: World,
  entities: Entity[],
  debugSel: number,
): void {
  /* ── Gather stats ─────────────────────────────────────────── */
  let totalAlive = 0;
  let totalItems = 0;
  // Count all living entities (NPC + monsters) by faction
  // Monsters get their own "faction" slot = 99
  const MONSTER_SLOT = 99;
  const factionCount: Record<number, number> = {};

  for (const e of entities) {
    if (!e.alive) continue;
    if (e.type === EntityType.NPC) {
      totalAlive++;
      factionCount[e.faction ?? -1] = (factionCount[e.faction ?? -1] || 0) + 1;
    } else if (e.type === EntityType.MONSTER) {
      totalAlive++;
      factionCount[MONSTER_SLOT] = (factionCount[MONSTER_SLOT] || 0) + 1;
    } else if (e.type === EntityType.ITEM_DROP) {
      totalItems++;
    }
  }

  // Zone cells per faction
  const zoneFactionCells: Record<number, number> = {};
  for (let i = 0; i < W * W; i++) {
    const zi = world.zoneMap[i];
    if (zi >= 0 && zi < world.zones.length) {
      const f = world.zones[zi].faction;
      zoneFactionCells[f] = (zoneFactionCells[f] || 0) + 1;
    }
  }

  let funcRooms = 0;
  for (const r of world.rooms) if (r.type !== RoomType.CORRIDOR) funcRooms++;
  let lifts = 0;
  for (let i = 0; i < W * W; i++) if (world.cells[i] === Cell.LIFT) lifts++;

  /* ── Layout ───────────────────────────────────────────────── */
  const fs = Math.round(7 * sy);
  const lh = Math.round(10 * sy);
  const pad = 12 * sx;
  const margin = 6 * sx;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.93)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ff0';
  ctx.lineWidth = 1 * sx;
  ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);

  ctx.font = `${fs}px monospace`;
  ctx.textBaseline = 'top';

  // Divider at 55% width
  const divX = Math.round(w * 0.55);
  ctx.strokeStyle = 'rgba(255,255,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(divX, margin);
  ctx.lineTo(divX, h - margin);
  ctx.stroke();

  /* ── Left column ──────────────────────────────────────────── */
  const lx = margin + pad;
  let y = margin + pad;
  const row = (t: string, c: string) => { ctx.fillStyle = c; ctx.fillText(t, lx, y); y += lh; };
  const gap = () => { y += lh * 0.4; };

  row(`Существа: ${totalAlive}  Предметы: ${totalItems}`, '#aaa');
  row(`Комнаты: ${funcRooms}  Лифты: ${lifts}`, '#aaa');
  gap();

  // All factions — unified: NPC factions + monsters
  row('Фракции', '#ff0');
  for (let f = 0; f <= 4; f++) {
    const name = FACTION_NAMES[f as Faction] ?? `#${f}`;
    row(`  ${name}: ${factionCount[f] || 0}`, '#bbb');
  }
  row(`  Монстры: ${factionCount[MONSTER_SLOT] || 0}`, '#c66');
  gap();

  // Territory
  row('Территория', '#ff0');
  const zfOrder = [ZoneFaction.CITIZEN, ZoneFaction.LIQUIDATOR, ZoneFaction.CULTIST, ZoneFaction.WILD, ZoneFaction.SAMOSBOR];
  for (const zf of zfOrder) {
    row(`  ${ZONE_FACTION_NAMES[zf]}: ${zoneFactionCells[zf] || 0}`, '#bbb');
  }

  /* ── Right column: commands ───────────────────────────────── */
  const rx = divX + pad;
  let ry = margin + pad;

  for (let i = 0; i < CMD_LABELS.length; i++) {
    const sel = i === debugSel;
    if (sel) {
      ctx.fillStyle = 'rgba(255,255,0,0.12)';
      ctx.fillRect(divX + 2 * sx, ry - 1 * sy, w - divX - margin - 4 * sx, lh);
      ctx.fillStyle = '#ff0';
      ctx.fillText(`▸ ${i + 1}. ${CMD_LABELS[i]}`, rx, ry);
    } else {
      ctx.fillStyle = '#ccc';
      ctx.fillText(`  ${i + 1}. ${CMD_LABELS[i]}`, rx, ry);
    }
    ry += lh;
  }

  // Hints pinned to bottom-right
  ry = h - margin - pad - lh * 3;
  ctx.fillStyle = '#555';
  ctx.fillText('[↑↓] навиг  [E] выбрать  [~] закрыть', rx, ry);
}
