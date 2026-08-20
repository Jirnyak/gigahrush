import WebSocket from 'ws';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== EXECUTING ITCH EDIT & SAVE VIA CDP ===");

  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));
  console.log("Connected to browser WS.");

  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const itch = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  if (!itch) {
    console.error("No itch edit tab found");
    ws.close();
    return;
  }

  // Prepare images
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
  console.log(`Prepared ${filePayloads.length} curated images.`);

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  const inPageScript = `
    (async () => {
      console.log("Starting in-page script execution...");
      const html = ${JSON.stringify(updatedHtml)};
      const images = ${JSON.stringify(filePayloads)};
      const csrf = document.querySelector('input[name="csrf_token"]')?.value;
      const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

      // 1. Delete all old screenshots
      const oldBtns = [...document.querySelectorAll('.delete_screen_btn')];
      console.log("Deleting old screenshots count:", oldBtns.length);
      oldBtns.forEach(b => b.click());

      // 2. Update Description
      document.querySelectorAll('textarea[name="game[description]"]').forEach(t => {
        t.value = html;
        t.dispatchEvent(new Event('input', { bubbles: true }));
        t.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.querySelectorAll('.redactor-in, .redactor-editor').forEach(r => {
        r.innerHTML = html;
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 3. Upload new screenshots sequentially
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
          console.log("Uploaded " + img.name + " -> id: " + json.id);

          if (json && json.id) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'screenshot[' + json.id + '][position]';
            hidden.className = 'screenshot_position_input';
            hidden.value = String(i);
            document.querySelector('form.edit_game_form, form')?.appendChild(hidden);
          }
        } catch(e) {
          console.error("Upload error for " + img.name, e);
        }
      }

      // 4. Click Save
      console.log("Submitting save form...");
      setTimeout(() => {
        const saveBtn = document.querySelector('button.save_btn, .save_btn');
        if (saveBtn) {
          saveBtn.click();
          console.log("Save button clicked!");
        }
      }, 1500);
    })()
  `;

  // Attach and execute
  ws.send(JSON.stringify({
    id: 1,
    method: "Target.attachToTarget",
    params: { targetId: itch.id, flatten: false }
  }));

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id === 1 && data.result?.sessionId) {
      const sessionId = data.result.sessionId;
      console.log("Session ID obtained:", sessionId);
      
      // Enable Runtime
      ws.send(JSON.stringify({
        id: 2,
        method: "Target.sendMessageToTarget",
        params: {
          sessionId,
          message: JSON.stringify({ id: 101, method: "Runtime.enable", params: {} })
        }
      }));

      // Send execution
      setTimeout(() => {
        console.log("Dispatching update payload...");
        ws.send(JSON.stringify({
          id: 3,
          method: "Target.sendMessageToTarget",
          params: {
            sessionId,
            message: JSON.stringify({
              id: 102,
              method: "Runtime.evaluate",
              params: {
                expression: inPageScript
              }
            })
          }
        }));
      }, 500);

      // Wait 15 seconds for all 11 uploads and form save
      setTimeout(() => {
        console.log("All actions dispatched and completed.");
        ws.close();
        process.exit(0);
      }, 15000);
    }
  });
}

main().catch(console.error);
