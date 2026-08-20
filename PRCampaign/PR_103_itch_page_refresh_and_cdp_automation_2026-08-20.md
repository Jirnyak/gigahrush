# PR-103: itch.io Store Page Refresh, Verified Rating Endpoint & Remote CDP Browser Automation

**Date:** 2026-08-20  
**Surface:** itch.io (`https://tenevik.itch.io/gigahrush`)  
**Scope:** Store Copy, Rating System Link, Screenshot Gallery, Browser Automation Pipeline  

---

## 1. Verified Rating Endpoint & Fix
- **Direct Rating URL:** `https://tenevik.itch.io/gigahrush/rate`
- **Issue with `/game/rate/4587160`:** itch.io returned 404 on the generic ID URL. The real, active rating surface is on the game subdomain (`tenevik.itch.io/gigahrush/rate`), which displays the full 1-to-5 star rating selector and review form.
- **Button Injected:** Prominent golden CTA button added at the top and in the support section linking directly to `https://tenevik.itch.io/gigahrush/rate`.

---

## 2. Updated Store Description (2026 Features)
- Updated feature list: 1024x1024 Toroidal Megastructure, A-Life NPC simulation, Samosbor alarms & dynamic cellular floor mutations, barter economy & price multipliers, full mobile dual-stick touch controls.
- Controls overview and onboarding guide.
- Direct links to Web Build (`https://gigahrush.bileter.workers.dev`), Telegram community (`https://t.me/gigah_rush`), and IndieDB.

---

## 3. Curated Screenshot Gallery (12 Assets)
Curated from project captures across the repository into `screenshots/itch_upload/`:
1. `01_anim_hell_blinking_eyes.gif` — Animated horror blinking eyes
2. `02_samosbor_blue_fog_horror.png` — Volumetric Samosbor blue fog & whispers
3. `03_corridor_combat_makarov_stalker.png` — Makarov combat stance in living corridor
4. `04_raionsovet_olga_dmitrievna.png` — Raionsovet administrative hub dialogue
5. `05_ritual_chamber_cultist_liquidator.png` — Crimson ritual chamber with Liquidator
6. `06_flesh_corridor_creeping_monster.png` — Flesh corridor with bio-horror entities
7. `07_samosbor_warning_10s_monolith.png` — Samosbor 10s siren warning at monolith
8. `08_rpg_inventory_and_character_stats.png` — RPG inventory grid and vitals
9. `09_barter_trading_prokhor.png` — Barter trading with Prokhor
10. `10_megastructure_1024x1024_torus_map.png` — Full 1024x1024 torus megastructure map
11. `11_industrial_warehouse_blast_doors.png` — Heavy sealed industrial blast doors
12. `12_anim_underhell_samosbor_loop.gif` — Pulsing Underhell loop animation

---

## 4. Host Browser CDP Automation Pipeline Established
- Enabled Chrome DevTools Protocol (CDP) connectivity to the owner's running Opera GX browser on port `9222`.
- Established Node.js CDP client tooling (`scripts/update_itch_cdp.mjs`, `scripts/deploy_itch_perfect.mjs`) allowing direct DOM manipulation, Redactor state injection, AJAX screenshot uploads (`/upload-image`), and form submission.
