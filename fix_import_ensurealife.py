import sys

file_path = 'tests/demos-social.test.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'ensureAlifeState' not in content:
    content = content.replace("import { makeGameState, stateWithPopulation } from './helpers';", 
                              "import { makeGameState, stateWithPopulation } from './helpers';\nimport { ensureAlifeState } from '../src/systems/alife';")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
