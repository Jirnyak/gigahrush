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

# Wrap getPlotNpcNumericId with !
replace_in_files(r'getPlotNpcNumericId\(([^)]+)\)(?!!)', r'getPlotNpcNumericId(\1)!', 'src/**/*.ts')

