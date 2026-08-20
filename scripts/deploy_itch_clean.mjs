import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let idCounter = 1;
  const callbacks = new Map();

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.id && callbacks.has(data.id)) {
        const cb = callbacks.get(data.id);
        callbacks.delete(data.id);
        if (data.error) cb.reject(data.error);
        else cb.resolve(data.result);
      }
    } catch(err) {
      console.error("WS Parse error:", err);
    }
  };

  const waitOpen = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = async (method, params = {}) => {
    await waitOpen;
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      callbacks.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  return { ws, send, close: () => ws.close() };
}

async function main() {
  console.log("=== STEP 1: LOCATE ITCH TAB ===");
  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io"));
  if (!editTab) {
    console.error("No itch tab found!");
    process.exit(1);
  }
  console.log("Found tab:", editTab.title, editTab.url);

  // If not on edit page, navigate
  if (!editTab.url.includes("/game/edit/4587160")) {
    console.log("Navigating to edit page...");
    const client = createCdpClient(editTab.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: "https://itch.io/game/edit/4587160" });
    client.close();
    await new Promise(r => setTimeout(r, 4000));
  }

  // Connect fresh client to edit page
  const res2 = await fetch("http://127.0.0.1:9222/json");
  const tabs2 = await res2.json();
  const targetTab = tabs2.find(t => t.url && t.url.includes("itch.io/game/edit/4587160")) || editTab;
  console.log("=== STEP 2: CONNECTING TO EDIT TAB ===", targetTab.webSocketDebuggerUrl);

  const client = createCdpClient(targetTab.webSocketDebuggerUrl);
  await client.send("Runtime.enable");

  // 1. Delete all old screenshots
  console.log("=== STEP 3: DELETING OLD SCREENSHOTS ===");
  const delRes = await client.send("Runtime.evaluate", {
    expression: `
      (() => {
        const btns = document.querySelectorAll('.delete_screen_btn');
        btns.forEach(b => b.click());
        return { deletedCount: btns.length };
      })()
    `,
    returnByValue: true
  });
  console.log("Deleted old screenshots:", delRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  // 2. Load fresh screenshots
  console.log("=== STEP 4: UPLOADING 11 NEW SCREENSHOTS ===");
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

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 3. Inject description and upload
  const uploadRes = await client.send("Runtime.evaluate", {
    expression: `
      (async () => {
        const html = ${JSON.stringify(updatedHtml)};
        const images = ${JSON.stringify(filePayloads)};
        const csrf = document.querySelector('input[name="csrf_token"]')?.value;
        const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

        // Inject description
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

        // Upload new screenshots
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

        return { descUpdated: true, uploads: uploadResults };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Uploads Result:", JSON.stringify(uploadRes.result?.value?.uploads, null, 2));

  // 4. Save
  console.log("=== STEP 5: SAVING FORM ===");
  await client.send("Runtime.evaluate", {
    expression: `
      const btn = document.querySelector('button.save_btn, .save_btn');
      if (btn) btn.click();
    `
  });

  await new Promise(r => setTimeout(r, 4000));

  // 5. Navigate to public page
  console.log("=== STEP 6: NAVIGATING TO PUBLIC PAGE ===");
  await client.send("Page.enable");
  await client.send("Page.navigate", { url: "https://tenevik.itch.io/gigahrush" });
  await new Promise(r => setTimeout(r, 4000));

  // 6. Verify
  console.log("=== STEP 7: VERIFYING LIVE PUBLIC PAGE ===");
  const finalCheck = await client.send("Runtime.evaluate", {
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
  console.log("FINAL PUBLIC VERIFICATION:", JSON.stringify(finalCheck.result?.value, null, 2));
  client.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
