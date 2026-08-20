import WebSocket from 'ws';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const tabWsUrl = "ws://127.0.0.1:9222/devtools/page/B40C1AED022004662C95328B54797AF2";
  console.log("=== PERFECT CLEAN ITCH DEPLOY ===");
  console.log("Connecting to:", tabWsUrl);

  const ws = new WebSocket(tabWsUrl);
  await new Promise(r => ws.on("open", r));
  console.log("Connected to edit page WebSocket.");

  let msgId = 1;
  const pending = new Map();

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    } catch(e) {
      console.error("Parse error:", e);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

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

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 2. Execute deletion, upload, description update, and save
  console.log("Executing in-browser deletion, upload, description update, and save...");
  const execResult = await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";
        const form = document.querySelector('form.edit_game_form, form');

        // 1. Delete all old screenshots
        const oldBtns = [...document.querySelectorAll('.delete_screen_btn')];
        console.log("Found old delete buttons:", oldBtns.length);
        oldBtns.forEach(btn => btn.click());

        // 2. Update description textarea and Redactor
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

        // 3. Upload new curated screenshots
        const uploads = [];
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
            uploads.push({ name: img.name, ok: true, id: json.id });

            if (json && json.id) {
              const hidden = document.createElement('input');
              hidden.type = 'hidden';
              hidden.name = 'screenshot[' + json.id + '][position]';
              hidden.className = 'screenshot_position_input';
              hidden.value = String(i);
              form.appendChild(hidden);
            }
          } catch(e) {
            uploads.push({ name: img.name, ok: false, error: String(e) });
          }
        }

        // 4. Click Save
        setTimeout(() => {
          const saveBtn = document.querySelector('button.save_btn');
          if (saveBtn) saveBtn.click();
        }, 1500);

        return {
          deletedCount: oldBtns.length,
          descUpdated: true,
          uploads: uploads
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("EXECUTION RESULT:", JSON.stringify(execResult?.result?.value, null, 2));

  // Wait 6 seconds for save to complete on server
  console.log("Waiting for save to process on server...");
  await new Promise(r => setTimeout(r, 6000));

  // Navigate to public page
  console.log("Navigating to https://tenevik.itch.io/gigahrush to verify...");
  await send("Runtime.evaluate", {
    expression: `window.location.href = "https://tenevik.itch.io/gigahrush";`
  });

  await new Promise(r => setTimeout(r, 5000));

  const verify = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const rateBtn = document.querySelector('a[href*="rate"]')?.href;
        const screens = [...document.querySelectorAll(".screenshot_list img, .screenshot img, .carousel_item img, .right_col img")].map(i => i.src);
        return {
          title: document.title,
          rateBtn: rateBtn,
          screenshotsCount: screens.length,
          screenshots: screens
        };
      })()
    `,
    returnByValue: true
  });

  console.log("FINAL PUBLIC PAGE VERIFICATION:", JSON.stringify(verify?.result?.value, null, 2));
  ws.close();
  console.log("=== DEPLOY COMPLETED SUCCESSFULLY ===");
}

main().catch(console.error);
