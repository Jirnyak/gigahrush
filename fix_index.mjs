import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/systems/entity_index.ts', 'utf8');

const cappedReplace = `    const capped = Number.isFinite(maxResults);
    const cap = capped ? Math.max(0, Math.floor(maxResults)) : Infinity;
    if (cap <= 0) return 0;
    const distances: number[] = [];
    const ids: number[] = [];
    const addCandidate = (e: Entity, d2: number): void => {
      if (!capped) {
        out.push(e);
        return;
      }
      if (out.length >= cap) {
        const lastIdx = out.length - 1;
        if (d2 > distances[lastIdx] || (d2 === distances[lastIdx] && e.id >= ids[lastIdx])) return;
      }
      out.push(e);
      distances.push(d2);
      ids.push(e.id);
      let pos = out.length - 1;
      while (pos > 0) {
        const pd2 = distances[pos - 1];
        if (pd2 < d2 || (pd2 === d2 && ids[pos - 1] <= e.id)) break;
        const swapE = out[pos - 1];
        const swapId = ids[pos - 1];
        const swapD2 = distances[pos - 1];
        out[pos - 1] = out[pos];
        ids[pos - 1] = ids[pos];
        distances[pos - 1] = distances[pos];
        out[pos] = swapE;
        ids[pos] = swapId;
        distances[pos] = swapD2;
        pos--;
      }
      if (out.length > cap) {
        out.length = cap;
        distances.length = cap;
        ids.length = cap;
      }
    };`;

content = content.replace(/    const capped = Number\.isFinite\(maxResults\);[\s\S]*?    const bx = wrappedBucketCoord\(x\);/m, cappedReplace + '\n    const bx = wrappedBucketCoord(x);');

content = content.replace(/    if \(capped && out\.length > 1\) {[\s\S]*?    if \(capped && out\.length > cap\) {[\s\S]*?    }/m, '');

writeFileSync('src/systems/entity_index.ts', content);
