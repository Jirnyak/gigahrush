/* ── Needs system: food, water, sleep, pee, poo ──────────────── */

import { type Entity, type Msg } from '../core/types';

// Rates per second
const FOOD_RATE  = 0.08;
const WATER_RATE = 0.12;
const SLEEP_RATE = 0.05;
const PEE_RATE   = 0.10;
const POO_RATE   = 0.06;

export function updateNeeds(entities: Entity[], dt: number, time: number, msgs: Msg[], playerId: number): void {
  for (const e of entities) {
    if (!e.alive || !e.needs) continue;
    const n = e.needs;

    // Attribute scaling: STR slows hunger, AGI slows thirst, INT slows sleep decay
    const str = e.rpg?.str ?? 0;
    const agi = e.rpg?.agi ?? 0;
    const int = e.rpg?.int ?? 0;
    const foodRate  = FOOD_RATE  / (1 + 0.1 * str);
    const waterRate = WATER_RATE / (1 + 0.1 * agi);
    const sleepRate = SLEEP_RATE / (1 + 0.1 * int);

    n.food  = Math.max(0, n.food  - foodRate  * dt);
    n.water = Math.max(0, n.water - waterRate * dt);
    n.sleep = Math.max(0, n.sleep - sleepRate * dt);
    n.pee   = Math.min(100, n.pee   + PEE_RATE   * dt);
    n.poo   = Math.min(100, n.poo   + POO_RATE   * dt);

    // Consequences
    if (e.hp === undefined) continue;

    if (n.food <= 0)  e.hp -= 0.3 * dt;
    if (n.water <= 0) e.hp -= 0.5 * dt;
    if (n.pee >= 100) e.hp -= 0.1 * dt;
    if (n.poo >= 100) e.hp -= 0.1 * dt;

    // Player warnings
    if (e.id === playerId) {
      if (n.food  < 15 && Math.random() < 0.005) addMsg(msgs, 'Вы голодны...', time, '#da4');
      if (n.water < 15 && Math.random() < 0.005) addMsg(msgs, 'Хочется пить...', time, '#48c');
      if (n.sleep < 10 && Math.random() < 0.005) addMsg(msgs, 'Глаза закрываются...', time, '#a8f');
      if (n.pee   > 85 && Math.random() < 0.005) addMsg(msgs, 'Нужен туалет...', time, '#da4');
    }

    // Death
    if (e.hp <= 0) {
      e.alive = false;
      e.hp = 0;
    }
  }
}

function addMsg(msgs: Msg[], text: string, time: number, color: string) {
  if (msgs.length > 0 && msgs[msgs.length - 1].text === text) return;
  msgs.push({ text, time, color });
}
