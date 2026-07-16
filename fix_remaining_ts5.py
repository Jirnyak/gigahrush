import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

fix_file('src/systems/alife.ts', [
    ("interface AlifePopulationReservedNpc {\n  id?: string;", "interface AlifePopulationReservedNpc {\n  id?: number;"),
    ("export interface AlifeReservedIdentityDef {\n  id: string;", "export interface AlifeReservedIdentityDef {\n  id: string;"),
    ("export function isSocialGraphOutdated", "import { getPlotNpcNumericId } from '../data/npc_packages';\nexport function isSocialGraphOutdated"),
    ("Type 'number | undefined' is not assignable to type 'string | undefined'", ""),
    ("src/systems/alife.ts(2153,7): error TS2322: Type 'number' is not assignable to type 'string'.", ""),
    ("const targetId = typeof target === 'string' ? target : target.id;", "const targetId = typeof target === 'number' ? target : target.id;"),
    ("const npcIds: string[] = [];", "const npcIds: number[] = [];"),
    ("npcIds.push(String(record.plotNpcId));", "npcIds.push(record.plotNpcId!);"),
    ("const npcId = npcIds[irand(0, npcIds.length - 1)];", "const npcId = npcIds[irand(0, npcIds.length - 1)];"),
])

fix_file('src/systems/demos_social.ts', [
    ("const numericId = typeof plotNpcId === 'string' ? getPlotNpcNumericId(plotNpcId) : plotNpcId;", "const numericId = typeof plotNpcId === 'string' ? getPlotNpcNumericId(plotNpcId) : plotNpcId;"),
])

