import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

# plot_npc_spawn.ts
fix_file('src/gen/plot_npc_spawn.ts', [
    ("entities.some(e => e.plotNpcId === pack.content?.plotNpcId && e.alive)", "entities.some(e => e.id === getPlotNpcNumericId(pack.content?.plotNpcId!) && e.alive)")
])

# npc_package_speech.ts
fix_file('src/systems/npc_package_speech.ts', [
    ("pack.content?.id", "pack.content?.plotNpcId"),
    ("pack.content.id", "pack.content.plotNpcId")
])

# demos_social.ts
fix_file('src/systems/demos_social.ts', [
    ("function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: number,\n): number | undefined {\n  const numericId = plotNpcId;", "function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: number,\n): number | undefined {\n  const numericId = typeof plotNpcId === 'string' ? getPlotNpcNumericId(plotNpcId) : plotNpcId;"),
    ("function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: number,", "function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: number | string,"),
    ("export function createDemosNews(\n  state: GameState,\n  senderPlotNpcId: string,", "export function createDemosNews(\n  state: GameState,\n  senderPlotNpcId: number,"),
    ("export function postDemosSocialNews(\n  state: GameState,\n  senderPlotNpcId: string,", "export function postDemosSocialNews(\n  state: GameState,\n  senderPlotNpcId: number,")
])

# quests.ts
fix_file('src/systems/quests.ts', [
    ("function failQuestOnTargetNpcDeath(questId: number, targetNpcId: string): QuestEvent {", "function failQuestOnTargetNpcDeath(questId: number, targetNpcId: number): QuestEvent {"),
    ("export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'string'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId);", "export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'number'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId!);"),
    ("targetNpcId: string,", "targetNpcId: number,"),
    ("function activateQuestStep(state: GameState, questId: number, stepIndex: number) {", "import { getPlotNpcNumericId } from '../data/npc_packages';\nfunction activateQuestStep(state: GameState, questId: number, stepIndex: number) {")
])

