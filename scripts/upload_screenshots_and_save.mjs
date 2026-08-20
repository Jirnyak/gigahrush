import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== FULL ITCH.IO UPDATE (DESCRIPTION + SCREENSHOTS) ===");

  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io"));
  if (!editTab) {
    console.error("No itch tab found!");
    process.exit(1);
  }

  const ws = new WebSocket(editTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");

  // Ensure we are on edit page
  if (!editTab.url.includes("/game/edit/4587160")) {
    console.log("Navigating to https://itch.io/game/edit/4587160...");
    await send("Page.navigate", { url: "https://itch.io/game/edit/4587160" });
    await new Promise(r => setTimeout(r, 3000));
  }

  // 1. Prepare base64 screenshots
  const uploadDir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload";
  const files = readdirSync(uploadDir)
    .filter(f => !f.startsWith('.'))
    .sort();

  const filePayloads = [];
  for (const f of files) {
    const fullPath = join(uploadDir, f);
    const buf = readFileSync(fullPath);
    const mime = f.endsWith('.gif') ? 'image/gif' : 'image/png';
    filePayloads.push({
      name: f,
      mime: mime,
      b64: buf.toString('base64')
    });
  }
  console.log(`Loaded ${filePayloads.length} images into payload.`);

  // 2. Read updated HTML description
  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 3. Inject and upload inside page context
  console.log("Injecting description and uploading screenshots via itch /upload-image API...");
  const execResult = await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

        // 1. Update Description
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

        // 2. Upload screenshots
        const uploadResults = [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            // Convert b64 to Blob
            const byteChars = atob(img.b64);
            const byteNums = new Array(byteChars.length);
            for (let j = 0; j < byteChars.length; j++) {
              byteNums[j] = byteChars.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNums);
            const blob = new Blob([byteArray], { type: img.mime });

            const fd = new FormData();
            fd.append('csrf_token', csrf);
            fd.append('upload_type', 'screenshot');
            fd.append('game_id', gameId);
            fd.append('file', blob, img.name);

            const res = await fetch('/upload-image', {
              method: 'POST',
              body: fd
            });
            const json = await res.json();
            uploadResults.push({ name: img.name, ok: true, id: json.id });
            console.log("Uploaded screenshot", img.name, json);
            
            // Add hidden input to form so itch associates it on save
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

        // 3. Click Save
        setTimeout(() => {
          const saveBtn = document.querySelector('button.save_btn, .save_btn');
          if (saveBtn) saveBtn.click();
        }, 1500);

        return {
          descUpdated: true,
          uploads: uploadResults
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Execution Result:", JSON.stringify(execResult.result?.value, null, 2));

  // Wait 4 seconds for save
  await new Promise(r => setTimeout(r, 4000));

  // 4. Navigate to public page
  console.log("Navigating to public page https://tenevik.itch.io/gigahrush...");
  await send("Page.navigate", { url: "https://tenevik.itch.io/gigahrush" });
  await new Promise(r => setTimeout(r, 3000));

  console.log("=== COMPLETE AND LIVE ===");
  ws.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
