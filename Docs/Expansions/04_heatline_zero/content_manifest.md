# Expansion 04: Heatline Zero Content Manifest

Version: 0.1 planning  
Owner: EXP04_HEAT  
Purpose: concrete MVP content inventory for the Heatline Zero playable slice.

## Slice Shape

The MVP is a maintenance pocket, not a floor. It attaches to existing `MAINTENANCE` generation through one entry corridor and one optional old-boiler branch. The pocket must fit in a compact cluster so that the player can read cause and effect without a map overlay: valve, sound, steam, pressure result, route change.

The content below is deliberately finite. Any future implementation should add this slice first and only then expand into additional heat rooms.

## Heat Nodes

| Node id | Room | Initial state | Links | Player-facing purpose | DOD |
| --- | --- | --- | --- | --- | --- |
| `heat_entry_sluice` | Entry sluice from collectors | pressure 0, heat 1, valve closed | `heat_main_node`, `steam_corridor_a` | Teaches that heat is readable through lamps, hiss, and manometer text. | Player can retreat here safely after a valve mistake. |
| `heat_main_node` | Main heat node | pressure 1, heat 2, valve open | `heat_entry_sluice`, `pressure_dispatch`, `steam_corridor_a` | Central control point with Valve A and the first diagram. | Valve A changes corridor access and updates linked node pressure. |
| `steam_corridor_a` | Steam corridor | pressure 2, heat 3, valve venting | `heat_entry_sluice`, `heat_main_node`, `asbestos_storage` | Timed hazard and first route puzzle. | Corridor blocks access until Valve A creates a safe window. |
| `asbestos_storage` | Asbestos storage | pressure 0, heat 1, valve closed | `steam_corridor_a`, `emergency_shower` | Reward and protection room. | Contains one protective item or note and a safe pause. |
| `emergency_shower` | Emergency shower | pressure 0, heat 0, valve open | `asbestos_storage`, `pressure_dispatch` | Local recovery and countermeasure. | Clears or mitigates minor burns without requiring another expansion. |
| `pressure_dispatch` | Pressure dispatch room | pressure 1, heat 1, valve closed | `heat_main_node`, `emergency_shower`, `old_boiler_branch` | Debug-readable state hub and narrative explanation. | Has Valve B and a document proving fog burn is temporary. |
| `old_boiler_branch` | Old boiler branch | pressure 3, heat 3, valve jammed | `pressure_dispatch`, `fog_choked_bypass` | Optional high-risk branch for weaponized venting. | Can be skipped in MVP but its connector is reserved. |
| `fog_choked_bypass` | Fog-choked bypass | pressure 1, heat 2, valve closed | `old_boiler_branch` | Demonstrates local fog suppression. | One vent action creates a temporary fog-safe crossing, then expires. |

## Rooms

| Room | Required fixtures | Gameplay role | Risk rule |
| --- | --- | --- | --- |
| Entry sluice | Red lamp, warning sign, pipe wall, one-cell door | Safe baseline and return point. | Must never be converted into unavoidable damage. |
| Main heat node | Valve A, manometer, schematic board, noisy pipe | Main interaction room. | Valve result must be immediate and visible in linked rooms. |
| Steam corridor | Steam strips, wet floor, hot pipe wall, scorch decal | Timed crossing and damage lesson. | Warning must precede lethal damage; safe window required. |
| Asbestos storage | Shelves, damaged respirator, asbestos wrap, work note | Reward, resource, and visual tone. | Protective item cannot trivialize every steam hazard. |
| Emergency shower | Shower feature, drain, contaminated water label | Burn mitigation and safe decision point. | It mitigates heat but may carry water/fog risk later. |
| Pressure dispatch | Desk, panel, Valve B, logbook, wall diagram | Explains pressure graph and fog interaction. | Text must be short; debug state carries exact data. |
| Old boiler branch | Locked grate, pulsing boiler, jammed valve | Optional danger and future mini-boss hook. | MVP can leave it as high-risk branch, not mandatory route. |
| Fog-choked bypass | Purple fog patch, hot pipe seam, vent outlet | Demonstrates steam vs fog. | Fog suppression is local and temporary. |

## NPCs

| NPC | Location | Function | Interaction payload | DOD |
| --- | --- | --- | --- | --- |
| Захар Манометр | Pressure dispatch | Dispatcher and heat-node explainer. | Gives valve order and warns that pressure is discrete, not realistic. | Player can learn which valve affects which route without reading code. |
| Лидия Паровая | Steam corridor edge | Burned worker and hazard witness. | Warns that safe windows are short and steam draws monsters. | Her line teaches timing and noise consequence. |
| Рая Асбестова | Asbestos storage | Quartermaster survivor. | Trades or points to asbestos wrap and a damaged respirator. | Protective content exists but has limited scope. |
| Гриша Душевой | Emergency shower | Injured maintenance worker. | Explains shower relief and contaminated water risk. | Player understands shower as recovery, not full heal shrine. |
| Борис Давленко | Main heat node or old boiler branch | Mechanic tied to Valve A. | Gives a repair-side quest later; MVP uses him as state feedback. | He reacts differently to low and high pressure. |
| Ликвидатор Кипяток | Fog-choked bypass | Faction pressure and weaponized steam warning. | Says steam can clear fog locally but not cleanse a zone. | Prevents player expectation of global fog removal. |

## Hazards

| Hazard id | Trigger | Effect | Counterplay | Limits |
| --- | --- | --- | --- | --- |
| `steam_blocker` | Node heat 2+ and valve `venting` in corridor. | Blocks line of sight and route confidence; may damage on entry. | Change Valve A or wait for safe window. | Does not run volumetric simulation. |
| `scald_tick` | Player remains in active steam zone. | Periodic HP damage and burn status text. | Retreat, shower, asbestos wrap. | Damage interval and maximum burst are capped. |
| `pressure_spike` | Linked node reaches pressure 3 after valve change. | Warning, noise event, possible temporary blockage. | Vent at dispatch or avoid old boiler branch. | No random explosion in first MVP. |
| `fog_burn_window` | Valve B or old boiler vent targets fog bypass. | Temporary fog reduction in a tiny room/radius. | Cross quickly; fog returns. | Never clears zone ownership or permanent samosbor state. |
| `hot_metal_noise` | Valve use or pressure spike. | Monster attention event or spawn-risk marker. | Use timing and retreat route. | Noise is local; no global monster scan. |
| `contaminated_shower` | Shower used during wet/electric samosbor variant later. | Minor sickness risk or warning message. | Optional future integration with medical systems. | MVP can be message-only. |

## Documents

| Document id | Found in | Content function | Mechanical hint |
| --- | --- | --- | --- |
| `heat_valve_scheme_04` | Main heat node | Simple schematic of Valve A and Valve B routes. | Shows that opening one passage raises pressure elsewhere. |
| `burn_log_shift_12` | Emergency shower | Injury record from a previous steam event. | Teaches that shower mitigates burns but is not perfect. |
| `dispatch_pressure_notice` | Pressure dispatch | Official notice about pressure states `0..3`. | Confirms discrete states and debug terminology. |
| `fog_burn_memo` | Fog-choked bypass or dispatch | Liquidator memo on steam against fog. | States local, temporary fog suppression only. |
| `asbestos_inventory_card` | Asbestos storage | Inventory joke with actual item clue. | Points to limited heat protection. |
| `old_boiler_red_tag` | Old boiler branch | Lockout warning and future boss hook. | Explains jammed valve and optional danger. |

## Debug Commands

| Command | Purpose | Output contract | DOD |
| --- | --- | --- | --- |
| `heat:list` | List all heat nodes in current world. | Node id, room id/name, pressure, heat, valve state. | Confirms graph exists and is bounded. |
| `heat:nearest` | Inspect nearest node to player. | Same as list plus linked node ids and cooldown. | Lets tester verify player-facing room state. |
| `heat:set-valve <nodeId> <state>` | Force valve state. | Acknowledgement plus affected linked nodes. | Reproduces route states deterministically. |
| `heat:vent <nodeId>` | Force vent event. | Damage zone, fog request, noise event summary. | Tests steam and fog interaction without waiting. |
| `heat:cool-all` | Reset heat and pressure in current pocket. | Count of nodes reset. | Allows repeatable manual test. |
| `heat:dump` | Dump telemetry ring. | Last 300 entries or a bounded file path. | Black-box evidence exists for failures. |

## MVP Route

The intended test route starts in `heat_entry_sluice`, moves into `heat_main_node`, reads `heat_valve_scheme_04`, turns Valve A, crosses `steam_corridor_a` during the safe window, collects or reads in `asbestos_storage`, reaches `emergency_shower`, enters `pressure_dispatch`, turns Valve B, observes a local `fog_burn_window`, and confirms that fog returns after the timer. The old boiler branch stays optional unless implementation time allows one weaponized steam moment against a monster.

## Content DOD

| Area | Pass condition |
| --- | --- |
| Nodes | At least five runtime nodes, two linked valves, one fog target, one safe retreat. |
| Rooms | Functional rooms remain enclosed by wall-door-wall grammar. |
| NPCs | At least two NPCs teach mechanics; all six names are reserved for future content. |
| Hazards | Steam damage is readable, bounded, and avoidable. |
| Documents | At least four documents exist before expanding lore. |
| Debug | Commands expose node state and can force the full MVP loop. |

## Risks

| Risk | Failure mode | Countermeasure |
| --- | --- | --- |
| Hidden engineering puzzle | Player cannot predict pressure result. | Discrete states, direct links, diagram, HUD state names. |
| Free anti-fog exploit | One valve clears a whole zone. | Tiny radius, timer expiry, no zone ownership change. |
| Renderer conflict | Steam requires renderer rewrite. | Visual contract is optional overlay/tint/noise, with text fallback. |
| Content bloat | Too many rooms before mechanic works. | Lock MVP to six required rooms plus optional boiler branch. |
| Cross-agent dependency | Heat waits on hospital, monsters, or fog refactors. | Use local status text and data requests; no direct dependency on future code. |

## Math LOD Content Rules

| Tier | Node count | NPC/content density | Hazard detail |
| --- | ---: | --- | --- |
| Low | 3-5 | Захар plus one worker, two documents. | Steam is damage room and HUD text. |
| Middle | 5-8 | Four NPCs, four documents, two valve routes. | Steam strips, fog burn window, shower mitigation. |
| High | 8-12 | All six NPCs, faction reactions, optional boiler branch. | Noise events and monster lure behavior. |
| Ultra | Same logic as high | Extra barks, richer documents, cosmetic variants. | Visual and audio excess only; no new simulation truth. |
