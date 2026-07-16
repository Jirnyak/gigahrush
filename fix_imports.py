import sys

file_path = 'tests/demos-social.test.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'makeGameState' not in content:
    content = content.replace("import { createEmptyDemosSocialSaveState } from '../src/systems/demos_save';", 
                              "import { createEmptyDemosSocialSaveState } from '../src/systems/demos_save';\nimport { makeGameState } from './helpers';")
    
if 'ensureAlifeState' not in content:
    content = content.replace("createPrefilledAlifeState,", 
                              "createPrefilledAlifeState,\n  ensureAlifeState,")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
