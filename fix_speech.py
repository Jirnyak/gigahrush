import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

fix_file('src/systems/npc_package_speech.ts', [
    ("function resolvePackageForPlotNpcId(id: string): NpcSpeechPackageView | undefined {\n  const cleanPlotId = cleanId(id);", "import { getPlotNpcStringId } from '../data/npc_packages';\nfunction resolvePackageForPlotNpcId(id: number): NpcSpeechPackageView | undefined {\n  const cleanPlotId = cleanId(getPlotNpcStringId(id) || '');"),
    ("export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {\n  const defId = cleanId(pack.id);\n  const plotNpcId = pack.plotNpcId;\n  registry.set(defId, pack);\n  if (plotNpcId) registryByPlotId.set(plotNpcId, defId);\n}", "export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {\n  const defId = cleanId(pack.id);\n  const plotNpcId = pack.content?.id;\n  registry.set(defId, pack);\n  if (plotNpcId) registryByPlotId.set(plotNpcId, defId);\n}"),
    ("pack.content.plotNpcId", "pack.content.id"),
    ("pack.content?.plotNpcId", "pack.content?.id"),
    ("const plotNpcId = pack.content?.id;", "const plotNpcId = pack.content?.id;"), # just for matching
    ("const direct = getNpcPackage(id);\n  if (direct && (!direct.content?.id || direct.content.id === id)) {\n    return packageFromNpcPackageDef(direct);\n  }\n  const byPlotId = getNpcPackageByPlotNpcId(id);", "const direct = getNpcPackage(id);\n  if (direct && (!direct.content?.id || direct.content.id === id)) {\n    return packageFromNpcPackageDef(direct);\n  }\n  const byPlotId = getNpcPackageByPlotNpcId(id);"),
])

fix_file('src/systems/quests.ts', [
    ("export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'number'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId!);", "export function resolveStoryTarget(state: GameState, target: StoryQuestSelector): Entity | undefined {\n  return typeof target === 'number'\n    ? findByPlotLive(state.entities, target)\n    : findByPlotLive(state.entities, target.targetNpcId as number);\n}"),
])
