# Design Floors Index

Status: historical planning artifact that seeded the authored-floor wave. Current shipped route facts live in `README.md`, `src/data/design_floors.ts`, `src/gen/design_floors/manifest.ts` and `src/data/procedural_floors.ts`.

## Purpose

This folder turns the requested large floor wave into implementable slices for separate GPT-5.5 agents. Many `.md` files are historical floor briefs with intended TS ownership, gameplay role, NPC/quest surface, cross-floor hooks and Definition of Done. Shipped route ids and z anchors are listed below and remain subordinate to source.

The current game has 6 coded base floors, 18 routed authored design floors and procedural interstitial floors. This folder preserves original agent briefs; treat planning sections below each doc as historical when they conflict with `README.md` or shipped route data.

## Current Shipped Vertical Route

Negative z is "up" by current project convention; positive z is "down". Design-floor rows mirror `src/data/design_floors.ts`. Story-anchor rows mirror `src/data/procedural_floors.ts` and are not design-floor route ids. Procedural floors fill every z in `-44..40` that is not listed here.

| z | Kind | Route/anchor id | Display name | Base floor | Doc |
| ---: | --- | --- | --- | --- | --- |
| -44 | design | `roof` | Крыша | `MINISTRY` | [roof.md](roof.md) |
| -40 | design | `chthonic_attic` | Чердак техслужб | `MINISTRY` | [chthonic_attic.md](chthonic_attic.md) |
| -36 | design | `antenna_court` | Антенный двор | `MINISTRY` | [antenna_court.md](antenna_court.md) |
| -32 | design | `pioneer_camp` | Пионерлагерь | `LIVING` | [pioneer_camp.md](pioneer_camp.md) |
| -28 | design | `upper_bureau` | Верхнее бюро | `MINISTRY` | [upper_bureau.md](upper_bureau.md) |
| -24 | story | `FloorLevel.MINISTRY` | Министерство | `MINISTRY` | [ministry.md](ministry.md) |
| -22 | design | `bank_floor` | Банковский этаж | `MINISTRY` | [bank_floor.md](bank_floor.md) |
| -20 | design | `raionsovet_archive` | Райсовет и архив картотек | `MINISTRY` | [raionsovet_archive.md](raionsovet_archive.md) |
| -16 | design | `registry_morgue` | Морг регистраций | `MINISTRY` | [registry_morgue.md](registry_morgue.md) |
| -12 | story | `FloorLevel.KVARTIRY` | Квартиры | `KVARTIRY` | [kvartiry.md](kvartiry.md) |
| -8 | design | `manhattan_crossroads` | Перекрестки | `KVARTIRY` | [manhattan_crossroads.md](manhattan_crossroads.md) |
| -4 | design | `communal_ring` | Коммунальное кольцо | `KVARTIRY` | [communal_ring.md](communal_ring.md) |
| 0 | story | `FloorLevel.LIVING` | Жилая зона | `LIVING` | [living.md](living.md) |
| 4 | design | `floor_69` | Этаж 69 | `MAINTENANCE` | [floor_69.md](floor_69.md) |
| 8 | design | `black_market_88` | Черный рынок 88 | `LIVING` | [black_market_88.md](black_market_88.md) |
| 12 | design | `production_belt` | Производственный пояс | `MAINTENANCE` | [production_belt.md](production_belt.md) |
| 16 | design | `service_floor` | Служебный этаж | `MAINTENANCE` | [service_floor.md](service_floor.md) |
| 18 | design | `silicon_net_well` | Кремниевый НЕТ-колодец | `MAINTENANCE` | [silicon_net_well.md](silicon_net_well.md) |
| 20 | story | `FloorLevel.MAINTENANCE` | Коллекторы | `MAINTENANCE` | [collectors.md](collectors.md) |
| 24 | design | `dark_metro` | Темная пересадка | `MAINTENANCE` | [dark_metro.md](dark_metro.md) |
| 28 | story | `FloorLevel.HELL` | Мясной низ | `HELL` | [hell.md](hell.md) |
| 32 | design | `underhell` | Нижний пропускник | `HELL` | [underhell.md](underhell.md) |
| 36 | story | `FloorLevel.VOID` | Пустота | `VOID` | [void.md](void.md) |
| 40 | design | `darkness` | Темный отсек | `VOID` | [darkness.md](darkness.md) |

Historical differences now called out explicitly: the original plan put `roof` at `z=-40`, `chthonic_attic` at `z=-36`, `antenna_court` at `z=-32`, omitted `pioneer_camp`, and had no `bank_floor` stop in the Ministry/Raionsovet gap. Shipped route data has `roof` at `z=-44`, `pioneer_camp` at `z=-32`, and `bank_floor` at `z=-22`.

## Cross-Floor Spine

- Ministry and Raionsovet own documents that open roads, markets, factories and medical/morgue records.
- Manhattan Crossroads is the physical route fantasy: block grid, roads, crossings, ambushes, traffic-like flow, contracts that cross several entrances.
- Floor 69 and Market 88 share vice/debt/blackmail state, but Floor 69 must stay non-graphic and adult-only.
- Production feeds Market 88, Living scarcity, Ministry quotas and Collector repair parts.
- Service Floor and Collectors control lifts, pressure and water consequences for all lower floors.
- Hell, Underhell, Void and Darkness form the late descent: combat, ritual, protocol, then light failure. `hell` and `void` are story anchors, not design-floor route ids.
- Roof, Antenna Court and Chthonic Attic make the upward route useful: sky, signal, weather, dangerous shortcuts and false safety.

## Agent Use

Each agent touching shipped floor code should read:

1. `README.md`
2. `architecture.md`
3. `Docs/DesignFloors/floor_contract.md`
4. its own floor doc
5. nearest existing source reference under `src/gen/`

Parallel implementation prompts from the completed floor waves are now historical context in `../../appendix.md`; original prompt files are archived under `../../gatbage/Docs/DesignFloors/AgentPrompts/`. Do not recreate this prompt folder unless a new explicit orchestration batch needs it. New floor work should start from this index, the relevant floor doc, `floor_contract.md`, README, architecture and current source.

Do not update `README.md` until a floor is actually implemented and validated.
