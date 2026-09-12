import {
  type Entity,
  type GameState,
  msg,
} from '../core/types';
import { ITEMS } from '../data/catalog';
import { addItem } from './inventory';
import { publishEvent } from './events';
import { isPlayerEntity } from './player_actor';
import { registerDebugCommand } from './debug_registry';

const ITEM_ID = 'maronary_shaving';
const BASE_TAGS = ['player', 'inventory', 'maronary', 'contraband', 'evidence'];

function shavingDef() {
  return ITEMS[ITEM_ID];
}

function eventTags(...extra: string[]): string[] {
  const tags = [...BASE_TAGS, ...extra];
  const def = shavingDef();
  for (const tag of def?.tags ?? []) if (!tags.includes(tag)) tags.push(tag);
  return tags;
}

export function destroyMaronaryShaving(actor: Entity, state: GameState | undefined): string {
  if (actor.rpg) actor.rpg.psi = Math.max(0, actor.rpg.psi - 6);
  else if (actor.hp !== undefined) actor.hp = Math.max(1, actor.hp - 2);

  if (state && isPlayerEntity(actor)) {
    const def = shavingDef();
    publishEvent(state, {
      type: 'player_destroy_item',
      actorId: actor.id,
      actorName: actor.name ?? 'Вы',
      actorFaction: actor.faction,
      itemId: ITEM_ID,
      itemName: def?.name ?? ITEM_ID,
      itemCount: 1,
      itemValue: def?.value ?? 0,
      severity: 4,
      privacy: 'local',
      tags: eventTags('destroyed', 'sample'),
      data: {
        outcome: 'destroyed',
        psiCost: actor.rpg ? 6 : 0,
        hpCost: actor.rpg ? 0 : 2,
        rumorIds: ['samosbor_maronary_shaving_hidden'],
      },
    });
  }

  return actor.rpg
    ? 'Стружка рассыпалась в серую пыль. Писк доказал ошибку: ПСИ -6.'
    : 'Стружка рассыпалась в серую пыль. Пальцы саднит, но документы молчат: HP -2.';
}

export function publishMaronaryShavingAcquired(actor: Entity, state: GameState, source: string): void {
  if (!isPlayerEntity(actor)) return;
  const def = shavingDef();
  publishEvent(state, {
    type: 'player_pick_item',
    actorId: actor.id,
    actorName: actor.name ?? 'Вы',
    actorFaction: actor.faction,
    itemId: ITEM_ID,
    itemName: def?.name ?? ITEM_ID,
    itemCount: 1,
    itemValue: def?.value ?? 0,
    severity: 3,
    privacy: 'local',
    tags: eventTags('acquire', source),
    data: {
      source,
      rumorIds: ['samosbor_maronary_shaving'],
    },
  });
}

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Grant Maronary shaving */
  id: 'grant_maronary_shaving',
  group: 'cheat',
  label: 'МАРОНАРИЙ: выдать стружку',
  run: ({ player, state }) => {
    const ok = addItem(player, 'maronary_shaving', 1);
    if (ok) publishMaronaryShavingAcquired(player, state, 'debug_grant');
    state.msgs.push(msg(ok ? '[MAR] зелёная стружка выдана' : '[MAR] нет места для стружки', state.time, ok ? '#fc4' : '#f84'));
  } });
