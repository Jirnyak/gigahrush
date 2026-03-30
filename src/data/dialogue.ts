/* ── NPC dialogue & trade generation ──────────────────────────── */
/* Generic talk pools + trade item pools. Story NPC dialogue       */
/* lives in plot.ts — this module handles the dispatch.            */

import { type Entity, Occupation } from '../core/types';
import { getPlotDef } from './plot';
import { getNpcStateText } from '../systems/ai';

/* ── Generic talk pools ──────────────────────────────────────── */
const GENERAL_LINES = [
  'Стены опять гудят... Скоро будет самосбор.',
  'Не ходи в длинные коридоры один.',
  'Я слышал шорох за стеной. Проверь двери.',
  'Тут раньше была кухня. Теперь — стена.',
  'Свет мигает всё чаще. Дурной знак.',
  'Сколько себя помню — одни стены и двери.',
  'Говорят, кто-то нашёл выход. Вернулся через стену.',
  'Бетон скрипит ночью. Будто дышит.',
  'Самосбор был вчера. Половина коридоров пропала.',
  'Мой сосед ушёл за водой и не вернулся.',
];

const FACTION_LINES: Record<number, string[]> = {
  0: ['Главное — не выходить во время самосбора.', 'Когда последний раз ел нормально?', 'Нужно беречь еду и воду.'],
  1: ['Ликвидаторы всегда на переднем крае.', 'После самосбора надо зачищать коридоры.', 'Видел тварь? Бей первым.'],
  2: ['Самосбор — не катастрофа. Это чудо.', 'Хрущ живой. Мы живём внутри его тела.', 'Стены — его плоть. Двери — суставы.'],
  3: ['Я изучаю природу хруща. Данные неоднозначны.', 'По моим расчётам, мир тороидальной формы.', 'Нужно больше образцов стен.'],
};

const OCC_LINES: Record<number, string[]> = {
  [Occupation.COOK]:        ['Плита ещё работает. Приходи покушать.', 'Запасы тают. Нужна тушёнка.'],
  [Occupation.DOCTOR]:      ['Приходи если ранен. Помогу.', 'Таблеток мало осталось.'],
  [Occupation.LOCKSMITH]:   ['Трубы потекли опять. Нужен инструмент.'],
  [Occupation.HUNTER]:      ['Я охочусь на сборок. Они слабые, но быстрые.'],
  [Occupation.PILGRIM]:     ['Помолись хрущу. Он слышит.'],
  [Occupation.SCIENTIST]:   ['Я записываю всё что вижу.'],
  [Occupation.STOREKEEPER]: ['Могу обменять кое-что полезное.'],
};

/* ── Talk text (called from NPC menu "Talk" tab) ─────────────── */
export function generateTalkText(npc: Entity): string {
  // ── Plot NPC dialogue ──
  const def = getPlotDef(npc);
  if (def) {
    // Sequential lines before plotDone
    if (!npc.plotDone && def.talkLines.length > 0) {
      const idx = (npc._plotTalkIdx ?? 0) % def.talkLines.length;
      npc._plotTalkIdx = idx + 1;
      return def.talkLines[idx];
    }
    // Post-plot random lines (or fall through to generic)
    if (def.talkLinesPost.length > 0) {
      return def.talkLinesPost[Math.floor(Math.random() * def.talkLinesPost.length)];
    }
  }

  // NPC's current activity sometimes shows through
  if (npc.ai?.npcState !== undefined && Math.random() < 0.4) {
    return getNpcStateText(npc.ai.npcState);
  }

  const lines: string[] = [...GENERAL_LINES];
  if (npc.faction !== undefined) lines.push(...(FACTION_LINES[npc.faction] ?? []));
  if (npc.occupation !== undefined) lines.push(...(OCC_LINES[npc.occupation] ?? []));
  return lines[Math.floor(Math.random() * lines.length)];
}

/* ── Trade item pools by occupation ──────────────────────────── */
const OCC_TRADE_ITEMS: Record<number, string[]> = {
  [Occupation.HOUSEWIFE]:   ['bread', 'water', 'cigs'],
  [Occupation.LOCKSMITH]:   ['wrench', 'pipe', 'flashlight', 'door_kit', 'block_kit'],
  [Occupation.SECRETARY]:   ['book', 'tea', 'cigs'],
  [Occupation.ELECTRICIAN]: ['wrench', 'flashlight', 'ammo_nails'],
  [Occupation.COOK]:        ['bread', 'kasha', 'kompot', 'canned'],
  [Occupation.DOCTOR]:      ['bandage', 'pills', 'antidep'],
  [Occupation.TURNER]:      ['wrench', 'pipe', 'rebar'],
  [Occupation.MECHANIC]:    ['wrench', 'pipe', 'flashlight', 'jackhammer', 'ammo_nails'],
  [Occupation.STOREKEEPER]: ['bread', 'water', 'cigs', 'bandage', 'ammo_shells', 'cleaning_kit'],
  [Occupation.ALCOHOLIC]:   ['bread', 'cigs', 'water'],
  [Occupation.SCIENTIST]:   ['flashlight', 'book', 'note', 'ammo_9mm'],
  [Occupation.CHILD]:       ['bread', 'water'],
  [Occupation.DIRECTOR]:    ['book', 'tea', 'cigs', 'ammo_9mm'],
  [Occupation.TRAVELER]:    ['bread', 'water', 'canned', 'cigs'],
  [Occupation.PILGRIM]:     ['bread', 'water', 'knife'],
  [Occupation.HUNTER]:      ['knife', 'canned', 'rawmeat', 'ammo_9mm'],
};

export function generateNpcTradeItems(npc: Entity): { defId: string; count: number }[] {
  const items: { defId: string; count: number }[] = [];
  const pool = OCC_TRADE_ITEMS[npc.occupation ?? 0] ?? ['bread', 'water'];
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const defId = pool[Math.floor(Math.random() * pool.length)];
    items.push({ defId, count: 1 + Math.floor(Math.random() * 3) });
  }
  return items;
}
