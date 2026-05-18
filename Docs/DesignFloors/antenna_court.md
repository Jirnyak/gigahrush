# Design Floor: Антенный двор

Status: planning artifact. Future route id: `antenna_court`. Future anchor: `z=-32`.

Planned owned file: `src/gen/design_floors/antenna_court.ts`.

## Role

An indoor courtyard of antennas, cables, radio booths and false horizon murals. This floor listens to other floors and sometimes broadcasts them back. It is a signal hub between Roof, Ministry, Metro/Error Line, Market 88 and Void protocols.

Primary decisions: tune, jam, record, sell, repair, expose, hide from patrols.

## Generation

- Courtyard-like open central grid with antenna masts as obstacles.
- Side rooms: radio club, relay booth, monitoring archive, battery closet, operator dorm.
- Use long corridors with sound clues rather than huge maze.
- Add screens/posters where existing procedural screen texture can show signal warnings.

## NPCs

- `antenna_pasha_grown`: radio operator who may connect to School ОБЖ hooks.
- `antenna_mirra_jammer`: sells jamming time and route rumors.
- `antenna_captain_krug`: Ministry signal inspector.
- `antenna_echo_zhenya`: NPC who repeats lines from wrong floors.

## Quests

- `antenna_tune_floor`: tune to a chosen floor tag; reward is a clue, not full map reveal.
- `antenna_jam_raid`: temporarily reduce Market 88 raid pressure or increase suspicion.
- `antenna_record_void`: capture an impossible signal for Yakov; may add PSI backlash.
- `antenna_battery_theft`: steal a battery from a guarded closet or earn it by repair.

## Systems

State should be compact:

```txt
signalQuality: 0..5
jamUntilHour
lastTunedRouteId
recordedAnomalyFlags
```

No live radio simulation. Signals update on interaction, samosbor, floor transition or director beat.

## Cross-Floor Hooks

- Roof antenna repair improves signal quality.
- Ministry inspections increase risk if illegal recordings exist.
- Metro and numbered floors can use tuned signal as entry hint.
- Void/Darkness can corrupt one recorded signal.

## DoD

- Player can tune one signal and receive a useful route/quest clue.
- Jamming has a bounded consequence and event log entry.
- Debug prints signal quality, tuned id and corruption flags.

