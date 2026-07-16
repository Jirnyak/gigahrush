import re
import os

def fix_errors():
    with open('ts_errors.log', 'r') as f:
        errors = f.readlines()
        
    for error in errors:
        match = re.match(r'^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$', error)
        if match:
            file, line, col, code, msg = match.groups()
            line = int(line) - 1
            
            if not os.path.exists(file):
                continue
            
            with open(file, 'r') as f:
                lines = f.readlines()
            
            orig_line = lines[line]
            
            if "Type 'string' is not assignable to type 'number'" in msg and 'failOnNpcDeathId' in orig_line:
                new_line = re.sub(r"failOnNpcDeathId:\s*(['\"][A-Za-z0-9_]+['\"]|[A-Za-z0-9_]+\.[A-Za-z0-9_]+|[A-Za-z0-9_]+),", r"failOnNpcDeathId: getPlotNpcNumericId(\1)!,", orig_line)
                if new_line != orig_line:
                    lines[line] = new_line
                    # Make sure getPlotNpcNumericId is imported
                    if 'getPlotNpcNumericId' not in "".join(lines):
                        lines.insert(0, "import { getPlotNpcNumericId } from '../../data/npc_packages';\n")
                    with open(file, 'w') as f: f.writelines(lines)
            
            elif "This comparison appears to be unintentional" in msg:
                # e.g., e.persistentNpcId === plotNpcId -> e.id === getPlotNpcNumericId(plotNpcId)!
                new_line = re.sub(r"=== (['\"][A-Za-z0-9_]+['\"]|[A-Za-z0-9_]+)", r"=== getPlotNpcNumericId(\1)!", orig_line)
                if new_line == orig_line:
                    new_line = re.sub(r"!== (['\"][A-Za-z0-9_]+['\"]|[A-Za-z0-9_]+)", r"!== getPlotNpcNumericId(\1)!", orig_line)
                if new_line != orig_line:
                    lines[line] = new_line
                    if 'getPlotNpcNumericId' not in "".join(lines):
                        lines.insert(0, "import { getPlotNpcNumericId } from '../../data/npc_packages';\n")
                    with open(file, 'w') as f: f.writelines(lines)
                    
            elif "METRO_DEPOT_ROOM_NAME" in msg:
                lines[line] = lines[line].replace("METRO_DEPOT_ROOM_NAME", "METRO_DEPOT_ROOM_DEF_ID")
                with open(file, 'w') as f: f.writelines(lines)
            elif "METRO_ERROR_ROOM_NAME" in msg:
                lines[line] = lines[line].replace("METRO_ERROR_ROOM_NAME", "METRO_ERROR_ROOM_DEF_ID")
                with open(file, 'w') as f: f.writelines(lines)
            elif "METRO_STATION_ROOM_NAME" in msg:
                lines[line] = lines[line].replace("METRO_STATION_ROOM_NAME", "METRO_STATION_ROOM_DEF_ID")
                with open(file, 'w') as f: f.writelines(lines)
            elif "craft_recipe_sources.ts" in file and "overlap" in msg:
                lines[line] = lines[line].replace("=== targetId", "=== getPlotNpcNumericId(targetId)!")
                if 'getPlotNpcNumericId' not in "".join(lines):
                    lines.insert(0, "import { getPlotNpcNumericId } from './npc_packages';\n")
                with open(file, 'w') as f: f.writelines(lines)


fix_errors()
