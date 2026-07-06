import re
import os

def apply_md(md_path):
    with open(md_path, 'r') as f:
        content = f.read()
    
    sections = re.split(r'## (multi_replace_file_content|replace_file_content) on (.*)', content)
    
    for i in range(1, len(sections), 3):
        cmd = sections[i]
        filepath = sections[i+1].strip()
        body = sections[i+2]
        
        if not os.path.exists(filepath):
            print(f"File missing: {filepath}")
            continue
            
        with open(filepath, 'r') as f:
            file_data = f.read()
            
        chunks = re.findall(r'### (?:Chunk \d+ )?Target:\n```(?:typescript)?\n(.*?)\n```\n### (?:Chunk \d+ )?Replacement:\n```(?:typescript)?\n(.*?)\n```', body, flags=re.DOTALL)
        
        changed = False
        for target, replacement in chunks:
            if target in file_data:
                file_data = file_data.replace(target, replacement)
                changed = True
            elif target.strip('\n') in file_data:
                file_data = file_data.replace(target.strip('\n'), replacement.strip('\n'))
                changed = True
            else:
                print(f"Target not found in {filepath} for chunk starting with: {target[:60]}")
                
        if changed:
            with open(filepath, 'w') as f:
                f.write(file_data)
            print(f"Applied to {filepath}")

files = [
    "5f0d94e5-b8ac-4b43-b7f5-c14494cfaed8.md",
    "e39bb5dd-b359-4a4f-923a-8c5d023236ad.md"
]

for f in files:
    print(f"--- Applying {f}")
    apply_md(os.path.join("/Users/jirnyak/Mirror/gigahrush/recovered_edits", f))
