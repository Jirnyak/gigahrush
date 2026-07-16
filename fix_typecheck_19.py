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

# Wrap string values for giverId, targetNpcId, failOnNpcDeathId
fields_to_wrap = ['giverId', 'targetNpcId', 'failOnNpcDeathId']
for field in fields_to_wrap:
    # matches: field: 'string' or field: "string"
    pattern = r"\b" + field + r"\s*:\s*(['\"][^'\"]+['\"])"
    repl = field + r": getPlotNpcNumericId(\1)"
    replace_in_files(pattern, repl, 'src/**/*.ts')

