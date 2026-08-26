import { EntityType, type Entity, type GameState, msg } from '../core/types';
import { summarizeHladonColdPockets } from './hladon';
import { summarizeCarnivorousFungus } from './carnivorous_fungus';
import { summarizeHeatline } from './heatline';
import { floorCatalogDebugLines } from './floor_catalog';
import { World } from '../core/world';
import { countContainerItems } from './containers';
import { summarizeEconomy } from './economy';
import { summarizeProduction } from './production';
import { registerDebugCommand } from './debug_registry';

export function populationItemSummary(world: World, entities: Entity[], state: GameState): string[] {
  let npcs = 0, monsters = 0, drops = 0, dropItems = 0;
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.type === EntityType.NPC) npcs++;
    else if (e.type === EntityType.MONSTER) monsters++;
    else if (e.type === EntityType.ITEM_DROP) {
      drops++;
      for (const i of e.inventory ?? []) dropItems += i.count;
    }
  }
  return [
    `NPC=${npcs} MON=${monsters} DROP=${drops}/${dropItems}`,
    `CONT=${world.containers.length}/${countContainerItems(world)}`,
    ...summarizeEconomy(state, 4),
    ...summarizeProduction(state, 3),
  ];
}

const CATALOG_DEBUG_SEARCHES = [ 'numbered', '404', 'school', 'hospital', 'market'];
let catalogDebugSearchIndex = 0;

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Population, item count, and floor pocket catalog */
  id: 'balance_catalog',
  group: 'economy',
  label: 'Баланс + каталог карманов',
  run: ({ world, player, entities, state }) => {
    for (const line of populationItemSummary(world, entities, state)) state.msgs.push(msg(`[BAL] ${line}`, state.time, '#ccf'));
    const search = CATALOG_DEBUG_SEARCHES[catalogDebugSearchIndex++ % CATALOG_DEBUG_SEARCHES.length];
    const query = search
      ? { search, limit: 6 }
      /* Здесь стоял `baseFloor: state.currentZ`, а в `FloorCatalogQuery` такого
       * поля нет вовсе: ключ молча выбрасывался, и отладка показывала первые
       * шесть записей каталога НЕЗАВИСИМО от этажа. Компилятор промолчал,
       * потому что литерал уходит в переменную через тернарник, а проверка
       * лишних свойств на переменные не распространяется. Фильтра по этажу у
       * запроса нет — если он нужен, это отдельное решение владельца. */
      : { limit: 6 };
    for (const line of floorCatalogDebugLines(query)) state.msgs.push(msg(`[CAT] ${line}`, state.time, '#ccf'));
    for (const line of summarizeHeatline(world)) state.msgs.push(msg(line, state.time, '#f84'));
    for (const line of summarizeCarnivorousFungus(world)) state.msgs.push(msg(line, state.time, '#bf8'));
    for (const line of summarizeHladonColdPockets(world, player)) state.msgs.push(msg(line, state.time, '#8cf'));
  } });
