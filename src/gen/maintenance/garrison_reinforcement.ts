/* ── Пополнение гарнизона Громного: последствие смерти генерала ─────
 *
 * Генерал Заслонов увёл своих со смотра и лёг. Руна снята с его тела — и с этого
 * момента наверху известно, чей приказ закрывал низ. Дальше события расходятся
 * двумя видимыми следами: Блинков открывает игроку свой прилавок, а форпост
 * майора Громного в коллекторах перестаёт быть заставой из последних людей.
 *
 * Модуль отвечает только за второй след и НИЧЕГО не заводит.
 *
 * Люди берутся не из воздуха: их ПЕРЕВОЗЯТ. Общая механика
 * `migrateAlifePopulation` (`systems/alife.ts`) вынимает записи из бакета
 * донора и кладёт в бакет получателя, поэтому у Базы Ликвидаторов ровно на
 * столько же убывает. Обычного пополнения населения в проекте нет и быть не
 * должно (`alife.md`, «There is no ordinary background refill»).
 *
 * ЗА ЧТО ЦЕПЛЯЕМСЯ. Не за номер шага цепочки — индексы уже ездили и поедут
 * снова. Цепляемся за СОДЕРЖАНИЕ факта мира: `quest_completed` с парой тегов
 * `zaslonov_betrayal` + `black_rune`. Эта пара во всей цепочке и во всех
 * побочных ветках принадлежит ровно одному шагу — тому, где руна снята с
 * генерала. Соседний шаг («иди в министерство за патронами») несёт
 * `zaslonov_betrayal` без руны, ветки НИИ несут руну без предательства. Так же
 * читают сюжет `systems/scripted_arrivals.ts` и сцена входа гарнизона в Ад.
 *
 * ОДНОКРАТНОСТЬ — не своя. Своего флага у модуля нет намеренно: имя случившегося
 * переселения лежит в сейве A-Life, и повторный вызов с тем же именем не делает
 * ничего ни в этой сессии, ни после перезагрузки.
 */

import { Faction, msg, type GameState, type WorldEvent } from '../../core/types';
import { designNpcFloorKey } from '../../data/plot';
import { ALIFE_MIGRATION_BATCH_CAP, migrateAlifePopulation } from '../../systems/alife';
import { registerWorldEventObserver } from '../../systems/events';

/** Имя факта мира. По нему механика опознаёт переселение как уже прошедшее. */
export const GARRISON_REINFORCEMENT_MIGRATION_ID = 'maintenance_garrison_reinforced' as const;

/** Пара тегов шага «снять руну с генерала». Порядок не важен, важна связка. */
export const GARRISON_REINFORCEMENT_EVENT_TAGS = ['zaslonov_betrayal', 'black_rune'] as const;
const GARRISON_REINFORCEMENT_EVENT_TYPE = 'quest_completed' as const;

/** Донор — База Ликвидаторов (z −12): оттуда же Блинков, оттуда же снабжение. */
const DONOR_FLOOR_KEY = designNpcFloorKey('liquidatorbase');
/** Получатель — Коллекторы (z −26): форпост Громного держит трубу. */
const GARRISON_FLOOR_KEY = designNpcFloorKey('maintenance');

/* Сколько увозим. Своей ручки нет: берём потолок самой механики — больше одним
 * событием она не отдаёт по своему замыслу («часть населения переехала», а не
 * стёртый донор).
 *
 * Замер бакетов A-Life на дефолтном плане (числа плавают с сидом прогона, порядок
 * — нет): База Ликвидаторов 416 человек, из них 293 ликвидатора; Коллекторы 2445
 * человек, из них 245 ликвидаторов. Волна в 32 забирает у базы 11% её гарнизона
 * (293 → 261) и добавляет коллекторам 13% людей в форме (245 → 277). Отряд, а не
 * эвакуация, и при этом разница на этаже читается глазами. */
const GARRISON_REINFORCEMENT_COUNT = ALIFE_MIGRATION_BATCH_CAP;

function handleGarrisonReinforcement(state: GameState, event: WorldEvent): void {
  if (event.type !== GARRISON_REINFORCEMENT_EVENT_TYPE) return;
  for (const tag of GARRISON_REINFORCEMENT_EVENT_TAGS) {
    if (!event.tags.includes(tag)) return;
  }
  const moved = migrateAlifePopulation(state, {
    id: GARRISON_REINFORCEMENT_MIGRATION_ID,
    faction: Faction.LIQUIDATOR,
    fromFloorKey: DONOR_FLOOR_KEY,
    toFloorKey: GARRISON_FLOOR_KEY,
    count: GARRISON_REINFORCEMENT_COUNT,
  });
  // Ноль — законный исход: базу могли выбить. Тогда и говорить не о чем.
  if (moved <= 0) return;
  state.msgs.push(msg(
    // Число идёт через «численностью»: так строка остаётся грамотной при любом
    // размере волны, а согласовывать падеж с числом здесь нечем.
    `Радист Глеб ловит открытый канал: с Базы Ликвидаторов на коллекторы снят отряд численностью ${moved}. Форпост майора Громного принимает пополнение.`,
    state.time,
    '#8cf',
  ));
}

registerWorldEventObserver(handleGarrisonReinforcement);
