/* Заготовки акторов для стендов и дампов.
 *
 * Стенды НЕ импортируют `tests/helpers`, и это не вкусовщина: каталог `tests`
 * НАМЕРЕННО вне скоупа `tsconfig` (630 ошибок частичных заглушек — законная
 * тестовая идиома), а `scripts` в скоупе с 2026-08-26. Один импорт из стенда в
 * `tests/` затаскивает весь каталог в типизацию, и `npm run typecheck` краснеет
 * ошибками, которых в `src/` нет: `helpers.ts` даёт `showFeedback` и
 * `floorRunState`, стоит только любому скрипту его позвать.
 *
 * Форма заготовок повторяет `makeTestEntity` дословно, включая то, чего в ней
 * НЕТ (`rpg`, `ai`, `attackCd`): дамп сравнивается с деревом до правки, и
 * лишнее поле сдвинуло бы обе стороны сразу.
 */
import {
  AIGoal, EntityType, Faction, MonsterKind,
  type Entity, type GameState,
} from '../src/core/types';
import { MONSTERS } from '../src/entities/monster';
import { createArenaGameState } from '../src/arena_scenarios';
import { createWorldEventState } from '../src/systems/events';

export function benchState(): GameState {
  const state = createArenaGameState();
  state.worldEvents = createWorldEventState();
  return state;
}

/** Полная строка характеристик: `RPGStats` без выдуманных полей. */
export function benchRpg(str = 5): NonNullable<Entity['rpg']> {
  return { level: 1, xp: 0, attrPoints: 0, str, agi: 5, int: 5, psi: 10, maxPsi: 10 };
}

type ActorOverrides = Partial<Entity> & { id: number };

function benchEntity(over: ActorOverrides): Entity {
  const type = over.type ?? EntityType.NPC;
  const faction = over.faction ?? Faction.PLAYER;
  return {
    type, x: 0, y: 0, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 0,
    faction, inventory: [],
    ...over,
    persistentNpcId: over.persistentNpcId
      ?? (type === EntityType.NPC && faction === Faction.PLAYER ? 'player' : undefined),
  };
}

export function benchPlayer(over: ActorOverrides): Entity {
  return benchEntity({
    ...over,
    type: EntityType.NPC,
    name: over.name ?? 'Вы',
    faction: over.faction ?? Faction.PLAYER,
    inventory: over.inventory ?? [],
  });
}

export function benchNpc(over: ActorOverrides): Entity {
  return benchEntity({
    ...over,
    type: EntityType.NPC,
    name: over.name ?? 'Тестовый NPC',
    faction: over.faction ?? Faction.CITIZEN,
    inventory: over.inventory ?? [],
    alifeId: 'alifeId' in over ? over.alifeId : (over.id > 0 ? over.id : undefined),
    money: over.money ?? 100,
  });
}

/**
 * Тварь по своей строке вида. Ни имени, ни `rpg` заготовка не ставит: имя
 * подставит `entityDisplayName` из дефа вида, а характеристики нужны не всем
 * стендам — кому нужны, тот передаёт `rpg: benchRpg()` сам.
 */
export function benchMonster(kind: MonsterKind, over: ActorOverrides & { x: number; y: number }): Entity {
  const def = MONSTERS[kind];
  return benchEntity({
    type: EntityType.MONSTER,
    faction: Faction.WILD,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0, currentMag: 1,
    ai: { goal: AIGoal.HUNT, tx: over.x, ty: over.y, path: [], pi: 0, stuck: 0, timer: 0 },
    ...over,
  });
}
