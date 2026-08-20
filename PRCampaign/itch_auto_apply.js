(async () => {
  console.log("=== GIGAH|RUSH ITCH.IO AUTO-APPLIER ===");

  // 1. Fetch updated description HTML
  const descRes = await fetch("http://127.0.0.1:8790/PRCampaign/itch_description_updated_2026.html");
  const newHtml = await descRes.text();

  // 2. Set description in Redactor / textarea
  const redactorEditor = document.querySelector('.redactor-editor, [contenteditable="true"].redactor_editor, .redactor_box .redactor_editor');
  const textareaDesc = document.querySelector('textarea[name="description"], textarea#game_description, textarea[name="game[description]"]');
  
  if (redactorEditor) {
    redactorEditor.innerHTML = newHtml;
    redactorEditor.dispatchEvent(new Event('input', { bubbles: true }));
    redactorEditor.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("Updated Redactor editor HTML");
  }
  if (textareaDesc) {
    textareaDesc.value = newHtml;
    textareaDesc.dispatchEvent(new Event('input', { bubbles: true }));
    textareaDesc.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("Updated textarea description");
  }
  if (window.jQuery && window.jQuery.fn && window.jQuery.fn.redactor) {
    try {
      window.jQuery('textarea[name="description"], textarea#game_description').redactor('code.set', newHtml);
      console.log("Called jQuery redactor set");
    } catch(e) {
      console.log("Redactor jQuery fallback:", e);
    }
  }

  // 3. List of screenshot files to upload
  const screenshotFiles = [
    "01_anim_hell_blinking_eyes.gif",
    "02_samosbor_blue_fog_horror.png",
    "03_corridor_combat_makarov_stalker.png",
    "04_raionsovet_olga_dmitrievna.png",
    "05_ritual_chamber_cultist_liquidator.png",
    "06_flesh_corridor_creeping_monster.png",
    "07_samosbor_warning_10s_monolith.png",
    "08_rpg_inventory_and_character_stats.png",
    "09_barter_trading_prokhor.png",
    "10_megastructure_1024x1024_torus_map.png",
    "11_industrial_warehouse_blast_doors.png",
    "12_anim_underhell_samosbor_loop.gif"
  ];

  // Find file input for screenshots
  const fileInputs = [...document.querySelectorAll('input[type="file"]')];
  console.log("Found file inputs:", fileInputs.map(i => ({ name: i.name, id: i.id, class: i.className })));

  // Look for screenshots dropzone or file input
  const screenshotInput = fileInputs.find(i => 
    i.name?.toLowerCase().includes("screenshot") || 
    i.id?.toLowerCase().includes("screenshot") ||
    i.closest('.screenshot_upload, .screenshots_field, [data-upload_type="screenshot"]')
  ) || fileInputs[0];

  if (screenshotInput) {
    console.log("Targeting screenshot input:", screenshotInput);
    const dt = new DataTransfer();

    for (const filename of screenshotFiles) {
      try {
        const url = `http://127.0.0.1:8790/screenshots/itch_upload/${encodeURIComponent(filename)}`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn("Failed to fetch", url, res.status);
          continue;
        }
        const blob = await res.blob();
        const mimeType = filename.endsWith('.gif') ? 'image/gif' : 'image/png';
        const file = new File([blob], filename, { type: mimeType });
        dt.items.add(file);
        console.log(`Added file ${filename} (${blob.size} bytes)`);
      } catch (err) {
        console.error("Error loading screenshot", filename, err);
      }
    }

    if (dt.files.length > 0) {
      screenshotInput.files = dt.files;
      screenshotInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`Dispatched change event with ${dt.files.length} files to screenshot uploader`);
    }
  }

  // 4. Report status
  console.log("=== AUTO-APPLY COMPLETE! Ready to save ===");
  alert("GIGAH|RUSH: Описание и кнопка рейтинга успешно вставлены! Проверь форму и нажми Save.");
})();
