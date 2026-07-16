import os
import glob
import re

files = glob.glob('tests/**/*.test.ts', recursive=True)
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    orig = content
    
    # Replace nextId = { v: \d+ }
    content = re.sub(r"(const\s+nextId\s*=\s*\{\s*v:\s*)(\d+)(\s*\});", r"\1getPlotNpcCount() + \2\3", content)
    
    # Add getPlotNpcCount if changed
    if content != orig and "getPlotNpcCount" not in content:
        # Add it to the npc_packages import
        content = re.sub(r"(import\s*\{[^\}]*)(getNpcPackageByPlotNpcId)", r"\1getPlotNpcCount, \2", content)
        if "getPlotNpcCount" not in content:
            # If not found, add a new import
            content = "import { getPlotNpcCount } from '../src/data/npc_packages';\n" + content

    if content != orig:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Fixed nextId in", file)

