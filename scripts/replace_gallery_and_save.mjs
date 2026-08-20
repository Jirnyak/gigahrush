import WebSocket from 'ws';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== REPLACING SCREENSHOT GALLERY & SAVING ===");

  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));

  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const itch = tabs.find(t => t.url && t.url.includes("itch.io"));

  // 1. Prepare images
  const uploadDir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload";
  const files = readdirSync(uploadDir).filter(f => !f.startsWith('.')).sort();
  const filePayloads = [];
  for (const f of files) {
    const fullPath = join(uploadDir, f);
    const buf = readFileSync(fullPath);
    if (buf.length > 5 * 1024 * 1024) continue;
    const mime = f.endsWith('.gif') ? 'image/gif' : 'image/png';
    filePayloads.push({ name: f, mime, b64: buf.toString('base64') });
  }
  console.log(`Loaded ${filePayloads.length} curated images.`);

  ws.send(JSON.stringify({
    id: 1,
    method: "Target.attachToTarget",
    params: { targetId: itch.id, flatten: false }
  }));

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id === 1 && data.result?.sessionId) {
      const sessionId = data.result.sessionId;

      // Navigate to edit page
      ws.send(JSON.stringify({
        id: 2,
        method: "Target.sendMessageToTarget",
        params: {
          sessionId,
          message: JSON.stringify({ id: 101, method: "Page.navigate", params: { url: "https://itch.io/game/edit/4587160" } })
        }
      }));

      setTimeout(() => {
        const replaceCode = `
          (async () => {
            const images = ${JSON.stringify(filePayloads)};
            const csrf = document.querySelector('input[name="csrf_token"]')?.value;
            const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";
            const form = document.querySelector('form.edit_game_form, form');

            // 1. Remove all old screenshots and their position inputs
            const oldScreens = [...document.querySelectorAll('.screenshot, .screenshot_position_input, input[name*="screenshot["]')];
            console.log("Removing old screenshot elements count:", oldScreens.length);
            oldScreens.forEach(el => el.remove());

            // 2. Upload new screenshots sequentially
            const uploadLogs = [];
            for (let i = 0; i < images.length; i++) {
              const img = images[i];
              try {
                const byteChars = atob(img.b64);
                const byteNums = new Array(byteChars.length);
                for (let j = 0; j < byteChars.length; j++) byteNums[j] = byteChars.charCodeAt(j);
                const byteArray = new Uint8Array(byteNums);
                const blob = new Blob([byteArray], { type: img.mime });

                const fd = new FormData();
                fd.append('csrf_token', csrf);
                fd.append('upload_type', 'screenshot');
                fd.append('game_id', gameId);
                fd.append('file', blob, img.name);

                const res = await fetch('/upload-image', { method: 'POST', body: fd });
                const json = await res.json();
                uploadLogs.push({ name: img.name, id: json.id, ok: true });

                if (json && json.id) {
                  const input = document.createElement('input');
                  input.type = 'hidden';
                  input.name = 'screenshot[' + json.id + '][position]';
                  input.className = 'screenshot_position_input';
                  input.value = String(i);
                  form.appendChild(input);
                }
              } catch(err) {
                uploadLogs.push({ name: img.name, ok: false, err: String(err) });
              }
            }

            // 3. Save Form
            console.log("Uploads complete, clicking save button...");
            const saveBtn = document.querySelector('button.save_btn');
            if (saveBtn) {
              saveBtn.click();
            }

            return {
              removedOldCount: oldScreens.length,
              uploads: uploadLogs
            };
          })()
        `;

        ws.send(JSON.stringify({
          id: 3,
          method: "Target.sendMessageToTarget",
          params: {
            sessionId,
            message: JSON.stringify({ id: 102, method: "Runtime.evaluate", params: { expression: replaceCode, awaitPromise: true, returnByValue: true } })
          }
        }));
      }, 4000);

      setTimeout(() => {
        console.log("Completed execution wait. Closing WS.");
        ws.close();
        process.exit(0);
      }, 25000);
    } else if (data.method === "Target.receivedMessageFromTarget") {
      const inner = JSON.parse(data.params.message);
      if (inner.id === 102) {
        console.log("UPLOAD & SAVE RESULT:", JSON.stringify(inner.result?.result?.value, null, 2));
      }
    }
  });
}

main().catch(console.error);
