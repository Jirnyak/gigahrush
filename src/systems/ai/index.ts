/* ── AI system — orchestrator ─────────────────────────────────── */

export { forceHide } from './npc_fsm';
export { tryMonsterProjectileStagger } from './monster';

import {
  type Entity, type GameState, type Msg, type GameClock,
  EntityType, MonsterKind, AIGoal,
  setMsgLocationProvider,
} from '../../core/types';
import { World } from '../../core/world';
import { setPathContext } from './pathfinding';
import { setEntityMap, updateMonster } from './monster';
import { setCombatContext, tryFactionCombat, tryFleeFromMonster, trySimulateNpcAmmoRestock } from './combat';
import { primeNpcAlifeState, setNpcContext, updateNPC } from './npc_fsm';
import { setNpcBarkLogContext } from './barks';
import { actorHasTacticProfile, runActorTactic } from './tactics';
import { expireMonsterBaits } from '../monster_bait';
import { depositPendingNoise } from '../noise';
import { ensureEntityIndex } from '../entity_index';
import { hearingRadiusMetersForActor } from '../hearing';
import { applyActorSeparation, depositActorTrail, unstuckActorFromBlockers } from '../movement_collision';
import {
  depositBeasts, depositPeople, FIELD_DEPOSIT_STRIDE_MASK, FIELD_PRESENCE_DEPOSIT,
} from '../fields';
import { actorBrainOwnsRoute, setActorCoreContext, tickActorBrain } from '../actor/brain';
import { isPlayerEntity } from '../player_actor';
import { setFactionsSocialContext } from '../factions';
import { setRoomVisitContext } from '../room_visits';
import { designFloorAtZ } from '../../data/design_floors';
import { isPlotNpc } from '../../data/plot';
import { updateMukhozhukLarvae } from './mukhozhuk';

export interface AiStats {
  frame: number;
  liveAi: number;
  skipped: number;
  updated: number;
  updatedNpc: number;
  updatedMonster: number;
  plot: number;
  bosses: number;
  activeAttackers: number;
  projectileOwners: number;
  projectiles: number;
}

const projectileOwnerIds = new Set<number>();
let aiStats: AiStats = {
  frame: 0,
  liveAi: 0,
  skipped: 0,
  updated: 0,
  updatedNpc: 0,
  updatedMonster: 0,
  plot: 0,
  bosses: 0,
  activeAttackers: 0,
  projectileOwners: 0,
  projectiles: 0,
};
let aiFrame = 0;

function resetAiStats(frame: number, liveAi: number, projectiles: number): void {
  aiStats = {
    frame,
    liveAi,
    skipped: 0,
    updated: 0,
    updatedNpc: 0,
    updatedMonster: 0,
    plot: 0,
    bosses: 0,
    activeAttackers: 0,
    projectileOwners: 0,
    projectiles,
  };
}

export function getAiStats(): AiStats {
  return { ...aiStats };
}

// Rescue-from-solid is a rare error state, but its cell probes ran for every
// actor every frame. Actors are swept round-robin on a budget, matching the
// updateBloodTrails cadence pattern.
const UNSTUCK_ACTOR_BUDGET = 256;
// Боевая цель поднимает актёра из очереди вне очереди — но не каждый кадр.
// На людном этаже её держит половина живых, и ежекадровое исключение съедало
// бюджет целиком (≈1300 вызовов вместо 256). Маска разводит бойцов по кадрам
// фазой от id: застрявший в толкучке боец выбирается за восемь кадров, что
// не медленнее очереди раунд-робина на той же толпе.
const UNSTUCK_COMBAT_FRAME_MASK = 7;
let unstuckCursor = 0;
// Запрос на вызволение один и тот же для всех: раньше он собирался заново на
// каждого актёра каждый кадр. unstuckActorFromBlockers его только читает.
const UNSTUCK_ACTOR_OPTIONS = { radius: 0, rescueFromSolid: true } as const;

/**
 * Точка входа нового ядра актора (`systems/actor`).
 *
 * Ядро идёт ПЕРЕД прежним слоем и берёт актора себе, только если у него есть
 * что делать: тяга выше порога и живой склон поля под ногами. Иначе оно честно
 * возвращает false, и ход достаётся тому, кто вёл актора до сих пор.
 *
 * Границы захвата ровно две, и обе — про то, чтобы не отменять чужой начатый
 * ход, а не про вид актора:
 *
 *  1. Есть боевая цель — бой ведёт свой слой. В самом ядре бой станет обычным
 *     драйвом, но забирать его у работающего кода до того рано.
 *  2. Актёра держит сцена. Признак ЯВНЫЙ — `cinematicState` с постом, — а не
 *     догадка по наличию маршрута. Это НЕ выключение симуляции: AI актёра
 *     работает, он отвечает на удар и живёт по общим правилам; ядро лишь не
 *     уводит его с поста, пока у него есть роль в сцене. Ветку
 *     `role === CINEMATIC_ACTOR → continue` возвращать нельзя и не возвращаем:
 *     она делала вторую, несимулируемую породу людей.
 *
 *  3. Уже идёт по ЧУЖОМУ маршруту. Это граница не корректности, а экономии, и
 *     она отдельная от пункта 2 намеренно: сцену стережёт явный признак, а
 *     здесь — просто «не переделывай чужой начатый ход». Мерено: без неё
 *     ядро вытесняет чужие маршруты, трёпка пути падает (худший перекладчик
 *     2.74 → 1.80/с), но кадр дорожает на 8.6%, застревание насмерть растёт
 *     8.8 → 10.6%, а кучность 34.3 → 39.8. Бюджет берётся удешевлением
 *     мышления, а не доплатой за него, поэтому вытеснение не взято.
 *
 * Своего маршрута ядра границей не считаем: стратегический драйв ведёт цель за
 * горизонтом именно путём.
 *
 * Один цикл на всех: человек и тварь заходят сюда одной и той же строкой, и
 * разница между ними живёт в весах драйвов, а не здесь.
 */
function tryActorCore(world: World, e: Entity, dt: number, time: number): boolean {
  const ai = e.ai;
  if (!ai) return false;
  if (e.cinematicState !== undefined) return false;
  if (ai.path.length > 0 && !actorBrainOwnsRoute(e)) return false;
  return tickActorBrain(world, e, dt, time);
}

/**
 * Присутствие и след одного актора.
 *
 * Страйд обязателен: депозит на каждом кадре насыщает байт до 255 за долю
 * секунды, и канал перестаёт отличать «людно» от «кто-то прошёл». Фаза берётся
 * из id, поэтому акторы разведены по кадрам и нагрузка ровная.
 *
 * Зовётся и для игрока — по закону «игрок — просто NPC» он такой же человек в
 * поле. Отдельным вызовом, а не в цикле: строка `ai` у игрока есть и в индекс
 * думающих он попадает, но цикл сравнивает с ним каждого и решения за него не
 * принимает, поэтому депозит игрока и живёт снаружи — ровно один на кадр.
 */
function depositActorPresence(world: World, e: Entity, frame: number): void {
  if (((frame + e.id) & FIELD_DEPOSIT_STRIDE_MASK) !== 0) return;
  if (e.type === EntityType.MONSTER) depositBeasts(world, e.x, e.y, FIELD_PRESENCE_DEPOSIT);
  else depositPeople(world, e.x, e.y, FIELD_PRESENCE_DEPOSIT);
  // Идущие через общий шаг метят след сами, на входе в клетку. Здесь — те, кого
  // двигает не он: игрок из main.ts и сетевые пиры.
  depositActorTrail(world, e);
}

function isBossActor(e: Entity): boolean {
  if (e.isFogBoss) return true;
  switch (e.monsterKind) {
    case MonsterKind.BETONNIK:
    case MonsterKind.MATKA:
    case MonsterKind.KHOROVAYA_MATKA:
    case MonsterKind.MANCOBUS:
    case MonsterKind.CREATOR:
      return true;
    default:
      return false;
  }
}

function isActiveAttacker(e: Entity, entityById: Map<number, Entity>): boolean {
  const ai = e.ai;
  if (!ai || ai.combatTargetId === undefined) return false;
  const target = entityById.get(ai.combatTargetId);
  if (!target?.alive) return false;
  if ((ai.windupTimer ?? 0) > 0) return true;
  return (e.attackCd ?? 0) > 0;
}

function fillProjectileOwners(entities: readonly Entity[]): void {
  projectileOwnerIds.clear();
  for (const e of entities) {
    if (!e.alive || e.ownerId === undefined || e.type !== EntityType.PROJECTILE) continue;
    projectileOwnerIds.add(e.ownerId);
  }
}

export function updateAI(world: World, entities: Entity[], dt: number, time: number, msgs: Msg[], playerId: number, clock: GameClock, samosborActive: boolean, nextId: { v: number }, currentZ?: number, state?: GameState): void {
  // Push per-frame refs into sub-modules
  setPathContext(msgs, time, samosborActive);
  setCombatContext(msgs, time);
  setNpcContext(msgs, time, currentZ);
  // Часы — третий род входа в счёт драйва: распорядок висит на минуте суток, а
  // ни тело, ни восприятие времени не знают. Снимок общий на кадр.
  setActorCoreContext(currentZ, clock, samosborActive, state, msgs);
  setFactionsSocialContext(state);
  setRoomVisitContext(state);
  expireMonsterBaits(state, time);
  // Свежие записи шума ложатся в канал NOISE: список остаётся метаданными
  // (кто, чем, какие ярлыки), а «насколько здесь громко» живёт в поле.
  if (state) depositPendingNoise(world, state);
  // Личинки мухожука зреют сами, даже если их мать давно убита.
  updateMukhozhukLarvae(world, entities, nextId, dt, time, msgs, state);

  // Main rebuilds the runtime broadphase once before simulation; AI only consumes it.
  const entityIndex = ensureEntityIndex(entities);
  setEntityMap(entityIndex.byId);
  fillProjectileOwners(entityIndex.projectiles);

  // Конторский распорядок — свойство самого министерства, а не пятнадцати
  // этажей его бывшей корзины.
  const designFloor = currentZ !== undefined ? designFloorAtZ(currentZ) : undefined;
  const isMinistry = designFloor?.id === 'ministry';
  const player = entityIndex.byId.get(playerId);
  setNpcBarkLogContext({
    listener: player,
    radiusMeters: hearingRadiusMetersForActor(player, state?.npcLogRadiusMeters),
    dist2: (x1, y1, x2, y2) => world.dist2(x1, y1, x2, y2),
  });
  aiFrame = (aiFrame + 1) & 0x3fffffff;
  // Игрока цикл ниже пропускает по имени (решения за него принимает ввод), но в
  // полях восприятия он обычный человек, и присутствие за него пишется здесь.
  if (player?.alive) depositActorPresence(world, player, aiFrame);
  resetAiStats(aiFrame, entityIndex.ai.length, entityIndex.projectiles.length);

  let currentMsgActor: Entity | undefined;
  setMsgLocationProvider(() => {
    const actor = currentMsgActor;
    if (!actor) return undefined;
    const ci = world.idx(Math.floor(actor.x), Math.floor(actor.y));
    const roomId = world.roomMap[ci];
    return {
      z: currentZ,
      x: actor.x,
      y: actor.y,
      actorId: actor.id,
      roomId: roomId >= 0 ? roomId : undefined,
      zoneId: world.zoneMap[ci],
    };
  });
  const aiCount = entityIndex.ai.length;
  const unstuckStart = aiCount > 0 ? unstuckCursor % aiCount : 0;
  unstuckCursor = aiCount > 0 ? (unstuckStart + UNSTUCK_ACTOR_BUDGET) % aiCount : 0;
  // Расталкивание идёт в том же окне раунд-робина, что и вызволение: бюджет на
  // кадр фиксирован независимо от населения. Актёр попадает в окно раз в
  // aiCount/UNSTUCK_ACTOR_BUDGET кадров, поэтому и шаг ему полагается за весь
  // этот промежуток, иначе на людном этаже куча расходилась бы вдесятеро дольше.
  const separationDt = dt * Math.max(1, aiCount / UNSTUCK_ACTOR_BUDGET);
  let aiIdx = -1;
  try {
    for (const e of entityIndex.ai) {
      aiIdx++;
      if (!e || !e.alive || !e.ai) continue;
      /* Присутствие пишут ВСЕ живые акторы, включая тех, кого цикл ниже
       * пропускает: сетевых пиров и актёров сцены. Поле отвечает на вопрос
       * «кто здесь есть», а не «кого обсчитывает AI». Это не новый проход по
       * коллекции — цикл уже идёт. Игрок обслужен до цикла: он в него не
       * попадает вовсе. */
      if (e !== player) depositActorPresence(world, e, aiFrame);
      if (isPlayerEntity(e)) {
        aiStats.skipped++;
        continue;
      }
      if (e.peerSlot !== undefined) {
        aiStats.skipped++;
        continue; // peer actors are controlled by remote players, not AI
      }
      /* Откат атаки убывает ЗДЕСЬ и только здесь — ровно как пейн-стан.
       *
       * Он жил по видовым веткам и тикал ТОЛЬКО в тех кадрах, где тварь уже
       * достала до цели. Бродящий монстр поэтому не отпускал откат никогда, а
       * контакт со створкой (`actorContactDoor`) гейтится этим же откатом и сам
       * же его взводит: первый удар в дверь оказывался и последним, а створка
       * держит 50 HP при ударе в 3–22. Замерено на жилом этаже: `attackCd > 0`
       * у 60.7% монстров, самая длинная полоса — весь прогон.
       *
       * У игрока (`movePlayer`) и у сетевого пира (`hostTickRemoteActor`) откат
       * тикал всегда, у твари — нет. Это та же зеркальная асимметрия общего
       * закона, которую уже сняли со стаггера: разница между игроком и тварью
       * не должна быть выразима. Цикл пропустил обоих выше по имени, поэтому
       * третьей убыли им отсюда не достаётся.
       *
       * Второй такой убыли в проекте быть не должно: видовые ветки только
       * читают остаток и взводят его заново. Двойная убыль удваивает темп атак
       * и молча двигает весь бой — так и жил Слепоглаз, тикавший и в своём
       * такте, и в ближней обороне. Замок — `tests/attack-cooldown-tick.test.ts`.
       *
       * `undefined` не трогаем: у него своё значение — «этот ещё не бил»
       * (`ai/tumannik.ts` читает именно его). */
      if ((e.attackCd ?? 0) > 0) e.attackCd = Math.max(0, e.attackCd! - dt);
      /* Актёра сцены цикл AI НЕ пропускает. Раньше пропускал, и это создавало
       * вторую, несимулируемую породу людей: гражданский подходил и бил
       * ликвидатора в строю, а тот не отвечал — не потому, что не хотел, а
       * потому, что его AI не запускался. Кат-сцены здесь идут на движке игры,
       * и держать актёра надо поводком и вейпойнтом, а не выключателем. */
      if (aiCount <= UNSTUCK_ACTOR_BUDGET
        || ((aiIdx - unstuckStart + aiCount) % aiCount) < UNSTUCK_ACTOR_BUDGET
        || (e.ai.combatTargetId !== undefined
          && (((aiFrame + e.id) & UNSTUCK_COMBAT_FRAME_MASK) === 0))) {
        unstuckActorFromBlockers(world, e, UNSTUCK_ACTOR_OPTIONS);
        /* Тела больше не складываются в одну подклетку. Расталкивания в проекте
         * не было вообще: предикаты движения принимали radius и выбрасывали его,
         * поэтому актёры проходили друг сквозь друга и стекались в точку, как в
         * аттрактор. Один capped-запрос по общей броадфазе, ноль аллокаций,
         * срабатывает только при реальном перекрытии тел. */
        applyActorSeparation(world, e, separationDt);
      }
      if (e.type === EntityType.NPC) {
        if (e.ai.npcState === undefined) {
          primeNpcAlifeState(e, clock, samosborActive, isMinistry ? 'ministry' : 'default');
        }
      } else if (e.type === EntityType.MONSTER && e.ai.goal === AIGoal.IDLE && e.ai.combatTargetId === undefined && e.speed > 0) {
        e.ai.goal = AIGoal.WANDER;
      }
      if (('plotNpcId' in e && e.plotNpcId !== undefined) || isPlotNpc(e)) aiStats.plot++;
      if (isBossActor(e)) aiStats.bosses++;
      if (isActiveAttacker(e, entityIndex.byId)) aiStats.activeAttackers++;
      if (projectileOwnerIds.has(e.id)) aiStats.projectileOwners++;
      aiStats.updated++;
      currentMsgActor = e;
      if (e.type === EntityType.NPC) {
        aiStats.updatedNpc++;
        trySimulateNpcAmmoRestock(e, dt);
        if (actorHasTacticProfile(e) && runActorTactic(world, e, dt, time, msgs, state)) continue;
        /* Ядро идёт ПЕРЕД боем, а не после него, и это не перестановка строк.
         * Пока бой стоял первым, он забирал всякого, у кого есть цель, и решение
         * «драться или бежать» ядру не доставалось никогда — разорвать контакт
         * было физически нечем. Теперь драка это обычный драйв яруса `actor`:
         * победила — ядро объявляет цель и уступает ход слою (возвращает false),
         * победил страх — ядро уводит, сняв цель и боевую память. */
        if (tryActorCore(world, e, dt, time)) continue;
        if (!tryFactionCombat(world, entities, e, dt, time, msgs, nextId, state)) {
          if (!tryFleeFromMonster(world, entities, e, dt, time)) {
            updateNPC(world, entities, e, dt, time, clock, samosborActive, isMinistry ? 'ministry' : 'default', state);
          }
        }
      }
      if (e.type === EntityType.MONSTER) {
        aiStats.updatedMonster++;
        if (actorHasTacticProfile(e) && runActorTactic(world, e, dt, time, msgs, state)) continue;
        if (tryActorCore(world, e, dt, time)) continue;
        updateMonster(world, entities, e, dt, time, msgs, playerId, nextId, state);
      }
    }
  } finally {
    currentMsgActor = undefined;
    setMsgLocationProvider();
  }
}
