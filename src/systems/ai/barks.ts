/* ── A-Life barks: contextual NPC dialogue lines ─────────────── */

import { type Entity, type Msg, msg } from '../../core/types';
import { generateMarkovBark, isUnsafeMarkovBarkSignal } from '../markov_barks';
import { routeBarkSpeech } from '../markov_router_adapters';
import {
  npcPackageSpeechContextTags,
  resolveNpcPackageForEntity,
  selectNpcCuratedFallback,
} from '../npc_package_speech';
/* Монетка реплики берёт ДЕТЕРМИНИРОВАННЫЙ поток, а не `Math.random`.
 *
 * Раньше здесь стоял `import { mathRng as rng }` — косметическая обёртка под
 * именем детерминированной, — и это был не безобидный обман глаза. Монетка
 * решает, вызовется ли `generateMarkovBark`, а тот берёт выборки из ОБЩЕГО
 * потока: недетерминированный бросок менял ЧИСЛО выборок, и весь этаж уезжал.
 * Замерено: 3180 / 3177 / 3180 выборок за одни и те же 300 тиков в трёх
 * процессах, 905 вызовов `Math.random` за прогон `updateAI`. Правило
 * `Randomness` прямо запрещает косметическую обёртку в AI. */
import { rng } from '../../core/rand';

/* ── Probabilities ────────────────────────────────────────────── */

export const BARK_CHANCE_COMBAT = 0.06;
export const BARK_CHANCE_WOUNDED = 0.04;
export const BARK_CHANCE_FLEE = 0.08;
export const BARK_CHANCE_KILL = 0.12;
export const BARK_CHANCE_ARRIVE = 0.008;
export const BARK_CHANCE_HIDE = 0.03;
export const BARK_CHANCE_GENERIC = 0.01;

/* ── Helpers ──────────────────────────────────────────────────── */

const BARK_ENTITY_COOLDOWN_S = 6;
const MAX_BARK_COOLDOWNS = 1536;
export const DEFAULT_NPC_BARK_LOG_RADIUS_METERS = 100;
const MAX_NPC_BARK_LOG_RADIUS_METERS = 1024;
const lastBarkByEntity = new Map<number, { time: number; text: string }>();
const lastFloorBarkTimeBySignal = new Map<string, number>();
let lastFloorAnyBarkTime = -100;

/** Reset per-run ambient-bark cooldown state. Called from initGame (new run) and
 *  the load path: these are keyed by state.time / entity id and never saved, so a
 *  New-Game-without-reload (state.time→0) would otherwise leave lastFloorAnyBarkTime
 *  at a large run-1 value and suppress all floor barks until game-time caught up. */
export function resetBarkState(): void {
  lastBarkByEntity.clear();
  lastFloorBarkTimeBySignal.clear();
  lastFloorAnyBarkTime = -100;
}
export type NpcBarkSignal = 'alert' | 'witness' | 'lead' | 'ambient';

export interface NpcBarkLogContext {
  listener?: Pick<Entity, 'x' | 'y'>;
  radiusMeters?: number;
  dist2?: (x1: number, y1: number, x2: number, y2: number) => number;
  signal?: NpcBarkSignal;
  hud?: boolean;
  hudPriority?: number;
}

let npcBarkLogContext: NpcBarkLogContext = {
  radiusMeters: DEFAULT_NPC_BARK_LOG_RADIUS_METERS,
};

export function resolveNpcBarkLogRadiusMeters(radiusMeters?: number): number {
  if (radiusMeters !== undefined && Number.isFinite(radiusMeters)) {
    return Math.max(0, Math.min(MAX_NPC_BARK_LOG_RADIUS_METERS, radiusMeters));
  }
  return npcBarkLogContext.radiusMeters ?? DEFAULT_NPC_BARK_LOG_RADIUS_METERS;
}

export function setNpcBarkLogContext(context?: NpcBarkLogContext): void {
  npcBarkLogContext = resolveNpcBarkContext(context);
}

export function resolveNpcBarkContext(context?: NpcBarkLogContext): NpcBarkLogContext {
  return {
    listener: context?.listener ?? npcBarkLogContext.listener,
    radiusMeters: resolveNpcBarkLogRadiusMeters(context?.radiusMeters),
    dist2: context?.dist2 ?? npcBarkLogContext.dist2,
    signal: context?.signal ?? npcBarkLogContext.signal,
    hud: context?.hud ?? npcBarkLogContext.hud,
    hudPriority: context?.hudPriority ?? npcBarkLogContext.hudPriority,
  };
}

/**
 * Дойдёт ли реплика этого актора до слушателя. Тот же ответ, что даёт
 * `npcBarkDistanceForLog`, но без сборки объекта контекста: сторож стоит перед
 * марковской генерацией и зовётся за кадр столько раз, сколько людей собралось
 * заговорить. Аллокация на вызов в этом месте — цена самой проверки.
 *
 * Слушателя нет — слышно всем (так же, как у `npcBarkDistanceForLog`): это
 * безголовые прогоны и стенд, где решает не расстояние.
 */
function barkReachesListener(e: Entity): boolean {
  const listener = npcBarkLogContext.listener;
  if (!listener) return true;
  const d2 = npcBarkLogContext.dist2
    ? npcBarkLogContext.dist2(listener.x, listener.y, e.x, e.y)
    : (listener.x - e.x) * (listener.x - e.x) + (listener.y - e.y) * (listener.y - e.y);
  if (!Number.isFinite(d2)) return false;
  const radius = resolveNpcBarkLogRadiusMeters();
  return d2 <= radius * radius;
}

export function npcBarkDistanceForLog(e: Entity, context?: NpcBarkLogContext): number | null {
  const resolved = resolveNpcBarkContext(context);
  const listener = resolved.listener;
  if (!listener) return 0;
  const d2 = resolved.dist2
    ? resolved.dist2(listener.x, listener.y, e.x, e.y)
    : (listener.x - e.x) * (listener.x - e.x) + (listener.y - e.y) * (listener.y - e.y);
  if (!Number.isFinite(d2)) return null;
  const distance = Math.sqrt(Math.max(0, d2));
  if (distance > resolveNpcBarkLogRadiusMeters(context?.radiusMeters)) return null;
  return Math.max(0, Math.round(distance));
}

export function pushNpcLogMessage(
  e: Entity,
  msgs: Msg[],
  time: number,
  text: string,
  color = '#cca',
  context?: NpcBarkLogContext,
): boolean {
  const resolvedContext = resolveNpcBarkContext(context);
  const distanceMeters = npcBarkDistanceForLog(e, resolvedContext);
  if (distanceMeters === null) return false;
  const entry = msg(text, time, color, distanceMeters);
  if (resolvedContext.hud !== undefined) entry.hud = resolvedContext.hud;
  if (resolvedContext.hudPriority !== undefined) entry.hudPriority = resolvedContext.hudPriority;
  msgs.push(entry);
  return true;
}

export function pushNpcBarkMessage(
  e: Entity,
  msgs: Msg[],
  time: number,
  line: string,
  color = '#cca',
  context?: NpcBarkLogContext,
): boolean {
  if (!e.name) return false;
  const resolvedContext = resolveNpcBarkContext(context);
  const signal = resolvedContext.signal ?? 'ambient';
  return pushNpcLogMessage(e, msgs, time, `${e.name}: ${line}`, color, {
    ...resolvedContext,
    hud: resolvedContext.hud ?? barkSignalShowsHud(signal),
    hudPriority: resolvedContext.hudPriority ?? barkSignalHudPriority(signal),
  });
}


/**
 * Обстановка говорящего для марковского ядра.
 *
 * Это выравнивание с ДИАЛОГОМ, где такой контекст был всегда: `markov_dialogue`
 * шлёт `state.*`, `need.*`, `room` и метку обычного жителя. У барка контекст
 * строился ТОЛЬКО из авторского пакета, а пакета нет у подавляющего большинства
 * (на жилом этаже — у всех 2131). Выходило, что человек, с которым заговорили,
 * отвечает по обстановке, а тот же человек, говорящий сам, — из общего котла.
 */
/* Порог «нужда уже заметна» — тот же, по которому обстановку строит диалог
 * (`systems/context.ts`: `isHungry: food < 20`). Своего числа не заводим: два
 * порога одного и того же разошлись бы, и человек говорил бы о голоде, которого
 * собеседнику не видно. */
const NEED_TAG_THRESHOLD = 20;

function barkContextTags(
  e: Entity,
  pack: ReturnType<typeof resolveNpcPackageForEntity>,
  activityTag: string | undefined,
): readonly string[] {
  const tags: string[] = [];
  if (!pack) tags.push('ordinary_npc');
  // Чем занят — по драйву. Он и есть единственная правда о занятии; `npcState`
  // рядом остаётся позой для анимаций и потому шлётся вторым, а не вместо.
  if (activityTag) tags.push(activityTag);
  if (e.ai?.npcState !== undefined) tags.push(`state.${e.ai.npcState}`);
  const needs = e.needs;
  if (needs) {
    if (typeof needs.food === 'number' && needs.food < NEED_TAG_THRESHOLD) tags.push('need.food');
    if (typeof needs.water === 'number' && needs.water < NEED_TAG_THRESHOLD) tags.push('need.water');
    if (typeof needs.sleep === 'number' && needs.sleep < NEED_TAG_THRESHOLD) tags.push('need.sleep');
  }
  if (pack) tags.push(...npcPackageSpeechContextTags(pack, e, 'bark'));
  return tags;
}

/**
 * Реплика в общий марковский корпус, с контекстом того, чем человек занят.
 *
 * `activityTag` — что актор ДЕЛАЕТ, приходит от вызывающего. Своим импортом
 * ядра актора это брать нельзя: `actor/brain` уже тянет этот файл, и обратное
 * ребро замкнуло бы цикл импортов, запас по которому в проекте нулевой.
 */
export function emitMarkovBark(e: Entity, msgs: Msg[], time: number, signal: string, fallback: string, chance: number = 1.0, color = '#cca', activityTag?: string): void {
  if (rng() > chance) return;
  if (!e.name) return;
  const last = lastBarkByEntity.get(e.id);
  if (last && time - last.time < BARK_ENTITY_COOLDOWN_S && last.text === fallback) return;

  const isUrgentSignal = signal === 'alert' || signal === 'combat' || signal === 'witness' || signal === 'lead' || signal === 'wounded' || signal === 'flee';
  const anyBarkGap = time - lastFloorAnyBarkTime;
  const minAnyGap = isUrgentSignal ? 0.6 : 4.5;
  if (anyBarkGap < minAnyGap && lastFloorAnyBarkTime > -10) return;

  const lastSignalTime = lastFloorBarkTimeBySignal.get(signal) ?? -100;
  const minSignalGap = isUrgentSignal ? 2.2 : 6.0;
  if (time - lastSignalTime < minSignalGap && lastSignalTime > -10) return;

  /* Слышимость проверяется ДО генерации, и это не оптимизация ради оптимизации.
   *
   * Порядок был обратный: марковская фраза строилась всегда, а потом
   * `pushNpcBarkMessage` выбрасывал её по расстоянию. Радиус слышимости 100
   * клеток на мире 1024 — значит выбрасывалось подавляющее большинство. Хуже
   * того, общие лимиты частоты ниже обновляются ТОЛЬКО у услышанного барка:
   * невыброшенный ничего не тратил, и следующий же актор в том же кадре
   * генерировал заново. Ограничитель в «одна реплика на 4.5 с» реальную частоту
   * генерации не сдерживал вовсе — в профиле `generateMarkovText` стоил 3.9%
   * кадра пачками, то есть подфризами.
   *
   * Ничего player-зависимого этим НЕ вносится: и `activeBark` (его читает
   * только HUD), и запись в лог, и сами лимиты уже стояли под `if (heard)`.
   * Убрана ровно работа, результат которой и так выбрасывался. */
  if (!barkReachesListener(e)) return;

  const pack = resolveNpcPackageForEntity(e);
  const seed = e.alifeId ?? e.id;
  const packageFallback = pack && !isUnsafeMarkovBarkSignal(signal)
    ? selectNpcCuratedFallback(pack, 'bark_ambient', seed)
    : undefined;
  const routed = generateMarkovBark({
    actor: {
      id: e.id,
      name: e.name,
      faction: e.faction,
      occupation: e.occupation,
    },
    signal,
    exactFallback: packageFallback ?? fallback,
    seed,
    repeatIndex: Math.floor(time),
    tags: barkContextTags(e, pack, activityTag),
    routeSpeech: routeBarkSpeech,
  });

  const text = routed?.text ?? fallback;
  const heard = pushNpcBarkMessage(e, msgs, time, text, color, { signal: signal as any });
  if (heard) {
    // Determine display duration: minimum 2.5s, plus 0.12s per character, max 6s
    const duration = Math.min(6, Math.max(2.5, text.length * 0.12));
    e.activeBark = { text, until: time + duration, color };
  }
  if (!heard) return;
  lastFloorAnyBarkTime = time;
  lastFloorBarkTimeBySignal.set(signal, time);
  lastBarkByEntity.set(e.id, { time, text: fallback });
  if (lastBarkByEntity.size > MAX_BARK_COOLDOWNS) pruneBarkCooldowns();
}

function barkSignalShowsHud(signal: NpcBarkSignal): boolean {
  return signal === 'alert' || signal === 'witness';
}

function barkSignalHudPriority(signal: NpcBarkSignal): number {
  switch (signal) {
    case 'alert': return 80;
    case 'witness': return 58;
    case 'lead': return 38;
    default: return 8;
  }
}

function pruneBarkCooldowns(): void {
  let oldestId = -1;
  let oldestTime = Infinity;
  for (const [id, entry] of lastBarkByEntity) {
    if (entry.time < oldestTime) {
      oldestTime = entry.time;
      oldestId = id;
    }
  }
  if (oldestId >= 0) lastBarkByEntity.delete(oldestId);
  if (lastFloorBarkTimeBySignal.size > 64) lastFloorBarkTimeBySignal.clear();
}
