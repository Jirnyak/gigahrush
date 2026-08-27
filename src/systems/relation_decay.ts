/* ── Затухание отношений ──────────────────────────────────────────
 *
 * Единственный ограничитель насилия в социальном слое. Удар и убийство двигают
 * отношения (`systems/factions.ts`), и без обратной тяги любое число едет только
 * вниз: влить в обиду можно бесконечно, вылить нельзя ничем, поэтому долгий
 * прогон неизбежно сползает во всеобщую войну. Здесь живёт обратная тяга.
 *
 * Форма и её свойства — у самой шкалы (`data/relations.ts`, `relationDecayStep`):
 * четверть накопленного отклонения за визит, мёртвая зона до четырёх единиц.
 * Этот модуль отвечает только за ОБХОД: где взять записи, в каком порядке и на
 * сколько работы за такт.
 *
 * Каданс не свой: затухание едет на такте социального слоя
 * (`systems/demos_runtime.ts`, 30 с), и второй ручки времени в проекте нет.
 * Ширина обхода тоже не своя — это мягкий предел активных актёров, то есть
 * ровно столько записей, сколько этаж вообще способен носить. На жилом (1851
 * человек) это значит один полный проход бакета за такт: каждая тронутая
 * запись получает свой визит раз в 30 секунд.
 */

import { type Entity, type GameState } from '../core/types';
import { MAX_ACTIVE_ACTOR_SOFT_LIMIT } from '../data/entity_limits';
import { decayFactionMatrixTowardBase } from '../data/relations';
import { currentAlifeFloorKey, decayAlifeRelations } from './alife';
import { applyDemosRelationDelta } from './demos_social';
import { setNpcPlayerRelation } from './npc_relations';

export interface RelationDecayTickResult {
  /** Сдвинутых личных ячеек (к фракциям и к игроку). */
  cells: number;
  /** Сдвинутых пар глобальной матрицы. */
  matrix: number;
  /** Просмотренных записей A-Life. */
  scanned: number;
}

/* Курсор обхода бакета. В сейв не уезжает намеренно: это ускоритель, а не факт
 * о мире — сам дрейф хранится в записях, и потерянный курсор стоит одного
 * лишнего такта, а не одной забытой обиды. */
let bucketCursor = 0;

export function resetRelationDecay(): void {
  bucketCursor = 0;
}

/* Тела живых по номеру личности. Собирается ОДИН раз за такт (30 с) и только
 * если такт вообще пришёл: отношение к игроку живёт в трёх местах разом, и
 * запись в граф без зеркала в теле отменяется первой же сверткой этажа. Тот же
 * проход по списку, что уже делает `demos_runtime` своим `liveAlifeIdByEntityId`. */
const liveBodies = new Map<number, Entity>();

function indexLiveBodies(entities: readonly Entity[] | undefined): void {
  liveBodies.clear();
  if (!entities) return;
  for (const entity of entities) {
    if (entity.alive && entity.alifeId !== undefined) liveBodies.set(entity.alifeId, entity);
  }
}

/**
 * Один такт затухания. `maxMoves` — бюджет сдвинутых ячеек; списывается только
 * за реальный сдвиг, упор в мёртвую зону не платит. `entities` нужны, чтобы
 * зеркалить отношение к игроку в живые тела; без них затухают только записи.
 */
export function decayRelationsTick(
  state: GameState,
  maxMoves: number,
  entities?: readonly Entity[],
): RelationDecayTickResult {
  const budget = { remaining: Math.max(0, Math.floor(maxMoves)) };
  indexLiveBodies(entities);
  const cells = decayAlifeRelations(
    state,
    currentAlifeFloorKey(state),
    bucketCursor,
    MAX_ACTIVE_ACTOR_SOFT_LIMIT,
    budget,
    (alifeId, step) => {
      const applied = applyDemosRelationDelta(state, alifeId, { targetKind: 'player' }, step, {
        reasonTag: 'decay',
        // Остывание — не новость: круг знакомых о нём не узнаёт и своё
        // отношение не меняет, иначе затухание само себя разносило бы по графу.
        propagate: false,
      });
      if (!applied?.changed) return false;
      const body = liveBodies.get(alifeId);
      if (body) setNpcPlayerRelation(body, applied.relation);
      return true;
    },
  );
  liveBodies.clear();
  bucketCursor = cells.nextCursor;
  /* Матрица — тридцать недиагональных пар на всю игру, бюджет ей не нужен: она
   * дешевле одного визита к личности. Тянет туда же, к базе таблицы, и той же
   * мёртвой зоной бережёт заработанное игроком: награда за поручение в одну
   * единицу лежит ниже порога затухания и не рассасывается. */
  const matrix = decayFactionMatrixTowardBase();
  return { cells: cells.moved, matrix, scanned: cells.scanned };
}
