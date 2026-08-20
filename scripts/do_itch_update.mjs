import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const itchTab = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  if (!itchTab) {
    console.error("No itch edit tab found!");
    process.exit(1);
  }

  const ws = new WebSocket(itchTab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  console.log("Connected to itch edit tab!");

  let msgId = 1;
  function evaluate(expr) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const onMsg = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          ws.removeEventListener("message", onMsg);
          if (data.error) reject(data.error);
          else resolve(data.result?.result?.value);
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      }));
    });
  }

  // 1. Enable Runtime
  await new Promise((resolve) => {
    const id = msgId++;
    const onMsg = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener("message", onMsg);
        resolve();
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method: "Runtime.enable" }));
  });

  // 2. Delete old screenshots
  console.log("Deleting old screenshots...");
  const delCount = await evaluate(`
    (() => {
      const btns = document.querySelectorAll('.delete_screen_btn');
      btns.forEach(b => b.click());
      return btns.length;
    })()
  `);
  console.log("Deleted old screenshots count:", delCount);
  await new Promise(r => setTimeout(r, 1000));

  // 3. Load screenshots
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
  console.log(`Loaded ${filePayloads.length} images for upload.`);

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // 4. Update description and upload images
  console.log("Uploading screenshots & updating description in page context...");
  const uploadResult = await evaluate(`
    (async () => {
      const html = ${JSON.stringify(updatedHtml)};
      const images = ${JSON.stringify(filePayloads)};
      const csrf = document.querySelector('input[name="csrf_token"]')?.value;
      const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

      // Description
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

      return results;
    })()
  `);
  console.log("Uploads Result:", uploadResult);

  // 5. Save
  console.log("Saving form...");
  await evaluate(`
    (() => {
      const btn = document.querySelector('button.save_btn, .save_btn');
      if (btn) btn.click();
    })()
  `);

  await new Promise(r => setTimeout(r, 4000));
  console.log("=== DONE SAVING ===");
  ws.close();
}

main().catch(console.error);
