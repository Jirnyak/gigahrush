import WebSocket from 'ws';

async function inspectDropzone() {
  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  const tabId = "0FF6F315E07B8D5491BA9A4089510CEF";
  ws.send(JSON.stringify({
    id: 1,
    method: "Target.attachToTarget",
    params: { targetId: tabId, flatten: false }
  }));

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id === 1 && data.result?.sessionId) {
      const sessionId = data.result.sessionId;

      const code = `
        (() => {
          const fileInputs = [...document.querySelectorAll('input[type="file"]')].map(i => ({
            name: i.name,
            id: i.id,
            className: i.className,
            accept: i.accept
          }));
          const screenshotSection = document.querySelector('.screenshots_widget, .screenshot_list, .file_upload_widget, [data-upload_type="screenshot"]');
          return {
            fileInputs,
            screenshotSectionHtml: screenshotSection ? screenshotSection.outerHTML.slice(0, 1000) : null
          };
        })()
      `;

      ws.send(JSON.stringify({
        id: 2,
        method: "Target.sendMessageToTarget",
        params: {
          sessionId,
          message: JSON.stringify({ id: 102, method: "Runtime.evaluate", params: { expression: code, returnByValue: true } })
        }
      }));

      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 3000);
    } else if (data.method === "Target.receivedMessageFromTarget") {
      const inner = JSON.parse(data.params.message);
      if (inner.id === 102) {
        console.log("DROPZONE DATA:", JSON.stringify(inner.result?.result?.value, null, 2));
      }
    }
  });
}

inspectDropzone().catch(console.error);
