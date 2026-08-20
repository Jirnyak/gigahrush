import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== FINAL ITCH.IO DEPLOY ===");

  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const itchTab = tabs.find(t => t.url && t.url.includes("itch.io"));
  if (!itchTab) {
    console.error("No itch tab found!");
    process.exit(1);
  }

  console.log(`Connecting to "${itchTab.title}" (${itchTab.url})`);
  const ws = new WebSocket(itchTab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

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

  // 1. Navigate to edit page
  if (!itchTab.url.includes("/game/edit/4587160")) {
    console.log("Navigating to edit page...");
    await send("Page.navigate", { url: "https://itch.io/game/edit/4587160" });
    await new Promise(r => setTimeout(r, 3000));
  }

  // 2. Delete old screenshots
  console.log("Deleting old screenshots...");
  const delRes = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const delBtns = [...document.querySelectorAll(".delete_screen_btn")];
        delBtns.forEach(b => b.click());
        return { deleted: delBtns.length };
      })()
    `,
    returnByValue: true
  });
  console.log("Deleted old screenshots:", delRes.result?.value);

  // 3. Prepare fresh screenshots
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
  console.log(`Loaded ${filePayloads.length} images.`);

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 4. Inject description and upload screenshots
  console.log("Injecting description and uploading screenshots...");
  const execResult = await send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

        // Inject Description
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

        // Upload images
        const results = [];
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
            results.push({ name: img.name, ok: true, id: json.id });

            if (json && json.id) {
              const hidden = document.createElement('input');
              hidden.type = 'hidden';
              hidden.name = 'screenshot[' + json.id + '][position]';
              hidden.className = 'screenshot_position_input';
              hidden.value = String(i);
              document.querySelector('form.edit_game_form, form')?.appendChild(hidden);
            }
          } catch(err) {
            results.push({ name: img.name, ok: false, err: String(err) });
          }
        }

        return { descUpdated: true, uploads: results };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Uploads Result:", JSON.stringify(execResult.result?.value?.uploads, null, 2));

  // 5. Save
  console.log("Saving form...");
  await send("Runtime.evaluate", {
    expression: `
      const btn = document.querySelector('button.save_btn, .save_btn');
      if (btn) btn.click();
    `
  });

  await new Promise(r => setTimeout(r, 4000));

  // 6. Navigate to public page
  console.log("Navigating to public page https://tenevik.itch.io/gigahrush...");
  await send("Page.navigate", { url: "https://tenevik.itch.io/gigahrush" });
  await new Promise(r => setTimeout(r, 3000));

  // 7. Verify
  const verifyRes = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const rateBtn = document.querySelector('a[href*="tenevik.itch.io/gigahrush/rate"]');
        const screenshots = [...document.querySelectorAll('.screenshot_list img, .screenshot_preview img, .right_col img')].map(i => i.src);
        return {
          title: document.title,
          hasWorkingRateBtn: !!rateBtn,
          rateUrl: rateBtn?.href,
          screenshotsCount: screenshots.length
        };
      })()
    `,
    returnByValue: true
  });

  console.log("VERIFICATION:", JSON.stringify(verifyRes.result?.value, null, 2));
  ws.close();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
