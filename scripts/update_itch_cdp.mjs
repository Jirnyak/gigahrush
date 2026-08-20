import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log("=== CONNECTING TO OPERA GX VIA CDP ===");

  // 1. Fetch tabs
  const res = await fetch("http://127.0.0.1:9222/json");
  const tabs = await res.json();
  console.log(`Found ${tabs.length} tabs in Opera GX.`);

  let itchTab = tabs.find(t => t.url && (t.url.includes("itch.io/game/edit/4587160") || t.url.includes("tenevik.itch.io/gigahrush")));
  if (!itchTab) {
    itchTab = tabs.find(t => t.url && t.url.includes("itch.io"));
  }

  if (!itchTab) {
    console.error("No itch.io tab found in Opera GX!");
    process.exit(1);
  }

  console.log(`Targeting tab: "${itchTab.title}" (${itchTab.url})`);
  console.log(`Connecting WebSocket: ${itchTab.webSocketDebuggerUrl}`);

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

  // Enable Page & Runtime
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");

  // Navigate to edit page if not already there
  if (!itchTab.url.includes("/game/edit/4587160")) {
    console.log("Navigating to https://itch.io/game/edit/4587160...");
    await send("Page.navigate", { url: "https://itch.io/game/edit/4587160" });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Read updated HTML
  const updatedHtml = readFileSync("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "utf-8");

  // Inject description into Redactor and textarea
  console.log("Injecting description & rating button...");
  const updateResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const newHtml = ${JSON.stringify(updatedHtml)};
        
        // 1. Update Redactor editable
        const redactors = document.querySelectorAll('.redactor-editor, [contenteditable="true"].redactor_editor, .redactor_box .redactor_editor, div.redactor-in');
        redactors.forEach(el => {
          el.innerHTML = newHtml;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 2. Update textarea
        const textareas = document.querySelectorAll('textarea[name="description"], textarea#game_description, textarea[name="game[description]"]');
        textareas.forEach(el => {
          el.value = newHtml;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 3. jQuery Redactor API
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.redactor) {
          try {
            window.jQuery('textarea[name="description"], textarea#game_description').redactor('code.set', newHtml);
          } catch(e) {}
        }

        return {
          redactorFound: redactors.length > 0,
          textareaFound: textareas.length > 0
        };
      })()
    `,
    returnByValue: true
  });
  console.log("Description injection result:", updateResult);

  // Upload Screenshots via DOM.setFileInputFiles
  console.log("Locating screenshot file input...");
  const doc = await send("DOM.getDocument", { depth: -1 });
  
  const uploadDir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload";
  const screenshotFiles = readdirSync(uploadDir)
    .filter(f => !f.startsWith('.'))
    .sort()
    .map(f => join(uploadDir, f));

  console.log(`Found ${screenshotFiles.length} screenshots to upload:`, screenshotFiles.map(f => f.split('/').pop()));

  // Find file input node
  const fileInputEval = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const inputs = [...document.querySelectorAll('input[type="file"]')];
        const target = inputs.find(i => 
          i.name?.toLowerCase().includes("screenshot") || 
          i.id?.toLowerCase().includes("screenshot") ||
          i.closest('.screenshot_upload, .screenshots_field, [data-upload_type="screenshot"]')
        ) || inputs[0];
        
        if (target) {
          target.setAttribute('id', '__antigravity_screenshot_input__');
          return true;
        }
        return false;
      })()
    `,
    returnByValue: true
  });

  if (fileInputEval.result && fileInputEval.result.value) {
    const inputNodeResult = await send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#__antigravity_screenshot_input__"
    });

    if (inputNodeResult.nodeId) {
      console.log("Setting files to input node ID:", inputNodeResult.nodeId);
      await send("DOM.setFileInputFiles", {
        files: screenshotFiles,
        nodeId: inputNodeResult.nodeId
      });
      console.log("Dispatched file upload change event!");
      await send("Runtime.evaluate", {
        expression: `
          const inp = document.getElementById('__antigravity_screenshot_input__');
          if (inp) {
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        `
      });
    }
  }

  // Wait 3 seconds for file uploads / AJAX to process
  console.log("Waiting for uploads...");
  await new Promise(r => setTimeout(r, 3000));

  // Save the form
  console.log("Submitting the Save form...");
  const saveResult = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const saveBtn = document.querySelector('button.save_btn, form.edit_game_form button[type="submit"], button[type="submit"]');
        if (saveBtn) {
          saveBtn.click();
          return "SAVE_BUTTON_CLICKED";
        }
        const form = document.querySelector('form.edit_game_form, form');
        if (form) {
          form.submit();
          return "FORM_SUBMITTED";
        }
        return "NOT_FOUND";
      })()
    `,
    returnByValue: true
  });
  console.log("Save action result:", saveResult);

  // Wait 4 seconds for save to complete on itch.io servers
  await new Promise(r => setTimeout(r, 4000));

  console.log("=== ITCH.IO UPDATE COMPLETE! ===");
  ws.close();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
