import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== APPLY AND SAVE DIRECT ===");

  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  if (!editTab) {
    console.error("No edit tab found!");
    process.exit(1);
  }

  const ws = new WebSocket(editTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  console.log("Connected to edit page.");

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const onMsg = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          ws.removeEventListener("message", onMsg);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Runtime.enable");

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
  console.log(`Loaded ${filePayloads.length} curated images.`);

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  console.log("Executing in-browser deletion, upload, description update, and save...");
  const execResult = await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

        // 1. Delete old screenshots
        const oldBtns = [...document.querySelectorAll('.delete_screen_btn')];
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
        const uploadResults = [];
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
            uploadResults.push({ name: img.name, ok: true, id: json.id });

            if (json && json.id) {
              const hidden = document.createElement('input');
              hidden.type = 'hidden';
              hidden.name = 'screenshot[' + json.id + '][position]';
              hidden.className = 'screenshot_position_input';
              hidden.value = String(i);
              document.querySelector('form.edit_game_form, form')?.appendChild(hidden);
            }
          } catch(e) {
            uploadResults.push({ name: img.name, ok: false, error: String(e) });
          }
        }

        // 4. Click Save
        setTimeout(() => {
          const saveBtn = document.querySelector('button.save_btn, .save_btn');
          if (saveBtn) saveBtn.click();
        }, 1000);

        return {
          deletedOldCount: oldBtns.length,
          descUpdated: true,
          uploads: uploadResults
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("EXEC RESULT:", JSON.stringify(execResult?.result?.value, null, 2));

  // Wait 4 seconds for save to complete
  await new Promise(r => setTimeout(r, 4000));
  console.log("=== COMPLETED AND SAVED ===");
  ws.close();
}

main().catch(console.error);
