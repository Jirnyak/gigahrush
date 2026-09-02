/* ── Runtime NPC dialogue dispatch ───────────────────────────── */

import { type Entity } from '../core/types';
import { buildContextSnapshot, type ContextBuildOptions } from './context';
import { renderMarkovDialogueTalk } from './markov_dialogue';
import { routeAdapterSpeech } from './markov_router_adapters';
import {
  lowerNpcPackageSpeechContext,
  resolveNpcPackageForEntity,
  selectNpcLockedTalkLine,
} from './npc_package_speech';
import { markNpcSpokenTo } from './npc_memory';
import { observeRecentRumorEventsForNpc, selectRumorForNpc } from './rumor';
import { routeSpeech } from './speech_router';

let _dialogueInteractionCounter = 0;

/* ── Talk text (called from NPC menu "Talk" tab) ─────────────── */
export function generateTalkText(npc: Entity, options: ContextBuildOptions = {}): string {
  const now = options.time ?? performanceNowSeconds();
  const pack = resolveNpcPackageForEntity(npc);
  const locked = pack ? selectNpcLockedTalkLine(pack, npc, options.state?.quests, now) : undefined;
  if (pack && locked) {
    return routeSpeech({
      intent: 'locked_author_text',
      source: locked.source,
      context: lowerNpcPackageSpeechContext(pack, npc, 'dialogue'),
      lockedText: locked.text,
    }).text;
  }

  const snapshot = buildContextSnapshot(npc, options);
  const memory = markNpcSpokenTo(npc, now);
  observeRecentRumorEventsForNpc(npc, snapshot, now);

  _dialogueInteractionCounter++;

  const mood = renderMarkovDialogueTalk(npc, snapshot, {
    memory,
    time: now,
    repeatIndex: Math.max(0, Math.floor(now)) + _dialogueInteractionCounter,
    routeSpeech: routeAdapterSpeech,
  }).text;

  /* Настроение и слух — не два пути речи, а два слоя одного: марковская ветка
   * даёт тон по тегам и не несёт ни одного факта (у неё нет ни id слуха, ни
   * наводки, ни раскрытия), а отбор слуха выбирает ФАКТ и отдаёт его на
   * отрисовку тому же марковскому роутеру интентом `rumor_flavor`. Раньше здесь
   * стоял только первый слой: `observeRecentRumorEventsForNpc` ставил
   * `memory.lastEventRumorId`, и этот флаг не читал никто — весь выход системы
   * слухов был недостижим, вместе со строкой «Слух:» в журнале, которую зажигает
   * `rememberRecentRumorLead` внутри отбора.
   *
   * Каденцию и неповторяемость держит сам отбор своей же памятью: `lastRumorAt`
   * (пауза RUMOR_TALK_COOLDOWN_S на личность) и `knownRumorIds` (сказанное не
   * повторяется). Отсюда — ни таймера, ни своего счётчика. Перебор RUMORS
   * линейный, но он живёт на нажатии E по NPC, а не в кадре.
   *
   * Событие сюда не публикуется намеренно: услышанный слух — факт приватный
   * между этим NPC и игроком, а `publishEvent` кормит `recordRumorEvent`
   * (events.ts), то есть слух о слухе замкнул бы систему на себя. */
  const rumor = selectRumorForNpc(npc, snapshot, now);
  return rumor ? `${mood}\n\n${rumor}` : mood;
}

function performanceNowSeconds(): number {
  if (typeof performance !== 'undefined') return performance.now() / 1000;
  return Date.now() / 1000;
}
