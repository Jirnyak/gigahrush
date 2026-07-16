import re
import os

def replace_in_file(file, old, new):
    if not os.path.exists(file): return
    with open(file, 'r') as f: content = f.read()
    new_content = content.replace(old, new)
    if new_content != content:
        with open(file, 'w') as f: f.write(new_content)

replace_in_file('src/core/types.ts', "failOnNpcDeathId?: string;", "failOnNpcDeathId?: number;")
replace_in_file('src/main.ts', "from 'data/npc_packages'", "from './data/npc_packages'")

with open('src/data/craft_recipe_sources.ts', 'r') as f:
    lines = f.readlines()
if "import { getPlotNpcNumericId } from './npc_packages';\n" not in lines:
    lines.insert(0, "import { getPlotNpcNumericId } from './npc_packages';\n")
with open('src/data/craft_recipe_sources.ts', 'w') as f:
    f.writelines(lines)

# Fix ai/npc_fsm.ts "plotNpcId is missing in type Entity"
# The interface is `Pick<Entity, "id" | "alifeId" | "persistentNpcId" | "plotNpcId">`
# Wait, Entity doesn't have plotNpcId anymore. Let's fix npc_utility.ts
with open('src/systems/ai/npc_utility.ts', 'r') as f:
    content = f.read()
content = content.replace('"id" | "alifeId" | "persistentNpcId" | "plotNpcId"', '"id" | "alifeId" | "persistentNpcId"')
with open('src/systems/ai/npc_utility.ts', 'w') as f:
    f.write(content)

with open('src/systems/ai/npc_fsm.ts', 'r') as f:
    content = f.read()
content = content.replace('"id" | "alifeId" | "persistentNpcId" | "plotNpcId"', '"id" | "alifeId" | "persistentNpcId"')
with open('src/systems/ai/npc_fsm.ts', 'w') as f:
    f.write(content)

