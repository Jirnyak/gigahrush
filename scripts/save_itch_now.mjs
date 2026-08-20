import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== SAVING ITCH.IO FORM VIA CDP ===");

  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  const editTab = tabs.find(t => t.url && t.url.includes("itch.io/game/edit/4587160"));
  if (!editTab) {
    console.error("No edit tab found!");
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
  await send("DOM.enable");

  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // Set description in all relevant places
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const html = ${JSON.stringify(updatedHtml)};
        
        // 1. Textarea
        document.querySelectorAll('textarea[name="game[description]"]').forEach(t => {
          t.value = html;
          t.dispatchEvent(new Event('input', { bubbles: true }));
          t.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 2. Redactor
        document.querySelectorAll('.redactor-in, .redactor-editor').forEach(r => {
          r.innerHTML = html;
          r.dispatchEvent(new Event('input', { bubbles: true }));
          r.dispatchEvent(new Event('change', { bubbles: true }));
        });

        if (window.jQuery) {
          try {
            window.jQuery('textarea[name="game[description]"]').val(html).trigger('change');
            if (window.jQuery.fn.redactor) {
              window.jQuery('textarea[name="game[description]"]').redactor('code.set', html);
            }
          } catch(e) {}
        }
      })()
    `
  });

  // Handle screenshots upload: find the file input associated with "Add screenshots"
  console.log("Uploading screenshots...");
  const uploadDir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload";
  const files = readdirSync(uploadDir)
    .filter(f => !f.startsWith('.'))
    .sort()
    .map(f => join(uploadDir, f));

  const doc = await send("DOM.getDocument", { depth: -1 });
  const fileInputInfo = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const addBtn = document.querySelector('.add_screenshot_btn');
        let inp = document.querySelector('.screenshot_upload_row input[type="file"], .screenshots_field input[type="file"], input[name="game[screenshots][]"], input[name="file"]');
        if (!inp && addBtn) {
          inp = addBtn.closest('div, section, .form_row')?.querySelector('input[type="file"]');
        }
        if (!inp) {
          inp = document.querySelectorAll('input[type="file"]')[1] || document.querySelector('input[type="file"]');
        }
        if (inp) {
          inp.id = '__cdp_screenshot_input__';
          return { found: true, name: inp.name, id: inp.id };
        }
        return { found: false };
      })()
    `,
    returnByValue: true
  });
  console.log("File input target:", fileInputInfo.result?.value);

  if (fileInputInfo.result?.value?.found) {
    const nodeRes = await send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#__cdp_screenshot_input__"
    });
    if (nodeRes.nodeId) {
      console.log("Injecting files to nodeId:", nodeRes.nodeId);
      await send("DOM.setFileInputFiles", {
        files: files,
        nodeId: nodeRes.nodeId
      });
      await send("Runtime.evaluate", {
        expression: `
          const el = document.getElementById('__cdp_screenshot_input__');
          if (el) {
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        `
      });
      console.log("Waiting 5s for screenshot AJAX uploads...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Click SAVE button
  console.log("Clicking Save button...");
  const clickSave = await send("Runtime.evaluate", {
    expression: `
      (() => {
        // Trigger save button
        const btn = document.querySelector('button.save_btn, .save_btn');
        if (btn) {
          btn.click();
          return "CLICKED_SAVE_BTN";
        }
        const form = document.querySelector('form.edit_game_form, form');
        if (form) {
          form.submit();
          return "FORM_SUBMITTED";
        }
        return "NO_BUTTON";
      })()
    `,
    returnByValue: true
  });
  console.log("Save trigger:", clickSave.result?.value);

  // Wait 4 seconds for save
  await new Promise(r => setTimeout(r, 4000));

  // Check save confirmation message
  const statusCheck = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const flash = document.querySelector('.flash_message, .banner, .alert_message, .toast, .saved_notice');
        return {
          banner: flash ? flash.innerText : null,
          title: document.title,
          url: location.href
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Post-save status:", statusCheck.result?.value);

  ws.close();
  console.log("=== DONE ===");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
