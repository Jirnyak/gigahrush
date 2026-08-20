import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function run() {
  const wsUrl = "ws://127.0.0.1:9222/devtools/page/287D9EBD0EA3D856CA8AC2E41E1F77CB";
  console.log("Connecting directly to:", wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  console.log("WS OPEN!");

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
  console.log(`Loaded ${filePayloads.length} images.`);

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  const scriptToRun = `
    (async () => {
      const html = ${JSON.stringify(updatedHtml)};
      const images = ${JSON.stringify(filePayloads)};
      const csrf = document.querySelector('input[name="csrf_token"]')?.value;
      const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

      // 1. Delete old screenshots
      const oldBtns = document.querySelectorAll('.delete_screen_btn');
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
        deletedCount: oldBtns.length,
        descUpdated: true,
        uploads: uploadResults
      };
    })()
  `;

  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  ws.send(JSON.stringify({
    id: 2,
    method: "Runtime.evaluate",
    params: {
      expression: scriptToRun,
      awaitPromise: true,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    console.log("RECV MSG ID:", data.id);
    if (data.id === 2) {
      console.log("RESULT:", JSON.stringify(data.result?.result?.value, null, 2));
      setTimeout(() => {
        console.log("Done. Closing WS.");
        ws.close();
        process.exit(0);
      }, 3000);
    }
  };
}

run().catch(console.error);
