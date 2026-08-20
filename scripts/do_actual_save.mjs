import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

async function main() {
  console.log("=== DO ACTUAL SAVE VIA FORM.SUBMIT ===");

  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const itch = tabs.find(t => t.url && t.url.includes("itch.io"));

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  ws.send(JSON.stringify({
    id: 1,
    method: "Target.attachToTarget",
    params: { targetId: itch.id, flatten: false }
  }));

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id === 1 && data.result?.sessionId) {
      const sessionId = data.result.sessionId;
      console.log("Session attached:", sessionId);

      // 1. Navigate to edit page
      ws.send(JSON.stringify({
        id: 2,
        method: "Target.sendMessageToTarget",
        params: {
          sessionId,
          message: JSON.stringify({ id: 101, method: "Page.navigate", params: { url: "https://itch.io/game/edit/4587160" } })
        }
      }));

      // 2. Wait 4s for edit form to load, then update description and submit form
      setTimeout(() => {
        console.log("Submitting updated form with direct rate URL...");
        const code = `
          (() => {
            const html = ${JSON.stringify(updatedHtml)};
            const ta = document.querySelector('textarea[name="game[description]"]');
            if (ta) {
              ta.value = html;
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const redactor = document.querySelector('.redactor-in, .redactor-editor');
            if (redactor) {
              redactor.innerHTML = html;
              redactor.dispatchEvent(new Event('input', { bubbles: true }));
              redactor.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const form = document.querySelector('form.edit_game_form, form[action*="edit"]');
            if (form) {
              console.log("Found form, calling submit()...");
              form.submit();
              return { submitted: true };
            }
            const saveBtn = document.querySelector('button.save_btn');
            if (saveBtn) {
              saveBtn.click();
              return { clickedBtn: true };
            }
            return { error: "No form found" };
          })()
        `;
        ws.send(JSON.stringify({
          id: 3,
          method: "Target.sendMessageToTarget",
          params: {
            sessionId,
            message: JSON.stringify({ id: 102, method: "Runtime.evaluate", params: { expression: code, returnByValue: true } })
          }
        }));
      }, 4000);

      // 3. Wait 8s for form submission to process on server
      setTimeout(() => {
        console.log("Finished submission wait. Closing WS.");
        ws.close();
        process.exit(0);
      }, 9000);
    } else if (data.method === "Target.receivedMessageFromTarget") {
      const inner = JSON.parse(data.params.message);
      if (inner.id === 102) {
        console.log("EVAL RESULT:", JSON.stringify(inner.result?.result?.value, null, 2));
      }
    }
  });
}

main().catch(console.error);
