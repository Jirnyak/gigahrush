import os
import glob
import re

files = glob.glob('tests/**/*.test.ts', recursive=True)
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    orig = content
    
    # 1. Replace getNpcPackageByPlotNpcId('...') with getNpcPackageByPlotNpcId(getPlotNpcNumericId('...')!)
    content = re.sub(r"getNpcPackageByPlotNpcId\((['`][^'`]+['`])\)", r"getNpcPackageByPlotNpcId(getPlotNpcNumericId(\1)!)", content)
    
    # 2. Add import for getPlotNpcNumericId if needed
    if "getPlotNpcNumericId" in content and "getPlotNpcNumericId" not in orig:
        content = re.sub(r"(import\s*\{[^\}]*)(getNpcPackageByPlotNpcId)", r"\1getPlotNpcNumericId, \2", content)
        
    # Fix plotNpcName as well, which is defined locally in some tests: function plotNpcName(plotNpcId: string)
    # We should let the test pass string to plotNpcName, but inside plotNpcName, call getPlotNpcNumericId
    content = re.sub(r"function plotNpcName\(plotNpcId: string\): string \{\n\s*const pack = getNpcPackageByPlotNpcId\(plotNpcId\);", 
                     r"function plotNpcName(plotNpcId: string): string {\n  const pack = getNpcPackageByPlotNpcId(getPlotNpcNumericId(plotNpcId)!);", content)

    if content != orig:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Fixed", file)

