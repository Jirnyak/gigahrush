import json

files_modified = set()

with open('/Users/jirnyak/.gemini/antigravity-ide/brain/f4e89613-fa11-4cc8-aae1-7260095c022a/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
        except:
            continue
        if "tool_calls" in data:
            for call in data["tool_calls"]:
                if call["name"] in ["multi_replace_file_content", "replace_file_content"]:
                    files_modified.add(call["args"].get("TargetFile", ""))
                elif call["name"] == "write_to_file":
                    files_modified.add(call["args"].get("TargetFile", ""))

for fname in sorted(files_modified):
    if "gigahrush" in fname:
        print(fname)
