import re

with open("src/data/monster_ecology.ts", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "floors:" in line or "DEEP:" in line or "ALL_BUT_VOID:" in line:
        line = re.sub(r'\b200\b', '-50', line)
        line = re.sub(r'\b180\b', '-36', line)
        line = re.sub(r'\b140\b', '-26', line)
        line = re.sub(r'\b100\b', '0', line)
        line = re.sub(r'\b60\b', '14', line)
    new_lines.append(line)

with open("src/data/monster_ecology.ts", "w") as f:
    f.writelines(new_lines)
