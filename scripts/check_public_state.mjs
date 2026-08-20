import WebSocket from 'ws';

async function checkPublic() {
  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const itch = tabs.find(t => t.url && t.url.includes("itch.io"));

  // Navigate to public page
  ws.send(JSON.stringify({
    id: 1,
    method: "Target.attachToTarget",
    params: { targetId: itch.id, flatten: false }
  }));

  ws.on("message", async (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id === 1 && data.result?.sessionId) {
      const sessionId = data.result.sessionId;
      
      // Navigate to public page
      ws.send(JSON.stringify({
        id: 2,
        method: "Target.sendMessageToTarget",
        params: {
          sessionId,
          message: JSON.stringify({ id: 101, method: "Page.navigate", params: { url: "https://tenevik.itch.io/gigahrush" } })
        }
      }));

      setTimeout(async () => {
        // Evaluate
        ws.send(JSON.stringify({
          id: 3,
          method: "Target.sendMessageToTarget",
          params: {
            sessionId,
            message: JSON.stringify({
              id: 102,
              method: "Runtime.evaluate",
              params: {
                expression: `
                  (() => {
                    const desc = document.querySelector(".formatted_description, .user_formatted")?.innerHTML || "";
                    const rateBtn = document.querySelector('a[href*="rate"]')?.href;
                    const screens = [...document.querySelectorAll(".screenshot_list img, .screenshot img, .carousel_item img, .right_col img")].map(i => i.src);
                    return {
                      title: document.title,
                      rateBtn: rateBtn,
                      descSnippet: desc.slice(0, 300),
                      screenshotsCount: screens.length,
                      screens: screens
                    };
                  })()
                `,
                returnByValue: true
              }
            })
          }
        }));
      }, 4000);

      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 7000);
    } else if (data.method === "Target.receivedMessageFromTarget") {
      const inner = JSON.parse(data.params.message);
      if (inner.id === 102) {
        console.log("PUBLIC PAGE LIVE STATE:", JSON.stringify(inner.result?.result?.value, null, 2));
      }
    }
  });
}

checkPublic().catch(console.error);
