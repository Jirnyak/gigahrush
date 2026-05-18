# Design Floor: Верхнее бюро

Status: planning artifact. Future route id: `upper_bureau`. Future anchor: `z=-28`.

Planned owned file: `src/gen/design_floors/upper_bureau.ts`.

## Role

The floor above the Ministry proper: cleaner, richer, quieter and more dangerous socially. It is where approvals are pre-decided before the official queue sees them. Combat should be possible but costly; stealth, forged documents and blackmail are stronger.

Primary decisions: bribe, forge, expose, steal access, pass inspection, erase a name.

## Generation

- Wide carpeted corridors, waiting salons, record desks, executive offices, locked file rooms.
- More sightlines and guard posts than the lower Ministry, fewer crowds.
- Use existing marble/parquet/red carpet textures.
- At least one staff-only route must connect to Service Floor hooks later.

## NPCs

- `bureau_madam_iskra`: senior secretary, gatekeeper of appointments.
- `bureau_auditor_lev`: audits false papers and market licenses.
- `bureau_cleaner_tolik`: service worker with real keys.
- `bureau_visitor_anna`: citizen trying to erase a death record.

## Quests

- `bureau_preapproval`: obtain an appointment token legally or by theft.
- `bureau_cleaner_keys`: help or exploit Tolik to access staff doors.
- `bureau_audit_market88`: choose between warning Market 88 or helping the auditor.
- `bureau_erase_name`: edit a record, causing Registry Morgue and Raionsovet consequences.

## Systems

Use access flags and document ids. Do not build a separate bureaucracy system.

Potential flags:

- `upper_bureau.appointment_token`
- `upper_bureau.staff_route_known`
- `upper_bureau.audit_heat`
- `upper_bureau.name_erased`

## Samosbor

Upper Bureau shelter is excellent but politically gated. The player may enter by correct paper, bribe, forced lock or helping an NPC. Aftermath creates audit pressure, missing files or one sealed office with high-value loot.

## Cross-Floor Hooks

- Ministry consumes preapproval tokens.
- Raionsovet and Registry Morgue react to edited records.
- Market 88 can buy audit warnings.
- Floor 69 blackmail can target Bureau officials.

## DoD

- One legal route and one illegal route through the same gate.
- At least one document can be forged/stolen/earned.
- Audit heat is bounded and visible in debug/log.

