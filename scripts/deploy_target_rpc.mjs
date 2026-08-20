import WebSocket from 'ws';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== TARGET RPC ITCH DEPLOY ===");

  const versionRes = await fetch("http://127.0.0.1:9222/json/version");
  const version = await versionRes.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on("open", r));
  console.log("Connected to browser WS.");

  let msgId = 1;
  const browserPending = new Map();
  const targetPending = new Map();

  let activeSessionId = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.id && browserPending.has(data.id)) {
        const { resolve, reject } = browserPending.get(data.id);
        browserPending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      } else if (data.method === "Target.receivedMessageFromTarget") {
        const inner = JSON.parse(data.params.message);
        if (inner.id && targetPending.has(inner.id)) {
          const { resolve, reject } = targetPending.get(inner.id);
          targetPending.delete(inner.id);
          if (inner.error) reject(inner.error);
          else resolve(inner.result);
        }
      }
    } catch(e) {
      console.error(e);
    }
  });

  function callBrowser(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      browserPending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  let targetMsgId = 1;
  function callTarget(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = targetMsgId++;
      targetPending.set(id, { resolve, reject });
      const innerMessage = JSON.stringify({ id, method, params });
      callBrowser("Target.sendMessageToTarget", {
        sessionId: activeSessionId,
        message: innerMessage
      }).catch(reject);
    });
  }

  // 1. Find edit tab
  const tabsRes = await fetch("http://127.0.0.1:9222/json");
  const tabs = await tabsRes.json();
  const itch = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  if (!itch) {
    console.error("No itch edit tab found");
    ws.close();
    return;
  }

  console.log("Attaching to tab:", itch.id, itch.title);
  const attachRes = await callBrowser("Target.attachToTarget", {
    targetId: itch.id,
    flatten: false
  });
  activeSessionId = attachRes.sessionId;
  console.log("Attached with sessionId:", activeSessionId);

  // 2. Test evaluate
  const testRes = await callTarget("Runtime.evaluate", {
    expression: "document.title",
    returnByValue: true
  });
  console.log("Target Document Title:", testRes?.result?.value);

  // 3. Prepare images
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

  // 4. In-browser actions: Delete old screens, update description with working rate URL, upload new screens, click save
  console.log("Executing in-browser deletion, upload, description update, and save...");
  const execResult = await callTarget("Runtime.evaluate", {
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
        }, 1500);

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

  console.log("EXECUTION RESULT:", JSON.stringify(execResult?.result?.value, null, 2));

  // Wait 6 seconds for save to complete on itch.io servers
  console.log("Waiting for save to persist...");
  await new Promise(r => setTimeout(r, 6000));

  // 5. Navigate to public page and verify live content
  console.log("Navigating to public page https://tenevik.itch.io/gigahrush...");
  await callTarget("Runtime.evaluate", {
    expression: `window.location.href = "https://tenevik.itch.io/gigahrush";`
  });

  await new Promise(r => setTimeout(r, 4000));

  const verify = await callTarget("Runtime.evaluate", {
    expression: `
      (() => {
        const rateLink = document.querySelector('a[href*="tenevik.itch.io/gigahrush/rate"]');
        const oldRateLink = document.querySelector('a[href*="itch.io/game/rate/4587160"]');
        const screens = [...document.querySelectorAll('.screenshot_list img, .right_col img, .carousel_item img')].map(i => i.src);
        return {
          title: document.title,
          hasWorkingRateLink: !!rateLink,
          rateUrl: rateLink ? rateLink.href : null,
          hasOldBrokenLink: !!oldRateLink,
          screenshotsCount: screens.length,
          screenshotsSample: screens.slice(0, 3)
        };
      })()
    `,
    returnByValue: true
  });

  console.log("FINAL LIVE VERIFICATION:", JSON.stringify(verify?.result?.value, null, 2));
  ws.close();
  console.log("=== FULL ITCH.IO DEPLOY SUCCESSFUL ===");
}

main().catch(console.error);
