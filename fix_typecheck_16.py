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

replace_in_files(r'\bgiverNpcId\s*:', 'giverId:', 'src/**/*.ts')
replace_in_files(r'\btargetPlotNpcId\s*:', 'targetNpcId:', 'src/**/*.ts')
replace_in_files(r"Type '\"faction\" \| \"occupation\" \| \"plotNpcId\"'", "Type '\"faction\" | \"occupation\" | \"id\"'", 'src/**/*.ts')

