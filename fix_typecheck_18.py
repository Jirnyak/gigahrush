import re
import glob

def replace_in_files(pattern, repl, glob_pattern):
    for f in glob.glob(glob_pattern, recursive=True):
        with open(f, 'r') as file:
            content = file.read()
        new_content = re.sub(pattern, repl, content)
        if new_content != content:
            with open(f, 'w') as file:
                file.write(new_content)
            print(f"Fixed {f}")

replace_in_files(r'PNEUMOMAIL_SORTER_ROOM_DEF_ID', 'PNEUMOMAIL_SORTER_ROOM_NAME', 'src/data/contracts.ts')
replace_in_files(r"Type '\"faction\" \| \"occupation\" \| \"plotNpcId\"'", "Type '\"faction\" | \"occupation\" | \"id\"'", 'src/data/craft_recipe_sources.ts')
# Remove duplicate identifier 'targetNpcId' from src/data/plot.ts
# Also we should change 'plotNpcId' to 'id' in TS errors if they are in object literal type.
