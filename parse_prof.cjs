const fs = require('fs');
const prof = JSON.parse(fs.readFileSync('CPU.20260627.175851.4220.0.001.cpuprofile', 'utf8'));

const times = new Map();
let lastTime = prof.startTime;

for (let i = 0; i < prof.samples.length; i++) {
  const nodeId = prof.samples[i];
  const dt = prof.timeDeltas[i];
  times.set(nodeId, (times.get(nodeId) || 0) + dt);
}

const nodeInfo = new Map();
for (const node of prof.nodes) {
  nodeInfo.set(node.id, node);
}

const sorted = [...times.entries()].sort((a, b) => b[1] - a[1]);
for (let i = 0; i < Math.min(10, sorted.length); i++) {
  const node = nodeInfo.get(sorted[i][0]);
  console.log(`${sorted[i][1]} us: ${node.callFrame.functionName} (${node.callFrame.url}:${node.callFrame.lineNumber})`);
}
