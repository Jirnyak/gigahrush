import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== PERFECT ITCH.IO DEPLOY (DESCRIPTION + CLEAN SCREENSHOTS) ===");

  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io"));
  if (!editTab) {
    console.error("No itch tab found!");
    process.exit(1);
  }

  console.log("Connecting to:", editTab.webSocketDebuggerUrl);
  const ws = new WebSocket(editTab.webSocketDebuggerUrl);
  
  if (ws.readyState !== WebSocket.OPEN) {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
  }
  console.log("WebSocket connected successfully.");

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

  console.log("Navigating to https://itch.io/game/edit/4587160...");
  await send("Page.navigate", { url: "https://itch.io/game/edit/4587160" });
  await new Promise(r => setTimeout(r, 4000));

  // 1. Delete all old screenshots
  console.log("Deleting old screenshots...");
  const delRes = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const delBtns = [...document.querySelectorAll('.delete_screen_btn')];
        delBtns.forEach(btn => btn.click());
        return { deleted: delBtns.length };
      })()
    `,
    returnByValue: true
  });
  console.log("Deleted old screenshots count:", delRes.result?.value);
  await new Promise(r => setTimeout(r, 1000));

  // 2. Read curated images
  const uploadDir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload";
  const files = readdirSync(uploadDir)
    .filter(f => !f.startsWith('.'))
    .sort();

  const filePayloads = [];
  for (const f of files) {
    const fullPath = join(uploadDir, f);
    const buf = readFileSync(fullPath);
    if (buf.length > 5 * 1024 * 1024) continue;
    const mime = f.endsWith('.gif') ? 'image/gif' : 'image/png';
    filePayloads.push({
      name: f,
      mime: mime,
      b64: buf.toString('base64')
    });
  }
  console.log(`Loaded ${filePayloads.length} clean curated images for upload.`);

  // 3. Read updated HTML description
  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 4. Inject description and upload screenshots
  console.log("Injecting description and uploading screenshots...");
  const updateResult = await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

        // Update Description
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

        // Upload screenshots
        const uploadResults = [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
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

        return {
          descUpdated: true,
          uploads: uploadResults
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Uploads complete:", JSON.stringify(updateResult.result?.value?.uploads, null, 2));

  // 5. Save the form
  console.log("Saving form...");
  await send("Runtime.evaluate", {
    expression: `
      const saveBtn = document.querySelector('button.save_btn, .save_btn');
      if (saveBtn) saveBtn.click();
    `
  });

  // Wait 4 seconds for save
  await new Promise(r => setTimeout(r, 4000));

  // 6. Navigate to public page
  console.log("Navigating to public page https://tenevik.itch.io/gigahrush...");
  await send("Page.navigate", { url: "https://tenevik.itch.io/gigahrush" });
  await new Promise(r => setTimeout(r, 4000));

  // 7. Verify public page
  const check = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const rateBtn = document.querySelector('a[href*="tenevik.itch.io/gigahrush/rate"]');
        const screenshots = [...document.querySelectorAll('.screenshot_list img, .screenshot_preview img, .right_col img, .carousel_item img')].map(i => i.src);
        return {
          title: document.title,
          hasWorkingRateBtn: !!rateBtn,
          rateUrl: rateBtn?.href,
          publicScreenshotsCount: screenshots.length
        };
      })()
    `,
    returnByValue: true
  });

  console.log("FINAL PUBLIC VERIFICATION:", JSON.stringify(check.result?.value, null, 2));
  ws.close();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
