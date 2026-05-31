# Rework Floor 09: Перекрестки

Route id: `manhattan_crossroads`. Z: `+8`. Base floor: `KVARTIRY`. Owned source: `src/gen/design_floors/manhattan_crossroads.ts`.

## Problem

The roads and crossings are already one of the good parts. The problem is that roads need traffic: gangs, patrols, traders, queues, ambushes and monsters moving through wrong turns. A dozen actors cannot sell an urban-crossroads floor.

## Rework Target

Make Crossroads a dense near-zero social/combat route: big NPC traffic, wild gangs, liquidator control posts, citizen queues, monsters in wrong turns and service lanes.

Population targets:

- NPC field: `2200..4200`;
- NPC mix: citizens/travelers, wild gangs, liquidator traffic control, traders;
- monsters: `500..1200`;
- level/loot: low-to-medium civilians near center, higher at wrong exits and gang roads.

## Gameplay Identity

The player should choose routes through a living road grid: pay crossing toll, follow convoy, rob/avoid wild gangs, escort someone over a zebra crossing, steal from cargo, fight at a wrong exit or reroute traffic control.

Do not make it just Kvartiry with road textures. Roads should create sightlines, choke points, traffic islands, ambush corners and alternate exits.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=3200`, `monsterTarget=850`, social placement with a strong wild-gang share. Road traffic, pedestrians, toll bodies and background gang pressure are generic A-Life templates.

Use road-side room mapping, intersection zones, alleys, barricades and faction control to shape the field. Gang leaders, traders and convoy actors are authored only when they own interactions or consequences.

## Implementation Notes

- Tune crowd placement along roads, queues, markets and control islands.
- Express gang pressure through side-street rooms, zones and wrong-turn loops.
- Express monster pressure through cargo dead zones, underpasses, closed exits and false road signs.
- Use bucket limits so roads are busy but pathable.
- Existing named quest NPCs should stay stable; broad traffic should be A-Life-friendly.

## Samosbor

Samosbor should turn traffic against the player: crossings reverse, signs lie, mobs panic, gangs exploit blocked roads, monsters spill from wrong exits. Aftermath can leave barricades, dead traffic lines or temporary shortcuts.

## Verification

- Crossroads has thousands of NPCs without exceeding cap or blocking all roads.
- Wild gangs are visible as band clusters, not random lone actors.
- At least three route decisions remain playable.
- Run `npm run check`.
