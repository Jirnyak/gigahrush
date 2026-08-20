import WebSocket from 'ws';

async function main() {
  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  
  const ws = new WebSocket(editTab.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  const code = `
    (() => {
      // Find what event handlers are on .add_screenshot_btn
      const btn = document.querySelector(".add_screenshot_btn");
      const dropzone = document.querySelector(".screenshot_list");
      return {
        btnText: btn ? btn.innerText : null,
        btnHtml: btn ? btn.outerHTML : null,
        fileInputs: [...document.querySelectorAll('input[type="file"]')].map(i => i.outerHTML)
      };
    })()
  `;

  ws.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression: code, returnByValue: true }
  }));

  ws.on("message", (d) => {
    const data = JSON.parse(d.toString());
    console.log("SCREENSHOT UPLOADER INFO:", JSON.stringify(data.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  });
}
main().catch(console.error);
