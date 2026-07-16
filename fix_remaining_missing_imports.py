import sys
files = [
  'tests/plot-outcomes.test.ts',
  'tests/quest-kill-pressure.test.ts'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    if "import { getPlotNpcCount }" not in content and "getPlotNpcCount" in content:
        content = "import { getPlotNpcCount } from '../src/data/npc_packages';\n" + content
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Fixed", file)

