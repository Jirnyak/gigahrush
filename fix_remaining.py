import subprocess
import re
import os

def run_tsc():
    result = subprocess.run(['npx', 'tsc', '--noEmit'], capture_output=True, text=True)
    return result.stdout

def fix_errors():
    for _ in range(5):
        out = run_tsc()
        errors = out.split('\n')
        fixes_made = 0
        for error in errors:
            if not error.strip(): continue
            match = re.match(r'^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$', error)
            if match:
                file, line, col, code, msg = match.groups()
                line = int(line) - 1
                
                if not os.path.exists(file):
                    continue
                
                with open(file, 'r') as f:
                    lines = f.readlines()
                
                orig_line = lines[line]
                
                if "Cannot find name 'getPlotNpcNumericId'" in msg:
                    # just import it
                    if 'import { getPlotNpcNumericId } from' not in "".join(lines):
                        new_content = "import { getPlotNpcNumericId } from '../../data/npc_packages';\n" + "".join(lines)
                        with open(file, 'w') as f: f.write(new_content)
                        fixes_made += 1
                        
                elif "Type 'number' is not assignable to type 'string'" in msg:
                    # look for id: getPlotNpcNumericId('...')!
                    new_line = re.sub(r"id:\s*getPlotNpcNumericId\((['\"][A-Za-z0-9_]+['\"])\)!", r"id: String(getPlotNpcNumericId(\1)!)", orig_line)
                    if new_line != orig_line:
                        lines[line] = new_line
                        with open(file, 'w') as f: f.writelines(lines)
                        fixes_made += 1
                        
                elif "Argument of type 'number' is not assignable to parameter of type 'string'" in msg:
                    new_line = re.sub(r'(getPlotNpcNumericId\([^\)]+\)!)', r'String(\1)', orig_line)
                    if new_line != orig_line:
                        lines[line] = new_line
                        with open(file, 'w') as f: f.writelines(lines)
                        fixes_made += 1
                        
                elif "This comparison appears to be unintentional" in msg:
                    new_line = re.sub(r"=== (['\"][A-Za-z0-9_]+['\"])", r"=== getPlotNpcNumericId(\1)!", orig_line)
                    if new_line == orig_line:
                        new_line = re.sub(r"!== (['\"][A-Za-z0-9_]+['\"])", r"!== getPlotNpcNumericId(\1)!", orig_line)
                    if new_line == orig_line:
                        new_line = re.sub(r"(['\"][A-Za-z0-9_]+['\"]) ===", r"getPlotNpcNumericId(\1)! ===", orig_line)
                    if new_line != orig_line:
                        lines[line] = new_line
                        with open(file, 'w') as f: f.writelines(lines)
                        fixes_made += 1
                        
        print(f"Made {fixes_made} fixes.")
        if fixes_made == 0:
            break

fix_errors()
