import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

fix_file('src/systems/npc_package_speech.ts', [
    ("import { cleanId } from '../core/types';", "import { cleanId } from '../core/types';\nimport { getPlotNpcStringId } from '../data/npc_packages';"),
    ("export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {\n  const defId = cleanId(pack.id);\n  const plotNpcId = pack.plotNpcId;\n  registry.set(defId, { ...pack, plotNpcId });\n  const contentId = cleanId(pack.content?.plotNpcId);\n  if (plotNpcId) registryByPlotId.set(plotNpcId, defId);\n}", "export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {\n  const defId = cleanId(pack.id);\n  const plotNpcId = pack.plotNpcId;\n  registry.set(defId, pack);\n  if (plotNpcId) registryByPlotId.set(plotNpcId, defId);\n}"),
    ("pack.content.plotNpcId", "pack.content.id"),
    ("pack.content?.plotNpcId", "pack.content?.id"),
    ("registryByPlotId.get(plotNpcId)", "registryByPlotId.get(getPlotNpcStringId(plotNpcId) || '')"),
    ("registryByPlotId.has(plotNpcId)", "registryByPlotId.has(getPlotNpcStringId(plotNpcId) || '')"),
])

fix_file('src/systems/alife.ts', [
    ("Type 'number' is not assignable to type 'string'", ""),
    ("Type 'number | undefined' is not assignable to type 'string | undefined'", ""),
    ("const targetId = typeof target === 'number' ? target : target.id;", "const targetId = typeof target === 'number' ? target : target.id;\n  const targetNumericId = typeof targetId === 'string' ? getPlotNpcNumericId(targetId) : targetId;"),
    ("typeof target === 'string' ? target : target.id", "typeof target === 'number' ? target : (typeof target === 'string' ? getPlotNpcNumericId(target) : target.id)"),
])

fix_file('src/systems/demos.ts', [
    ("export function getDemosSocialGraph", "import { getPlotNpcStringId } from '../data/npc_packages';\nexport function getDemosSocialGraph"),
    ("getNpcPackageByPlotNpcId(snapshot.plotNpcId)", "getNpcPackageByPlotNpcId(getPlotNpcStringId(snapshot.plotNpcId)!)"),
])

fix_file('src/systems/demos_social.ts', [
    ("import { getPlotNpcNumericId } from '../data/npc_packages';", "import { getPlotNpcNumericId, getPlotNpcStringId } from '../data/npc_packages';"),
    ("getPlotNpcNumericId(plotNpcId)", "getPlotNpcNumericId(String(plotNpcId))"),
    ("plotIdMapFromSnapshots(\n  snapshots: readonly (AlifeNpcSnapshot | undefined)[],\n  total: number,\n): Map<number, number> {\n  const out = new Map<number, number>();\n  for (let id = 1; id <= total; id++) {\n    const plotNpcId = snapshots[id]?.plotNpcId;\n    if (plotNpcId && !out.has(plotNpcId)) out.set(plotNpcId, id);\n  }\n  return out;\n}", "plotIdMapFromSnapshots(\n  snapshots: readonly (AlifeNpcSnapshot | undefined)[],\n  total: number,\n): Map<number, number> {\n  const out = new Map<number, number>();\n  for (let id = 1; id <= total; id++) {\n    const plotNpcId = snapshots[id]?.plotNpcId;\n    if (plotNpcId && !out.has(plotNpcId)) out.set(plotNpcId, id);\n  }\n  return out;\n}"),
    ("postDemosSocialNews(\n  state: GameState,\n  senderPlotNpcId: number,\n  news: DemosNewsEvent\n)", "postDemosSocialNews(\n  state: GameState,\n  senderPlotNpcId: number,\n  news: DemosNewsEvent\n)"),
])

fix_file('src/systems/npc_special_routines.ts', [
    ("function updateQuestMarkerForPlotNpc(\n  state: GameState,\n  plotNpcId: number,\n): void {\n  const entity = state.entities.find(e => e.id === plotNpcId);", "import { getPlotNpcStringId } from '../data/npc_packages';\nfunction updateQuestMarkerForPlotNpc(\n  state: GameState,\n  plotNpcId: number,\n): void {\n  const entity = state.entities.find(e => e.id === plotNpcId);"),
])

fix_file('src/systems/plot_outcomes.ts', [
    ("getPlotNpcStringId(npcId)!", "npcId"),
])

fix_file('src/systems/maronary_shaving.ts', [
    ("getPlotNpcStringId(BARBER_NPC_ID)!", "BARBER_NPC_ID"),
])

fix_file('src/systems/quests.ts', [
    ("export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'number'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId!);", "export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'number'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId!);"),
])
