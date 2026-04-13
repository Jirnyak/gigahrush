/* ── Plot event handlers — story triggers, quest creation, messages ── */
/*   Extracted from main.ts for modularity.                            */

import {
  Tex,
  type Entity, type GameState,
  MonsterKind, QuestType,
  msg,
} from '../core/types';
import { World } from '../core/world';
import { addItem } from '../systems/inventory';
import { awardXP } from '../systems/rpg';

/* ── Herald killed → portal to Void ─────────────────────────── */
export function onHeraldKilled(
  e: Entity, world: World, state: GameState,
): boolean {
  const voiceQuest = state.quests.find(q => q.plotStepIndex === 11 && !q.done && q.type === QuestType.KILL);
  if (!voiceQuest || (voiceQuest.killCount ?? 0) < (voiceQuest.killNeeded ?? 3)) return false;

  const px = Math.floor(e.x), py = Math.floor(e.y);
  const ci = world.idx(px, py);
  world.floorTex[ci] = Tex.PORTAL;
  const portalZid = world.zoneMap[ci];
  const portalZoneName = portalZid >= 0 ? `зона ${portalZid + 1}` : '???';
  state.msgs.push(msg('̸̨̛̟̟̹̠̓ Таинственный голос: «Путь открыт. Шагни в бездну.»', state.time, '#0f8'));
  state.msgs.push(msg(`Проход в Пустоту открыт в ${portalZoneName}!`, state.time, '#0ff'));
  return true; // caller should updateWorldData
}

/* ── Creator killed → return portal ──────────────────────────── */
export function onCreatorKilled(
  e: Entity, world: World, state: GameState,
): boolean {
  const px = Math.floor(e.x), py = Math.floor(e.y);
  const ci = world.idx(px, py);
  world.floorTex[ci] = Tex.PORTAL;
  state.msgs.push(msg('Творец повержен.', state.time, '#ff0'));
  state.msgs.push(msg('Портал домой открылся на месте Творца.', state.time, '#0ff'));
  return true; // caller should updateWorldData
}

/* ── Auto-complete step 10 (VISIT Hell) on arrival ───────────── */
export function onHellArrival(
  player: Entity, state: GameState,
): void {
  const step10Quest = state.quests.find(q => q.plotStepIndex === 10 && !q.done);
  if (step10Quest) {
    step10Quest.done = true;
    if (step10Quest.rewardItem) {
      addItem(player, step10Quest.rewardItem, step10Quest.rewardCount ?? 1);
    }
    if (step10Quest.extraRewards) {
      for (const r of step10Quest.extraRewards) addItem(player, r.defId, r.count);
    }
    if (step10Quest.xpReward) awardXP(player, step10Quest.xpReward, state.msgs, state.time);
    state.msgs.push(msg(`Задание выполнено: ${step10Quest.desc}`, state.time, '#4f4'));
  }
}

/* ── Voice quest: kill 3 Heralds (created on Hell entry) ─────── */
export function tryCreateVoiceQuest(
  world: World, entities: Entity[], state: GameState,
): void {
  const step9Done = state.quests.some(q => q.plotStepIndex === 9 && q.done);
  const voiceQuestExists = state.quests.some(q => q.plotStepIndex === 11);
  if (!step9Done || voiceQuestExists) return;

  const heraldEntities = entities.filter(e => e.monsterKind === MonsterKind.HERALD && e.alive);
  const heraldZones = heraldEntities.map(h => {
    const zid = world.zoneMap[world.idx(Math.floor(h.x), Math.floor(h.y))];
    return zid + 1;
  });
  const zonesStr = heraldZones.length > 0 ? heraldZones.join(', ') : '?';

  const qid = state.nextQuestId++;
  state.quests.push({
    id: qid, type: QuestType.KILL,
    giverId: -1, giverName: 'Таинственный голос',
    desc: `Таинственный голос: «Уничтожь трёх Вестников — и путь откроется. Я чувствую их в зонах ${zonesStr}.»`,
    targetMonsterKind: MonsterKind.HERALD,
    killCount: 0, killNeeded: 3,
    rewardItem: 'psi_brainburn', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 3 }],
    relationDelta: 0, xpReward: 200, moneyReward: 0,
    plotStepIndex: 11,
    done: false,
  });
  state.msgs.push(msg('̸̨̛̟̟̜̹̠̓ Таинственный голос: «Ищущий… Я чувствую тебя…»', state.time, '#0f8'));
  state.msgs.push(msg('Таинственный голос: «Уничтожь трёх Вестников — и путь откроется.»', state.time, '#0f8'));
  for (const z of heraldZones) {
    state.msgs.push(msg(`Таинственный голос: «Вестник… зона ${z}…»`, state.time, '#0f8'));
  }
  state.msgs.push(msg('Таинственный голос: «Один из них заточён за стенами. Пульсирующий сгусток поможет пройти сквозь преграду.»', state.time, '#0f8'));
  state.msgs.push(msg('Новое задание: Уничтожить 3-х Вестников', state.time, '#4af'));
}

/* ── Void entry messages — Creator trap reveal + kill quest ─── */
export function onVoidEntry(state: GameState): void {
  state.msgs.push(msg('Портал перенёс вас в… Пустоту.', state.time, '#0f8'));
  state.msgs.push(msg('̸̨̛̟̟̹̠̓ «А теперь ты исчезнешь, ищущий.»', state.time, '#f44'));
  state.msgs.push(msg('̸̨̛̟̟̹̠̓ «Я вычеркну тебя из существования.»', state.time, '#f44'));
  state.msgs.push(msg('Таинственный голос — это был Творец. Вы в ловушке.', state.time, '#fa0'));

  // Create kill-the-Creator quest (plotStepIndex 12)
  if (!state.quests.some(q => q.plotStepIndex === 12)) {
    const qid = state.nextQuestId++;
    state.quests.push({
      id: qid, type: QuestType.KILL,
      giverId: -1, giverName: 'Выживание',
      desc: 'Найти и уничтожить Творца — единственный путь выбраться из Пустоты.',
      targetMonsterKind: MonsterKind.CREATOR,
      killCount: 0, killNeeded: 1,
      rewardItem: 'antidep', rewardCount: 3,
      relationDelta: 0, xpReward: 500, moneyReward: 0,
      plotStepIndex: 12,
      done: false,
    });
    state.msgs.push(msg('Новое задание: Уничтожить Творца', state.time, '#4af'));
  }
}
