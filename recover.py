import json
import os

conversations = [
    "fa0e2af8-741e-429f-9b79-5316affd6eb6",
    "03d20135-53de-4fb0-b37c-4c4bea7d786a",
    "beb433ed-6ad8-4584-bd7c-5c75a65c02d2",
    "f4e89613-fa11-4cc8-aae1-7260095c022a",
    "3c1c6b88-1bdd-46f1-8c7a-45bf33163bf4",
    "e39bb5dd-b359-4a4f-923a-8c5d023236ad",
    "5f0d94e5-b8ac-4b43-b7f5-c14494cfaed8"
]

app_data = "/Users/jirnyak/.gemini/antigravity-ide"
output_dir = "/Users/jirnyak/Mirror/gigahrush/recovered_edits"

os.makedirs(output_dir, exist_ok=True)

for cid in conversations:
    transcript_path = os.path.join(app_data, "brain", cid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(transcript_path):
        continue
    
    out_file = os.path.join(output_dir, f"{cid}.md")
    with open(out_file, "w") as out:
        out.write(f"# Conversation: {cid}\n\n")
        
        with open(transcript_path, "r") as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if "tool_calls" in data:
                        for tool in data["tool_calls"]:
                            name = tool.get("name")
                            if name in ["multi_replace_file_content", "replace_file_content", "write_to_file"]:
                                args = tool.get("args", {})
                                target = args.get("TargetFile", "")
                                out.write(f"## {name} on {target}\n")
                                if name == "write_to_file":
                                    out.write(f"```\n{args.get('CodeContent', '')}\n```\n")
                                elif name == "replace_file_content":
                                    out.write(f"### Target:\n```\n{args.get('TargetContent', '')}\n```\n")
                                    out.write(f"### Replacement:\n```\n{args.get('ReplacementContent', '')}\n```\n")
                                elif name == "multi_replace_file_content":
                                    for idx, chunk in enumerate(args.get("ReplacementChunks", [])):
                                        out.write(f"### Chunk {idx+1} Target:\n```\n{chunk.get('TargetContent', '')}\n```\n")
                                        out.write(f"### Chunk {idx+1} Replacement:\n```\n{chunk.get('ReplacementContent', '')}\n```\n")
                                out.write("\n")
                except Exception as e:
                    pass
