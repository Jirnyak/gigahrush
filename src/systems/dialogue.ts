/* ── Runtime NPC dialogue dispatch ───────────────────────────── */

import { type Entity } from '../core/types';
import { PLOT_CHAIN, getPlotDef } from '../data/plot';
import { getNpcStateText } from './ai';
import { buildContextSnapshot, type ContextBuildOptions } from './context';
import { renderMarkovDialogueTalk } from './markov_dialogue';
import { routeAdapterSpeech } from './markov_router_adapters';
import { markNpcSpokenTo } from './npc_memory';
import { observeRecentRumorEventsForNpc, selectRumorForNpc } from './rumor';

/* ── Talk text (called from NPC menu "Talk" tab) ─────────────── */
export function generateTalkText(npc: Entity, options: ContextBuildOptions = {}): string {
  const def = getPlotDef(npc);
  if (def) {
    const plotPostUnlocked = isPlotNpcPostUnlocked(npc, options.state?.quests);
    if ((npc.plotDone || plotPostUnlocked) && def.talkLinesPost.length > 0 && Math.random() < 0.75) {
      return def.talkLinesPost[Math.floor(Math.random() * def.talkLinesPost.length)];
    }
    if (!npc.plotDone && !plotPostUnlocked && def.talkLines.length > 0) {
      const idx = (npc._plotTalkIdx ?? 0) % def.talkLines.length;
      npc._plotTalkIdx = idx + 1;
      return def.talkLines[idx];
    }
    if (def.talkLinesPost.length > 0 && Math.random() < 0.75) {
      return def.talkLinesPost[Math.floor(Math.random() * def.talkLinesPost.length)];
    }
  }

  const now = options.time ?? performanceNowSeconds();
  const snapshot = buildContextSnapshot(npc, options);
  const memory = markNpcSpokenTo(npc, now);
  observeRecentRumorEventsForNpc(npc, snapshot, now);

  const rumorLine = selectRumorForNpc(npc, snapshot, now);
  if (rumorLine) return rumorLine;

  if (npc.ai?.npcState !== undefined && Math.random() < 0.4) {
    return getNpcStateText(npc.ai.npcState);
  }

  return renderMarkovDialogueTalk(npc, snapshot, {
    memory,
    time: now,
    repeatIndex: Math.max(0, Math.floor(now)),
    routeSpeech: routeAdapterSpeech,
  }).text;
}

function isPlotNpcPostUnlocked(npc: Entity, quests: readonly { plotStepIndex?: number; done?: boolean }[] | undefined): boolean {
  const plotId = npc.plotNpcId;
  if (!plotId || !quests) return false;
  let hasStep = false;
  for (let i = 0; i < PLOT_CHAIN.length; i++) {
    if (PLOT_CHAIN[i].giverNpcId !== plotId) continue;
    hasStep = true;
    if (!quests.some(q => q.plotStepIndex === i && q.done)) return false;
  }
  return hasStep;
}

function performanceNowSeconds(): number {
  if (typeof performance !== 'undefined') return performance.now() / 1000;
  return Date.now() / 1000;
}
