/* ── Procedural quest system ──────────────────────────────────── */

import {
  type Entity, type Quest, type GameState, type Msg,
  QuestType, EntityType, Occupation, MonsterKind, Faction,
  RoomType, Cell, AIGoal, W,
  msg,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS } from '../data/catalog';

import { addFactionRelMutual, getFactionRel } from '../data/relations';
import { PLOT_CHAIN, PLOT_NPCS, SIDE_QUESTS, isPlotNpc } from '../data/plot';
import { addItem, hasItem, removeItem } from './inventory';
import { questDifficulty, questXpReward, questMoneyReward, awardXP, randomRPG, scaleMonsterHp, scaleMonsterSpeed } from './rpg';
import { MONSTERS } from '../entities/monster';

const MAX_ACTIVE_QUESTS = 5;

/* ── Assign ~10% of living NPCs as quest givers ──────────────── */
export function reassignQuestGivers(entities: Entity[]): void {
  for (const e of entities) {
    if (e.type !== EntityType.NPC || !e.alive) continue;
    if (isPlotNpc(e)) continue;
    e.canGiveQuest = Math.random() < 0.10;
  }
}

/* ── Generate a quest from an NPC (called on interact) ────────── */
export function offerQuest(
  npc: Entity, _player: Entity, world: World, entities: Entity[],
  state: GameState, msgs: Msg[], nextEntityId?: { v: number },
): void {
  if (!npc.alive || npc.type !== EntityType.NPC) return;
  if (!npc.canGiveQuest) {
    msgs.push(msg(`${npc.name}: «Мне нечего тебе поручить.»`, state.time, '#888'));
    return;
  }
  if (state.quests.filter(q => !q.done).length >= MAX_ACTIVE_QUESTS) {
    msgs.push(msg('Слишком много активных заданий.', state.time, '#a84'));
    return;
  }
  // Don't give quest if already has one active from this NPC
  if (state.quests.some(q => q.giverId === npc.id && !q.done)) {
    msgs.push(msg(`${npc.name}: «Ещё не выполнил прошлое задание?»`, state.time, '#aaa'));
    return;
  }
  // Plot NPCs always give quests — they are not in the relation matrix
  if (!isPlotNpc(npc)) {
    const npcFaction = npc.faction ?? Faction.CITIZEN;
    const rel = getFactionRel(Faction.PLAYER, npcFaction);
    if (rel < -10) {
      msgs.push(msg(`${npc.name} не хочет с вами разговаривать.`, state.time, '#a44'));
      return;
    }
  }

  const quest = generateQuest(npc, world, entities, state);
  if (!quest) {
    msgs.push(msg(`${npc.name}: «Пока ничего не нужно.»`, state.time, '#888'));
    return;
  }

  state.quests.push(quest);
  npc.questId = quest.id;
  msgs.push(msg(`Новое задание: ${quest.desc}`, state.time, '#4af'));

  // Spawn monsters around quest giver when plot step has spawnMonstersOnAccept
  if (quest.plotStepIndex !== undefined && nextEntityId) {
    const step = PLOT_CHAIN[quest.plotStepIndex];
    if (step?.spawnMonstersOnAccept) {
      spawnQuestMonsters(npc, world, entities, nextEntityId, step.spawnMonstersOnAccept, msgs, state.time);
    }
  }
}

/* ── Spawn hostile monsters around NPC (for quest defense events) ── */
const SPAWN_KINDS = [
  MonsterKind.TVAR, MonsterKind.SBORKA, MonsterKind.POLZUN,
  MonsterKind.ZOMBIE, MonsterKind.SHADOW, MonsterKind.SBORKA,
  MonsterKind.TVAR, MonsterKind.ZOMBIE,
];

function spawnQuestMonsters(
  npc: Entity, world: World, entities: Entity[],
  nextEntityId: { v: number }, count: number,
  msgs: Msg[], time: number,
): void {
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    // Pick random floor cell in radius 3-8 from NPC (tight corridors)
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 3 + Math.random() * 5;
    let found = false;
    let mx = 0, my = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = angle + (attempt > 0 ? (Math.random() - 0.5) * 1.5 : 0);
      const d = dist + (attempt > 0 ? (Math.random() - 0.5) * 4 : 0);
      const tx = ((Math.floor(npc.x) + Math.round(Math.cos(a) * d)) % W + W) % W;
      const ty = ((Math.floor(npc.y) + Math.round(Math.sin(a) * d)) % W + W) % W;
      if (world.cells[world.idx(tx, ty)] === Cell.FLOOR) {
        mx = tx; my = ty; found = true; break;
      }
    }
    if (!found) continue;

    const kind = SPAWN_KINDS[i % SPAWN_KINDS.length];
    const mdef = MONSTERS[kind];
    if (!mdef) continue;

    const zid = world.zoneMap[world.idx(mx, my)];
    const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 5) : 5;
    const rpg = randomRPG(zoneLevel);

    entities.push({
      id: nextEntityId.v++, type: EntityType.MONSTER,
      x: mx + 0.5, y: my + 0.5,
      angle: Math.atan2(npc.y - my - 0.5, npc.x - mx - 0.5),
      pitch: 0, alive: true,
      speed: scaleMonsterSpeed(mdef.speed, zoneLevel),
      sprite: mdef.sprite,
      hp: scaleMonsterHp(mdef.hp, zoneLevel),
      maxHp: scaleMonsterHp(mdef.hp, zoneLevel),
      monsterKind: kind, attackCd: 0,
      ai: { goal: AIGoal.WANDER, tx: Math.floor(npc.x), ty: Math.floor(npc.y), path: [], pi: 0, stuck: 0, timer: 0 },
      rpg,
    });
    spawned++;
  }
  if (spawned > 0) {
    msgs.push(msg(`\u0412\u044b \u0441\u043b\u044b\u0448\u0438\u0442\u0435 \u0440\u044b\u043a \u0438 \u0441\u043a\u0440\u0435\u0436\u0435\u0442 \u2014 \u043c\u043e\u043d\u0441\u0442\u0440\u044b \u043f\u0440\u0443\u0442 \u043a \u0444\u043e\u0440\u043f\u043e\u0441\u0442\u0443!`, time, '#f44'));
  }
}

/* ── Check all active quests for completion ───────────────────── */
export function checkQuests(
  player: Entity, world: World, entities: Entity[],
  state: GameState, msgs: Msg[],
): void {
  for (const q of state.quests) {
    if (q.done) continue;

    let complete = false;

    switch (q.type) {
      case QuestType.FETCH:
        if (q.targetItem && hasItem(player, q.targetItem)) {
          complete = true;
        }
        break;

      case QuestType.VISIT:
        if (q.visitFloor !== undefined) {
          if (state.currentFloor === q.visitFloor) complete = true;
        } else if (q.targetRoom !== undefined) {
          const room = world.roomAt(player.x, player.y);
          if (room && room.id === q.targetRoom) complete = true;
        }
        break;

      case QuestType.KILL:
        if (q.killCount !== undefined && q.killNeeded !== undefined) {
          if (q.killCount >= q.killNeeded) complete = true;
        }
        break;

      case QuestType.TALK:
        // Checked in interact — when player talks to target NPC
        break;
    }

    if (complete) completeQuest(q, player, entities, state, msgs);
  }
}

/* ── Notify kill for KILL quests ──────────────────────────────── */
export function notifyKill(kind: MonsterKind, state: GameState): void {
  for (const q of state.quests) {
    if (q.done || q.type !== QuestType.KILL) continue;
    if (q.targetMonsterKind === kind || q.targetMonsterKind === undefined) {
      q.killCount = (q.killCount ?? 0) + 1;
    }
  }
}

/* ── Check if talking to target NPC completes a TALK quest ────── */
export function checkTalkQuest(
  targetNpc: Entity, player: Entity, entities: Entity[],
  state: GameState, msgs: Msg[],
): void {
  for (const q of state.quests) {
    if (q.done || q.type !== QuestType.TALK) continue;
    // Match by entity id OR by plot NPC id (cross-floor quests)
    const matchById = q.targetNpcId === targetNpc.id;
    const matchByPlotId = q.targetPlotNpcId && targetNpc.plotNpcId === q.targetPlotNpcId;
    if (!matchById && !matchByPlotId) continue;
    const plotDef = targetNpc.plotNpcId ? PLOT_NPCS[targetNpc.plotNpcId] : undefined;
    if (plotDef?.talkQuestResponse) {
      msgs.push(msg(`${targetNpc.name}: «${plotDef.talkQuestResponse}»`, state.time, '#aaf'));
    } else {
      msgs.push(msg(`${targetNpc.name}: «Передам, спасибо.»`, state.time, '#aaf'));
    }
    completeQuest(q, player, entities, state, msgs);
  }
}

/* ── Complete a quest ─────────────────────────────────────────── */
function completeQuest(
  q: Quest, player: Entity, entities: Entity[],
  state: GameState, msgs: Msg[],
): void {
  q.done = true;

  // FETCH: take the item from player
  if (q.type === QuestType.FETCH && q.targetItem) {
    removeItem(player, q.targetItem, q.targetCount ?? 1);
  }

  // Reward
  if (q.rewardItem) {
    addItem(player, q.rewardItem, q.rewardCount ?? 1);
    const def = ITEMS[q.rewardItem];
    msgs.push(msg(`Награда: ${def?.name ?? q.rewardItem} ×${q.rewardCount ?? 1}`, state.time, '#4f4'));
  }
  if (q.extraRewards) {
    for (const r of q.extraRewards) {
      addItem(player, r.defId, r.count);
      const def = ITEMS[r.defId];
      msgs.push(msg(`Награда: ${def?.name ?? r.defId} ×${r.count}`, state.time, '#4f4'));
    }
  }

  // XP reward
  if (q.xpReward) {
    awardXP(player, q.xpReward, msgs, state.time);
  }

  // Money reward
  if (q.moneyReward) {
    player.money = (player.money ?? 0) + q.moneyReward;
    msgs.push(msg(`+${q.moneyReward}₽`, state.time, '#ee4'));
  }

  // Relation boost
  const delta = q.relationDelta ?? 10;
  const giverFaction = entities.find(e => e.id === q.giverId)?.faction ?? Faction.CITIZEN;
  addFactionRelMutual(Faction.PLAYER, giverFaction, delta);

  // Clear NPC's questId
  const giver = entities.find(e => e.id === q.giverId);
  if (giver) {
    giver.questId = -1;
    // Side quest NPC: switch to post-dialogue after completion
    if (q.sideQuestId) giver.plotDone = true;
  }

  msgs.push(msg(`Задание выполнено: ${q.desc}`, state.time, '#4f4'));
}
/* ── Toroidal direction name (from → to) ─────────────────────── */
function toroidalDirection(world: World, fromX: number, fromY: number, toX: number, toY: number): string {
  const dx = world.delta(Math.floor(fromX), Math.floor(toX));
  const dy = world.delta(Math.floor(fromY), Math.floor(toY));
  // dy<0 = target is above = north; dx>0 = target is right = east
  const ns = dy < -5 ? 'север' : dy > 5 ? 'юг' : '';
  const ew = dx > 5 ? 'восток' : dx < -5 ? 'запад' : '';
  if (ns && ew) return `на ${ns}о-${ew}е`;
  if (ns) return `на ${ns}е`;
  if (ew) return `на ${ew}е`;
  return 'недалеко';
}

/* ── Generate plot quest from PLOT_CHAIN ──────────────────────── */
function generatePlotQuest(
  npc: Entity, world: World, entities: Entity[], state: GameState,
): Quest | null {
  const plotId = npc.plotNpcId!;
  for (let i = 0; i < PLOT_CHAIN.length; i++) {
    const step = PLOT_CHAIN[i];
    if (step.giverNpcId !== plotId) continue;
    // Skip if this step already has a quest (active or done)
    if (state.quests.some(q => q.plotStepIndex === i)) continue;
    // All previous steps must be done
    let allPrevDone = true;
    for (let j = 0; j < i; j++) {
      if (!state.quests.some(q => q.plotStepIndex === j && q.done)) { allPrevDone = false; break; }
    }
    if (!allPrevDone) continue;

    const id = state.nextQuestId++;
    let desc = step.desc;

    if (step.type === QuestType.TALK && step.targetNpcId) {
      const target = entities.find(e => e.plotNpcId === step.targetNpcId && e.alive);
      if (target && desc.includes('{dir}')) {
        desc = desc.replace('{dir}', toroidalDirection(world, npc.x, npc.y, target.x, target.y));
      } else if (!target) {
        // Target NPC on a different floor — strip {dir} placeholder
        desc = desc.replace('{dir}', 'на другом уровне');
      }
      const targetDef = PLOT_NPCS[step.targetNpcId];
      return {
        id, type: step.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc,
        targetNpcId: target?.id, targetNpcName: target?.name ?? targetDef?.name,
        targetPlotNpcId: step.targetNpcId,
        rewardItem: step.rewardItem, rewardCount: step.rewardCount,
        extraRewards: step.extraRewards,
        relationDelta: step.relationDelta, xpReward: step.xpReward,
        moneyReward: step.moneyReward,
        plotStepIndex: i,
        done: false,
      };
    }

    if (step.type === QuestType.FETCH) {
      return {
        id, type: step.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc,
        targetItem: step.targetItem, targetCount: step.targetCount,
        rewardItem: step.rewardItem, rewardCount: step.rewardCount,
        extraRewards: step.extraRewards,
        relationDelta: step.relationDelta, xpReward: step.xpReward,
        moneyReward: step.moneyReward,
        plotStepIndex: i,
        done: false,
      };
    }

    if (step.type === QuestType.KILL) {
      if (desc.includes('{dir}') && step.targetMonsterKind !== undefined) {
        const targetMon = entities.find(e => e.type === EntityType.MONSTER && e.alive && e.monsterKind === step.targetMonsterKind);
        desc = desc.replace('{dir}', targetMon
          ? toroidalDirection(world, npc.x, npc.y, targetMon.x, targetMon.y)
          : 'где-то в глубине');
      }
      return {
        id, type: step.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc,
        targetMonsterKind: step.targetMonsterKind,
        killCount: 0, killNeeded: step.killNeeded ?? 1,
        rewardItem: step.rewardItem, rewardCount: step.rewardCount,
        extraRewards: step.extraRewards,
        relationDelta: step.relationDelta, xpReward: step.xpReward,
        moneyReward: step.moneyReward,
        plotStepIndex: i,
        done: false,
      };
    }

    if (step.type === QuestType.VISIT && step.targetRoomType !== undefined) {
      const room = world.rooms.find(r => r && r.type === step.targetRoomType);
      return {
        id, type: step.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc,
        targetRoom: room?.id,
        rewardItem: step.rewardItem, rewardCount: step.rewardCount,
        extraRewards: step.extraRewards,
        relationDelta: step.relationDelta, xpReward: step.xpReward,
        moneyReward: step.moneyReward,
        plotStepIndex: i,
        done: false,
      };
    }

    if (step.type === QuestType.VISIT && (step as { visitFloor?: number }).visitFloor !== undefined) {
      return {
        id, type: step.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc,
        visitFloor: (step as { visitFloor: number }).visitFloor,
        rewardItem: step.rewardItem, rewardCount: step.rewardCount,
        extraRewards: step.extraRewards,
        relationDelta: step.relationDelta, xpReward: step.xpReward,
        moneyReward: step.moneyReward,
        plotStepIndex: i,
        done: false,
      };
    }
  }

  // ── Side quests (no prerequisite chain) ──
  for (const sq of SIDE_QUESTS) {
    if (sq.giverNpcId !== plotId) continue;
    if (state.quests.some(q => q.sideQuestId === sq.id)) continue;

    const id = state.nextQuestId++;
    if (sq.type === QuestType.FETCH) {
      return {
        id, type: sq.type,
        giverId: npc.id, giverName: npc.name ?? '???',
        desc: sq.desc,
        targetItem: sq.targetItem, targetCount: sq.targetCount,
        rewardItem: sq.rewardItem, rewardCount: sq.rewardCount,
        extraRewards: sq.extraRewards,
        relationDelta: sq.relationDelta, xpReward: sq.xpReward,
        moneyReward: sq.moneyReward,
        sideQuestId: sq.id,
        done: false,
      };
    }
  }

  return null;
}

/* ── Generate quest based on NPC occupation ───────────────────── */
function generateQuest(
  npc: Entity, world: World, entities: Entity[], state: GameState,
): Quest | null {
  const id = state.nextQuestId++;
  const occ = npc.occupation;

  // ── Story quest from PLOT_CHAIN ──
  if (isPlotNpc(npc)) {
    return generatePlotQuest(npc, world, entities, state);
  }

  // Weighted random quest type based on occupation
  const r = Math.random();

  // FETCH quests — most occupations
  if (r < 0.40) {
    const item = pickFetchItem(occ);
    if (!item) return null;
    const def = ITEMS[item];
    if (!def) return null;
    const reward = pickRewardItem(occ);
    const diff = questDifficulty(def.value ?? 10, 50, 1.0);
    return {
      id, type: QuestType.FETCH,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abПринеси ${def.name}\u00bb`,
      targetItem: item, targetCount: 1,
      rewardItem: reward, rewardCount: 1, relationDelta: 10,
      difficulty: diff, xpReward: questXpReward(diff), moneyReward: questMoneyReward(diff),
      done: false,
    };
  }

  // VISIT quests
  if (r < 0.65) {
    const room = pickVisitRoom(world, npc);
    if (!room) return null;
    const diff = questDifficulty(0, 80, 0.8);
    return {
      id, type: QuestType.VISIT,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abСходи в ${room.name}\u00bb`,
      targetRoom: room.id,
      rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 8,
      difficulty: diff, xpReward: questXpReward(diff), moneyReward: questMoneyReward(diff),
      done: false,
    };
  }

  // KILL quests — hunters/liquidators prefer these
  if (r < 0.85) {
    const kinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.POLZUN];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const names: Record<number, string> = {
      [MonsterKind.SBORKA]: 'Сборку',
      [MonsterKind.TVAR]: 'Тварь',
      [MonsterKind.POLZUN]: 'Ползуна',
    };
    const killDiff = questDifficulty(0, 0, kind === MonsterKind.POLZUN ? 2.5 : kind === MonsterKind.TVAR ? 1.5 : 1.0);
    return {
      id, type: QuestType.KILL,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abУбей ${names[kind]}\u00bb`,
      targetMonsterKind: kind, killCount: 0, killNeeded: 1,
      rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 15,
      difficulty: killDiff, xpReward: questXpReward(killDiff), moneyReward: questMoneyReward(killDiff),
      done: false,
    };
  }

  // TALK quests — deliver message to another NPC
  const otherNpcs = entities.filter(e => e.type === EntityType.NPC && e.alive && e.id !== npc.id);
  if (otherNpcs.length === 0) return null;
  const target = otherNpcs[Math.floor(Math.random() * otherNpcs.length)];
  const dist = world.dist(npc.x, npc.y, target.x, target.y);
  const talkDiff = questDifficulty(0, dist, 0.6);
  return {
    id, type: QuestType.TALK,
    giverId: npc.id, giverName: npc.name ?? '???',
    desc: `${npc.name}: \u00abПередай ${target.name} сообщение\u00bb`,
    targetNpcId: target.id, targetNpcName: target.name,
    rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 12,
    difficulty: talkDiff, xpReward: questXpReward(talkDiff), moneyReward: questMoneyReward(talkDiff),
    done: false,
  };
}

/* ── Occupation-specific item picks ───────────────────────────── */
const FETCH_ITEMS: Partial<Record<Occupation, string[]>> = {
  [Occupation.COOK]: ['bread', 'canned', 'kasha', 'rawmeat', 'water'],
  [Occupation.DOCTOR]: ['bandage', 'pills', 'antidep', 'water'],
  [Occupation.HUNTER]: ['knife', 'pipe', 'wrench', 'canned'],
  [Occupation.LOCKSMITH]: ['wrench', 'flashlight'],
  [Occupation.SCIENTIST]: ['note', 'book', 'flashlight'],
  [Occupation.SECRETARY]: ['book', 'cigs', 'note'],
  [Occupation.STOREKEEPER]: ['cigs', 'toiletpaper', 'canned', 'water'],
};

function pickFetchItem(occ?: Occupation): string | null {
  const pool = (occ !== undefined && FETCH_ITEMS[occ]) || ['bread', 'water', 'bandage', 'cigs'];
  return pool[Math.floor(Math.random() * pool.length)];
}

const REWARD_ITEMS: Partial<Record<Occupation, string[]>> = {
  [Occupation.COOK]: ['bread', 'kasha', 'kompot'],
  [Occupation.DOCTOR]: ['bandage', 'pills', 'antidep'],
  [Occupation.HUNTER]: ['canned', 'rawmeat', 'knife'],
  [Occupation.LOCKSMITH]: ['flashlight', 'wrench'],
  [Occupation.SCIENTIST]: ['note', 'pills'],
  [Occupation.SECRETARY]: ['tea', 'book'],
  [Occupation.STOREKEEPER]: ['cigs', 'water', 'bread'],
};

function pickRewardItem(occ?: Occupation): string {
  const pool = (occ !== undefined && REWARD_ITEMS[occ]) || ['bread', 'water', 'bandage'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickVisitRoom(world: World, npc: Entity): { id: number; name: string } | null {
  const rooms = world.rooms.filter(r => r != null && r.type !== RoomType.CORRIDOR);
  if (rooms.length === 0) return null;
  // Pick a room at some distance
  const candidates = rooms.filter(r => world.dist(npc.x, npc.y, r.x + r.w / 2, r.y + r.h / 2) > 15);
  const pool = candidates.length > 0 ? candidates : rooms;
  const r = pool[Math.floor(Math.random() * pool.length)];
  return { id: r.id, name: r.name };
}
