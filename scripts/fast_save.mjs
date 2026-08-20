import WebSocket from 'ws';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== FAST SAVE ON TAB 0FF6F315E07B8D5491BA9A4089510CEF ===");
  const wsUrl = "ws://127.0.0.1:9222/devtools/page/0FF6F315E07B8D5491BA9A4089510CEF";
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  console.log("Connected.");

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

  const code = `
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

      // 3. Upload new screenshots
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

      // 4. Save
      const saveBtn = document.querySelector('button.save_btn, .save_btn');
      if (saveBtn) {
        saveBtn.click();
      }

      return {
        deletedOld: oldBtns.length,
        uploads: uploadResults
      };
    })()
  `;

  ws.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    }
  }));

  ws.on('message', (data) => {
    console.log("RESPONSE FROM BROWSER:", data.toString());
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 2000);
  });
}

main().catch(console.error);
