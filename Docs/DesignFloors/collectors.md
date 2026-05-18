# Design Floor: Коллекторы

Status: planning artifact for expanded design-floor version. Current code already has `FloorLevel.MAINTENANCE`; README remains source of truth.

Future route id: `collectors`. Future anchor: `z=20`. Existing reference: `src/gen/maintenance/`.

## Role

Collectors are the wet industrial shooter expedition floor: pipes, pressure, flooded rooms, valves, outposts, rare tech loot, tube monsters and hard fights.

Primary decisions: repair, drain, reroute water, dive, fight, steal tech, escort worker, flee pressure surge.

## Generation

Use current Maintenance generator as base:

- tunnels, water channels, pressure stations, valves, heatline, metro/error line pockets, forpost;
- stronger water topology and pressure puzzles;
- clear landmarks to prevent pipe-maze fatigue.

## NPCs

Existing maintenance NPCs remain references. Add route-scale NPCs:

- `collectors_pressure_boss_varya`: controls valve permits.
- `collectors_drowned_cartographer`: maps flooded routes.
- `collectors_tube_hunter_ilyas`: tube eel counterplay and contracts.
- `collectors_water_debtor`: person who stole pressure part.

## Quests

- `collectors_open_drain`: choose who loses water when a route opens.
- `collectors_hunt_tube_eel`: kill or lure water monster.
- `collectors_pressure_bridge`: repair bridge/valves for Service or Living.
- `collectors_filter_run`: bring filters to Living/Market with contamination risk.

## Monsters

Use `TUBE_EEL`, `ROBOT`, `POLZUN`, `REBAR`, `MANCOBUS` variants where readable. Water should change encounter placement and speed, not require fluid simulation.

## Samosbor

Collectors samosbor is pressure and water: valves shut, rooms flood, steam blocks, monsters enter from pipes. Aftermath shifts water access and resource scarcity.

## Cross-Floor Hooks

- Communal Ring/Living water depends on Collector state.
- Service Floor controls pumps/lifts.
- Production uses water/pressure inputs.
- Dark Metro branches through Collector tunnels.

## DoD

- One water/pressure choice changes another floor's scarcity or access.
- Water hazards are bounded and visible.
- Floor remains navigable after samosbor.

