/* ── Procedural quest system ──────────────────────────────────── */

import {
  type Entity, type Quest, type GameState, type Msg,
  QuestType, EntityType, Occupation, MonsterKind,
  RoomType,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS } from '../data/catalog';
import { addRelMutual, getRel } from '../data/relations';
import { addItem, hasItem, removeItem } from './inventory';

const MAX_ACTIVE_QUESTS = 5;

/* ── Assign ~10% of living NPCs as quest givers ──────────────── */
export function reassignQuestGivers(entities: Entity[]): void {
  for (const e of entities) {
    if (e.type !== EntityType.NPC || !e.alive) continue;
    if (e.isTutor || e.isTutorBarni) continue;
    e.canGiveQuest = Math.random() < 0.10;
  }
}

/* ── Generate a quest from an NPC (called on interact) ────────── */
export function offerQuest(
  npc: Entity, _player: Entity, world: World, entities: Entity[],
  state: GameState, msgs: Msg[],
): void {
  if (!npc.alive || npc.type !== EntityType.NPC) return;
  if (!npc.canGiveQuest) {
    msgs.push({ text: `${npc.name}: «Мне нечего тебе поручить.»`, time: state.time, color: '#888' });
    return;
  }
  if (state.quests.filter(q => !q.done).length >= MAX_ACTIVE_QUESTS) {
    msgs.push({ text: 'Слишком много активных заданий.', time: state.time, color: '#a84' });
    return;
  }
  // Don't give quest if already has one active from this NPC
  if (state.quests.some(q => q.giverId === npc.id && !q.done)) {
    msgs.push({ text: `${npc.name}: «Ещё не выполнил прошлое задание?»`, time: state.time, color: '#aaa' });
    return;
  }
  // Need positive relation to give quest
  const npcRelIdx = npcRelIndex(npc, entities);
  const rel = getRel(npcRelIdx, 0);
  if (rel < -10) {
    msgs.push({ text: `${npc.name} не хочет с вами разговаривать.`, time: state.time, color: '#a44' });
    return;
  }

  const quest = generateQuest(npc, world, entities, state);
  if (!quest) {
    msgs.push({ text: `${npc.name}: «Пока ничего не нужно.»`, time: state.time, color: '#888' });
    return;
  }

  state.quests.push(quest);
  npc.questId = quest.id;
  msgs.push({ text: `Новое задание: ${quest.desc}`, time: state.time, color: '#4af' });
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
        if (q.targetRoom !== undefined) {
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
    if (q.targetMonsterKind === kind) {
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
    if (q.targetNpcId === targetNpc.id) {
      msgs.push({ text: `${targetNpc.name}: «Передам, спасибо.»`, time: state.time, color: '#aaf' });
      completeQuest(q, player, entities, state, msgs);
    }
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
    msgs.push({ text: `Награда: ${def?.name ?? q.rewardItem} ×${q.rewardCount ?? 1}`, time: state.time, color: '#4f4' });
  }
  if (q.extraRewards) {
    for (const r of q.extraRewards) {
      addItem(player, r.defId, r.count);
      const def = ITEMS[r.defId];
      msgs.push({ text: `Награда: ${def?.name ?? r.defId} ×${r.count}`, time: state.time, color: '#4f4' });
    }
  }

  // Relation boost
  const delta = q.relationDelta ?? 10;
  const giverIdx = npcRelIndex(entities.find(e => e.id === q.giverId), entities);
  if (giverIdx > 0) addRelMutual(0, giverIdx, delta);

  // Clear NPC's questId
  const giver = entities.find(e => e.id === q.giverId);
  if (giver) giver.questId = -1;

  msgs.push({ text: `Задание выполнено: ${q.desc}`, time: state.time, color: '#4f4' });
}

/* ── Generate quest based on NPC occupation ───────────────────── */
function generateQuest(
  npc: Entity, world: World, entities: Entity[], state: GameState,
): Quest | null {
  const id = state.nextQuestId++;
  const occ = npc.occupation;

  // ── Tutorial quest: Ольга → «Поговори с Барни» ──
  if (npc.isTutor) {
    // Only offer once — if already given (done or active), skip
    if (state.quests.some(q => q.giverId === npc.id && q.type === QuestType.TALK)) return null;
    const barni = entities.find(e => e.isTutorBarni && e.alive);
    if (barni) {
      return {
        id, type: QuestType.TALK,
        giverId: npc.id, giverName: npc.name ?? 'Ольга Дмитриевна',
        desc: 'Ольга Дмитриевна: «Сходите в оружейную. Поговорите с Барни — он научит стрелять.»',
        targetNpcId: barni.id, targetNpcName: barni.name,
        rewardItem: 'makarov', rewardCount: 1,
        extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
        relationDelta: 15,
        done: false,
      };
    }
    // fallback: original VISIT quest if Барни not found
    return {
      id, type: QuestType.VISIT,
      giverId: npc.id, giverName: npc.name ?? 'Ольга Дмитриевна',
      desc: 'Ольга Дмитриевна: «Осмотрите блок. Найдите медпункт.»',
      targetRoom: world.rooms.find(r => r && r.type === RoomType.MEDICAL)?.id,
      rewardItem: 'bandage', rewardCount: 2, relationDelta: 15,
      done: false,
    };
  }

  // ── Tutorial quest: Барни → «Доложите Ольге Дмитриевне» ──
  if (npc.isTutorBarni) {
    // Only offer once
    if (state.quests.some(q => q.giverId === npc.id && q.type === QuestType.TALK)) return null;
    // Only available after Ольга's quest is done (player talked to Барни)
    const olgaQuestDone = state.quests.some(q => q.targetNpcId === npc.id && q.done);
    if (!olgaQuestDone) return null;
    const olga = entities.find(e => e.isTutor && e.alive);
    if (!olga) return null;
    return {
      id, type: QuestType.TALK,
      giverId: npc.id, giverName: npc.name ?? 'Барни',
      desc: 'Барни: «Доложите Ольге Дмитриевне, что вы вооружены и готовы.»',
      targetNpcId: olga.id, targetNpcName: olga.name,
      rewardItem: 'bandage', rewardCount: 2,
      extraRewards: [{ defId: 'water', count: 2 }, { defId: 'bread', count: 2 }],
      relationDelta: 12,
      done: false,
    };
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
    return {
      id, type: QuestType.FETCH,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abПринеси ${def.name}\u00bb`,
      targetItem: item, targetCount: 1,
      rewardItem: reward, rewardCount: 1, relationDelta: 10,
      done: false,
    };
  }

  // VISIT quests
  if (r < 0.65) {
    const room = pickVisitRoom(world, npc);
    if (!room) return null;
    return {
      id, type: QuestType.VISIT,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abСходи в ${room.name}\u00bb`,
      targetRoom: room.id,
      rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 8,
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
    return {
      id, type: QuestType.KILL,
      giverId: npc.id, giverName: npc.name ?? '???',
      desc: `${npc.name}: \u00abУбей ${names[kind]}\u00bb`,
      targetMonsterKind: kind, killCount: 0, killNeeded: 1,
      rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 15,
      done: false,
    };
  }

  // TALK quests — deliver message to another NPC
  const otherNpcs = entities.filter(e => e.type === EntityType.NPC && e.alive && e.id !== npc.id);
  if (otherNpcs.length === 0) return null;
  const target = otherNpcs[Math.floor(Math.random() * otherNpcs.length)];
  return {
    id, type: QuestType.TALK,
    giverId: npc.id, giverName: npc.name ?? '???',
    desc: `${npc.name}: \u00abПередай ${target.name} сообщение\u00bb`,
    targetNpcId: target.id, targetNpcName: target.name,
    rewardItem: pickRewardItem(occ), rewardCount: 1, relationDelta: 12,
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

/* ── Helper: NPC relation index (1-based, 0=player) ──────────── */
function npcRelIndex(npc: Entity | undefined, entities: Entity[]): number {
  if (!npc) return 0;
  // Find NPC index among all NPCs
  let idx = 1;
  for (const e of entities) {
    if (e.type === EntityType.NPC) {
      if (e.id === npc.id) return idx;
      idx++;
    }
  }
  return 0;
}
