# Expansion 07 Content Manifest: Hospital Quarantine MVP

Статус: planning manifest. Содержимое перечисляет future minimum playable slice and reserved expansions; it is not a report of implemented assets.

## Content Boundary

The hospital quarantine block is a medical-bureaucratic survival pocket. It uses existing item categories, room fallbacks, NPC occupations and quest patterns where possible. It must not require a full hospital floor for MVP. Its core loop is: condition appears, player seeks help, service demands time/resource/document, quarantine changes access, medcard records a consequence, morgue reveals why paperwork is dangerous.

## Medical States

Finite states are the content backbone. They must stay readable, capped and mechanically distinct.

| State id | Name | MVP | Severity range | Main causes | Immediate effect | Treatment | Untreated outcome | Document trace |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bleeding` | Кровотечение | yes | 1-3 | Monster hit, trap, broken glass, surgery failure | Slow HP loss, noisy breathing line | `bandage`, dressing room, doctor | Severity increase, collapse risk | Treatment slip or refusal note |
| `burn` | Ожог | yes | 1-3 | Heatline steam, fire, electric overload | Slower action/reload, pain text | burn shower, clean bandage, pills | Infection risk, high water demand | Burn card, shower token |
| `mold_infection` | Плесневая инфекция | yes | 1-3 | Wet samosbor, mushroom/dirty room, morgue spore | Sleep worse, cough/noise, quarantine suspicion | quarantine corridor, pills, rare extract | `quarantine_mark`, HP/PSI bleed | Infection notice |
| `psi_exhaustion` | ПСИ-истощение | yes | 1-3 | PSI weapon overuse, anomaly, psych office side effect | Lower PSI accuracy/feedback reliability | antidep, psychiatrist, rest | panic/sedation risk | Psychiatric card |
| `sedated` | Сонливость | yes | 1-2 | Procedure, pills, psych diagnosis, black-market drug | Blunted fear, slower reaction, time skip risk | wait, tea, stimulant future hook | vulnerable during siren | Prescription record |
| `quarantine_mark` | Карантинная метка | yes | 1 | Failed check, infection, room exposure | Access restrictions, sanitar attention | clearance, fake certificate, timed isolation | blocked services/escalation | Quarantine stamp |
| `poisoned` | Отравление | reserved | 1-3 | Concentrate industry, chemical room, bad meds | HP/vision penalty | antidote, doctor | collapse/record | Toxicology note |
| `withdrawal` | Ломка | reserved | 1-3 | Club/black-market drug arc | Need pressure, dialogue aggression | controlled treatment, substitute | theft/betrayal risk | Dependency file |
| `panic_trauma` | Паническая травма | reserved | 1-3 | Failed samosbor shelter, morgue shock | False HUD, shakier aim | psych office, trust event | bad A-Life reactions | Psychiatric referral |

MVP should ship `bleeding`, `burn`, `mold_infection`, `psi_exhaustion`, `sedated` and `quarantine_mark`. Reserved states define the slot map so later expansions do not invent incompatible ids.

## Rooms

| Room id | Название | Existing room fallback | Gameplay role | Required interaction | Risk and constraint |
| --- | --- | --- | --- | --- | --- |
| `hospital_reception` | Приемный покой | MEDBAY/HALL | Queue, service routing, document check | Talk to doctor/sanitar, request treatment | Not safe; queue can fail during samosbor. |
| `hospital_dressing` | Перевязочная | MEDBAY | Treat `bleeding`, minor wounds | Spend bandage/time; doctor can improve result | Sterility can fail under wet/electric variants. |
| `hospital_burn_shower` | Ожоговая душевая | BATHROOM/MEDBAY | Treat `burn`, connect to HEAT | Use water/token, risk noise/time | Water shortage can block service. |
| `hospital_infection_corridor` | Инфекционный коридор | HALL/MEDBAY | Isolate/clear `mold_infection`, apply `quarantine_mark` | Enter isolation, pass check | Should be a route decision, not full-map spread. |
| `hospital_psych_office` | Психкабинет | ACCOUNTING/MEDBAY | PSI exhaustion, diagnosis, documents | Interview or prescription | Can apply useful treatment plus bureaucratic debuff. |
| `hospital_morgue` | Морг | STORAGE/MEDBAY | Body records, lored contradictions, limited evidence | Inspect ledger/drawer/tag | Loot capped; no generic wave arena. |
| `hospital_pharmacy_storage` | Аптечный склад | STORAGE | Locked medical container and scarcity | Open legally, steal, or trade | Theft affects reputation and rumors. |
| `hospital_sanitary_airlock` | Санитарный шлюз | CORRIDOR/HALL | Quarantine gate and samosbor shelter decision | Pass clean/marked/fake document check | Can become trap if doors close late. |

Room implementation note: if the current enum does not include specialized room types, use tags/names on existing room records instead of expanding the enum for every sub-room.

## NPC

| NPC id | Name | Faction | Occupation fallback | Role | State hooks |
| --- | --- | --- | --- | --- | --- |
| `hospital_tamara_feldsher` | Фельдшер Тамара | CITIZEN | DOCTOR/SCIENTIST | Primary healer, triage, donor request | Can clear `bleeding`/`burn`, writes medcard. |
| `hospital_rudenko_psych` | Психиатр Руденко | CITIZEN/MINISTRY tint | SCIENTIST/CLERK | PSI and diagnosis gate | Trades `psi_exhaustion` relief for record risk. |
| `hospital_belykh_sanitar` | Санитар Белых | LIQUIDATOR/CITIZEN | GUARD/DOCTOR | Quarantine enforcer, access checks | Stops marked player, notices fake papers. |
| `hospital_yukhim_morgue` | Юхим Морг | CITIZEN | CLERK | Morgue keeper and ledger owner | Unlocks drawer/record contradiction. |
| `hospital_patient_zina` | Зина с чужой картой | CITIZEN | PENSIONER fallback | Demonstrates wrong medcard | Can be alive while record says dead. |
| `hospital_runner_orderly` | Дежурный санитар | CITIZEN | WORKER | Optional service runner | Moves supplies only in high tier or scripted event. |

Generic patients are not individual full A-Life for MVP. Use small aggregate counters or static room occupants unless a named patient has a quest or record consequence.

## Medical Documents And Records

| Document id | Name | Source | Mechanical consequence | Save note |
| --- | --- | --- | --- | --- |
| `medcard_player` | Медкарта игрока | First hospital service | Stores last condition/treatment trace; can affect future checks | Optional record array, absent in old saves means empty. |
| `prescription_pills` | Рецепт на таблетки | Tamara/Rudenko | Legal access to pharmacy storage or lower price | Item or record token; stable id. |
| `quarantine_notice` | Карантинное предписание | Failed infection check | Blocks one service/trade route until cleared | Timestamp and severity required. |
| `absence_of_infection` | Справка об отсутствии заражения | Clearance or forged doc | Bypasses one sanitar check, suspicious if stale | Expiry optional; old saves treat no expiry as valid until checked. |
| `psychiatric_referral` | Направление к психиатру | PSI exhaustion or admin event | Debuff/key: can open psych office and mark unreliable | Must not permanently softlock. |
| `morgue_tag_wrong` | Ошибочный морговой жетон | Morgue inspection | Opens contradiction quest or archive hook | References NPC name/id if available. |
| `donor_receipt` | Донорская расписка | Donor event | Treatment discount/reputation change | Reserved for high tier. |

Records should be short and mechanical. Flavor text belongs in notes only when it changes a decision, rumor, access or price.

## Medicines And Supplies

MVP should reuse existing items first: `bandage`, `pills`, `antidep`, `water`, `tea`, money/talons if present, and locked medical containers. New items are reserved unless current catalog lacks a required distinction.

| Supply id | Existing-first mapping | Use | Risk |
| --- | --- | --- | --- |
| `sterile_bandage` | `bandage` with context tag | Clears/reduces `bleeding`, supports burn treatment | Scarcity if med cabinet empty. |
| `pills_general` | `pills` | Reduces infection/pain/sedation edge cases | Overuse can create `sedated`. |
| `antidep_psi` | `antidep` | Clears/reduces `psi_exhaustion` | Expensive and tracked by psych card. |
| `clean_water_shower` | `water` or room resource | Burn shower and infection wash | Water shortage gates service. |
| `medical_reagent` | reserved existing reagent if available | High-tier production of pills | Not required for MVP. |
| `morgue_key` | existing key or document | Accesses one drawer/ledger | Should not open broad storage. |

The pharmacy storage is a container with access rules. Floor loot is reserved for chaos after samosbor, theft aftermath or a scripted scarcity event.

## Morgue Manifest

| Morgue content id | MVP | Interaction | Reward | Limit |
| --- | --- | --- | --- | --- |
| `drawer_wrong_queue_patient` | yes | Inspect body tag and compare to queue record | Contradiction clue, rumor, possible quest | One per pocket. |
| `drawer_empty_body_present` | yes | Drawer record says occupied, drawer is empty or reversed | Fear, route clue, sanitar suspicion | No combat required. |
| `ledger_meat_resonance_swap` | yes for variant hook | Meat resonance scrambles two records | Document trace or access confusion | Local to hospital. |
| `drawer_repeated_npc` | reserved | NPC appears on ledger twice | Archive/raionsovet hook | High tier only. |
| `morgue_med_cache` | reserved small | Hidden emergency item | One bandage/pills max | Not a farming source. |

Morgue tone: record horror before gore. The player should fear the paperwork being true.

## Debug Commands

| Command id | Purpose | Required output |
| --- | --- | --- |
| `medical.apply <condition> <severity>` | Apply condition to player | Active condition list, severity, source. |
| `medical.clear <condition|all>` | Clear player condition | Before/after state and medcard trace if applicable. |
| `medical.set_quarantine <on|off>` | Force quarantine mark | Service gate status and sanitar branch. |
| `medical.tick <seconds>` | Advance rare decay/treatment timers | Conditions changed, records written, no allocation count if available. |
| `hospital.spawn_pocket` | Generate/test pocket in current floor debug context | Room ids, connectivity, service count. |
| `hospital.force_variant <wet|meat|electric|silent|classic>` | Run local samosbor hospital hook | Changed room flags/records only. |
| `hospital.dump_records` | Print medcards/morgue records | Count, unknown ids, latest traces. |
| `hospital.blackbox_dump` | Dump telemetry | Writes `Docs/AgentLogs/Dump_EXP07_HOSPITAL.bin`. |

Debug is part of the content contract. If a future implementation cannot inspect medical state, it is not ready.

## MVP DOD

The content slice is done when one hospital pocket contains the listed MVP rooms, four named staff/patient roles, six condition ids, one legal and one risky treatment path, one quarantine gate, one medcard trace, one morgue contradiction and the debug commands needed to force and inspect them.

The content slice is not done if it only adds loot, if conditions are hidden HP penalties, if quarantine is decorative, or if morgue content has no mechanical consequence.
