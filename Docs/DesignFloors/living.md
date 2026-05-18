# Design Floor: Жилой

Status: planning artifact for expanded design-floor version. Current code already has `FloorLevel.LIVING`; README remains source of truth.

Future route id: `living`. Future anchor: `z=0`. Existing reference: `src/gen/living/`.

## Role

Living is the player hub and everyday survival floor. It must remain readable, useful and emotionally grounded. It gives the player supplies, social stakes, training, early quests, repair errands, rumors and returns from harder floors.

Primary decisions: help neighbor, prepare expedition, trade, steal, repair, learn, sleep/hide, decide route.

## Generation

Use current Living generator as base:

- apartments, tutorial act hall, armory, Yakov, Vanka, market, library, temple, school, hospital and other POIs;
- `aptMask` protection for permanent content;
- zone content registry and side quests;
- no DOM-heavy UI or safe-hub overgrowth.

## NPCs

Existing plot NPCs remain the anchor. Expanded route-scale NPCs:

- `living_route_keeper_olga`: explains design-floor route rumors without becoming menu UI.
- `living_pack_rat_misha`: lost property and item recovery hook.
- `living_door_repair_anya`: hermodoor repair and shelter prep.
- `living_return_witness`: reacts to where player came back from.

## Quests

- `living_prepare_expedition`: gather water/ammo/filter/document before chosen floor.
- `living_return_evidence`: bring proof from another design floor for a grounded reward.
- `living_hermodoor_repair`: improve one shelter before samosbor.
- `living_lost_property`: return or keep a recovered item.

## Samosbor

Living samosbor should teach without trivializing: shelter choice, door repair, neighbor rescue, aftermath shortages and rumors. It should remain survivable but costly if ignored.

## Cross-Floor Hooks

- Every design floor can send return evidence here.
- Market 88, Communal Ring, Kvartiry and Production change Living scarcity.
- Roof/Antenna signals can appear as radio lines.
- Darkness can threaten the hub but must not permanently brick it.

## DoD

- Player can choose an expedition target and receive concrete preparation hints.
- Return from another floor creates visible log/NPC/consequence.
- Hub remains playable after multiple samosbor events.

