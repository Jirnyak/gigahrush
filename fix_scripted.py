import re
with open('tests/scripted-arrivals-migration.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r"(const\s+nextId\s*=\s*\{\s*v:\s*)(\d+)(\s*\});", r"\1getPlotNpcCount() + \2\3", content)
if "getPlotNpcCount" not in content:
    content = "import { getPlotNpcCount } from '../src/data/npc_packages';\n" + content

with open('tests/scripted-arrivals-migration.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)

