import WebSocket from 'ws';

async function test() {
  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  console.log("Browser WS:", version.webSocketDebuggerUrl);

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  console.log("Connected to browser WS!");

  let msgId = 1;
  const pending = new Map();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  });

  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  }

  // Get targets
  const targets = await send("Target.getTargets");
  const itchTarget = targets.targetInfos.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  console.log("Found itch target:", itchTarget?.title, itchTarget?.targetId);

  if (!itchTarget) {
    console.error("No itch target found");
    ws.close();
    return;
  }

  // Attach
  const attachRes = await send("Target.attachToTarget", {
    targetId: itchTarget.targetId,
    flatten: true
  });
  const sessionId = attachRes.sessionId;
  console.log("Attached with sessionId:", sessionId);

  // Evaluate
  const evalRes = await send("Runtime.evaluate", {
    expression: "document.title",
    returnByValue: true
  }, sessionId);

  console.log("Title evaluation:", evalRes.result?.value);
  ws.close();
}

test().catch(console.error);
