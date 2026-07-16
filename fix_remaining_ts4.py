import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

fix_file('src/systems/alife.ts', [
    ("// import { getPlotNpcNumericId } from '../data/npc_packages';", "import { getPlotNpcNumericId } from '../data/npc_packages';"),
    ("import { getPlotNpcStringId } from '../data/npc_packages';", "")
])

