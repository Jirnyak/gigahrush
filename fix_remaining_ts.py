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
    ("import { getPlotNpcNumericId, getPlotNpcStringId }", "import { getPlotNpcNumericId }"),
    ("export function clearDynamicPlotEntities(entities: Entity[]): void {\n  for (let i = entities.length - 1; i >= 0; i--) {\n    if (entities[i].plotNpcId) entities.splice(i, 1);\n  }\n}", "export function clearDynamicPlotEntities(entities: Entity[]): void {\n  for (let i = entities.length - 1; i >= 0; i--) {\n    if (entities[i].npcPackageId) entities.splice(i, 1);\n  }\n}"),
    ("if (entities[i].plotNpcId) entities.splice(i, 1);", "if (entities[i].npcPackageId) entities.splice(i, 1);")
])

# alife.ts
fix_file('src/systems/alife.ts', [
    ("import { getPlotNpcNumericId, getPlotNpcStringId } from '../data/npc_packages';", "import { getPlotNpcStringId } from '../data/npc_packages';"),
    ("record.plotNpcId === id", "record.plotNpcId === getPlotNpcNumericId(id)!"),
    ("const cleanPlotNpcId = String(id).slice(0, 96);", ""),
    ("const recordIndex = alife.npcs.findIndex(record =>\n    record.plotNpcId === id &&", "const recordIndex = alife.npcs.findIndex(record =>\n    record.plotNpcId === getPlotNpcNumericId(String(id))! &&"),
    ("record.plotNpcId === getPlotNpcNumericId(id)!", "record.plotNpcId === getPlotNpcNumericId(String(id))!")
])

# demos.ts
fix_file('src/systems/demos.ts', [
    ("import { getNpcPackageByPlotNpcId, getNpcPackage, NpcPackageDef, packageIdFromReservedIdentityId }", "import { getNpcPackage, NpcPackageDef, packageIdFromReservedIdentityId }"),
])

# demos_social.ts
fix_file('src/systems/demos_social.ts', [
    ("import { getPlotNpcNumericId } from '../data/npc_packages';\nexport function isSocialGraphOutdated", "export function isSocialGraphOutdated"),
    ("const numericId = getPlotNpcNumericId(plotNpcId);", "const numericId = getPlotNpcNumericId(String(plotNpcId));"),
    ("if (snapshot?.plotNpcId === numericId)", "if (snapshot?.plotNpcId === numericId)"),
    ("getPlotNpcNumericId(String(id))!", "getPlotNpcNumericId(String(id))!")
])

# npc_special_routines.ts
fix_file('src/systems/npc_special_routines.ts', [
    ("function updateQuestMarkerForPlotNpc(\n  state: GameState,\n  id: string,\n): void {\n  const entity = state.entities.find(e => e.plotNpcId === plotNpcId);", "function updateQuestMarkerForPlotNpc(\n  state: GameState,\n  plotNpcId: number,\n): void {\n  const entity = state.entities.find(e => e.id === plotNpcId);"),
    ("const entity = state.entities.find(e => e.plotNpcId === plotNpcId);", "const entity = state.entities.find(e => e.id === plotNpcId);")
])

# plot_outcomes.ts
fix_file('src/systems/plot_outcomes.ts', [
    ("if (npcId) addNpcMarker(ctx.state, { id: npcId,", "if (npcId) addNpcMarker(ctx.state, { id: getPlotNpcStringId(npcId)!,")
])

# maronary_shaving.ts
fix_file('src/systems/maronary_shaving.ts', [
    ("createNpcMarker(state, { id: BARBER_NPC_ID,", "createNpcMarker(state, { id: getPlotNpcStringId(BARBER_NPC_ID)!,")
])

