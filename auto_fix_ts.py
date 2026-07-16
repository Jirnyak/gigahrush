import subprocess
import re

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
                
                with open(file, 'r') as f:
                    lines = f.readlines()
                
                orig_line = lines[line]
                
                if "Type 'string' is not assignable to type 'number'" in msg or "Type 'number | undefined' is not assignable to type 'number'" in msg or "Type 'number | undefined' is not assignable to type 'string'" in msg or "Argument of type 'string' is not assignable to parameter of type 'number'" in msg or "Argument of type 'number' is not assignable to parameter of type 'string'" in msg or "This comparison appears to be unintentional" in msg:
                    # Look for NPC_IDS.something
                    new_line = re.sub(r'(NPC_IDS\.[a-zA-Z0-9_]+)', r'getPlotNpcNumericId(\1)!', orig_line)
                    if new_line == orig_line:
                        # Look for targetNpcId
                        new_line = re.sub(r'targetNpcId:\s*([a-zA-Z0-9_\.]+)', r'targetNpcId: getPlotNpcNumericId(\1)!', orig_line)
                    if new_line == orig_line:
                        # Look for giverId
                        new_line = re.sub(r'giverId:\s*([a-zA-Z0-9_\.]+)', r'giverId: getPlotNpcNumericId(\1)!', orig_line)
                    if new_line == orig_line:
                         # Look for un-wrapped string literals in the entire line and wrap them
                        new_line = re.sub(r"(['\"][a-z0-9_]+['\"])", r"getPlotNpcNumericId(\1)!", orig_line)

                    # fix redundant wrappers: getPlotNpcNumericId(getPlotNpcNumericId(X)!)!
                    new_line = re.sub(r'getPlotNpcNumericId\(getPlotNpcNumericId\(([^)]+)\)!\)!', r'getPlotNpcNumericId(\1)!', new_line)

                    if new_line != orig_line:
                        lines[line] = new_line
                        
                        # ensure import
                        import_str = "import { getPlotNpcNumericId } from '../data/npc_packages';\n"
                        if 'src/data/' in file: import_str = "import { getPlotNpcNumericId } from './npc_packages';\n"
                        if 'src/gen/' in file: 
                            depth = len(file.split('/')) - 2
                            prefix = '../' * depth
                            if 'src/data/' in file: prefix = './'
                            import_str = f"import {{ getPlotNpcNumericId }} from '{prefix}data/npc_packages';\n"
                        
                        if 'getPlotNpcNumericId' not in open(file).read():
                            lines.insert(0, import_str)
                            
                        with open(file, 'w') as f: f.writelines(lines)
                        fixes_made += 1

        print(f"Made {fixes_made} fixes.")
        if fixes_made == 0:
            break

fix_errors()
