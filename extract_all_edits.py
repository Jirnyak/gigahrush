import json

with open('/Users/jirnyak/.gemini/antigravity-ide/brain/f4e89613-fa11-4cc8-aae1-7260095c022a/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
        except:
            continue
        if "tool_calls" in data:
            for call in data["tool_calls"]:
                if call["name"] in ["multi_replace_file_content", "replace_file_content"]:
                    target = call["args"].get("TargetFile", "")
                    if "gigahrush" in target:
                        print(f"--- FILE: {target} ---")
                        print(json.dumps(call["args"], indent=2, ensure_ascii=False))
