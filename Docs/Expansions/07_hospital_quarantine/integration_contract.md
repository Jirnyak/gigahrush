# Expansion 07 Integration Contract: Finite Medical Conditions And Save Tolerance

Статус: planning contract for future TypeScript implementation. This file defines boundaries so other agents can integrate with hospital quarantine without owning medical content.

## Ownership

Expansion 07 owns medical condition definitions, hospital-local treatment services, quarantine marks, medcard traces, morgue record definitions and hospital debug commands. It does not own global HP math, inventory core, quest core, samosbor scheduler, A-Life FSM, economy, metro, school, archive or root save infrastructure.

Integration must happen through data registration, small adapters and optional event publication. If a required global system is absent, Expansion 07 must degrade to local state and debug-triggered behavior. It must not invent direct dependencies on pending code from other agents.

## Stable Ids

Condition, service, record and room ids are lowercase snake-case strings. Once a save can contain an id, the id is stable. Renames require an explicit load alias.

```ts
export type MedicalConditionId =
  | 'bleeding'
  | 'burn'
  | 'mold_infection'
  | 'psi_exhaustion'
  | 'sedated'
  | 'quarantine_mark'
  | 'poisoned'
  | 'withdrawal'
  | 'panic_trauma'
  | `unknown:${string}`;

export type MedicalSeverity = 1 | 2 | 3;

export type MedicalConditionTag =
  | 'wound'
  | 'heat'
  | 'mold'
  | 'psi'
  | 'sleep'
  | 'quarantine'
  | 'bureaucratic'
  | 'infection'
  | 'social'
  | 'reserved';
```

`unknown:*` is a load-tolerance escape hatch. It is not used by authored content.

## Condition Definitions

```ts
export interface MedicalConditionDef {
  id: Exclude<MedicalConditionId, `unknown:${string}`>;
  name: string;
  severityMin: 1;
  severityMax: MedicalSeverity;
  tags: readonly MedicalConditionTag[];
  gameplayEffect: string;
  decaySeconds: number;
  treatmentTags: readonly string[];
  untreatedOutcome?: MedicalConditionId | 'hp_loss' | 'psi_loss' | 'collapse' | 'record_only';
  documentTrace?: MedicalRecordKind;
  debugColor?: string;
}

export interface ActiveMedicalCondition {
  id: MedicalConditionId;
  severity: MedicalSeverity;
  progress: number;
  source: string;
  appliedAt: number;
  lastTickAt: number;
  expiresAt?: number;
  flags?: number;
}
```

`progress` is normalized `0..1` for decay/treatment. Future code must clamp it on load. Active condition arrays are bounded. MVP target: player max 8, named NPC max 4. Generic NPC conditions are reserved and must be aggregate or event-driven.

## Medical Status Interface

```ts
export type MedicalOwnerKind = 'player' | 'npc' | 'room';

export interface MedicalStatus {
  ownerKind: MedicalOwnerKind;
  ownerId: string;
  conditions: ActiveMedicalCondition[];
  quarantine: QuarantineStatus;
  lastTreatmentAt?: number;
  lastCheckedAt?: number;
  recordIds?: string[];
}

export interface QuarantineStatus {
  marked: boolean;
  severity: 0 | 1 | 2 | 3;
  reason?: string;
  roomId?: number;
  expiresAt?: number;
  documentId?: string;
}
```

Consumers should query helper functions, not inspect arrays directly:

```ts
export interface MedicalRuntimeApi {
  getStatus(ownerKind: MedicalOwnerKind, ownerId: string): MedicalStatus | undefined;
  hasCondition(ownerKind: MedicalOwnerKind, ownerId: string, id: MedicalConditionId): boolean;
  applyCondition(ownerKind: MedicalOwnerKind, ownerId: string, condition: ActiveMedicalCondition): boolean;
  clearCondition(ownerKind: MedicalOwnerKind, ownerId: string, id: MedicalConditionId, reason: string): boolean;
  canUseService(ownerKind: MedicalOwnerKind, ownerId: string, serviceId: string): MedicalServiceCheck;
}

export interface MedicalServiceCheck {
  allowed: boolean;
  reason: 'ok' | 'quarantine' | 'missing_document' | 'missing_supply' | 'room_locked' | 'samosbor' | 'unknown_service';
  requiredDocumentId?: string;
  requiredItemId?: string;
  sanitarDialogId?: string;
}
```

## Treatment Services

```ts
export type MedicalServiceKind =
  | 'field_item'
  | 'dressing'
  | 'burn_shower'
  | 'infection_isolation'
  | 'psych_eval'
  | 'pharmacy'
  | 'morgue_inspection';

export interface MedicalTreatmentService {
  id: string;
  kind: MedicalServiceKind;
  roomId?: string;
  clears?: readonly MedicalConditionId[];
  reduces?: readonly MedicalConditionId[];
  applies?: readonly MedicalConditionId[];
  requiredItems?: readonly string[];
  requiredDocuments?: readonly string[];
  timeCostSeconds: number;
  riskTags: readonly string[];
  writesRecord?: MedicalRecordKind;
}
```

Services must be deterministic for a given input state and RNG seed. They may consume time/resources and write records. They must not directly move the player, rewrite global faction state or start quests without an event.

## Medical Records

```ts
export type MedicalRecordKind =
  | 'medcard'
  | 'prescription'
  | 'quarantine_notice'
  | 'infection_clearance'
  | 'psychiatric_referral'
  | 'morgue_tag'
  | 'death_record'
  | 'donor_receipt'
  | 'unknown_record';

export interface MedicalRecord {
  id: string;
  kind: MedicalRecordKind;
  ownerId?: string;
  npcId?: number;
  roomId?: number;
  conditionId?: MedicalConditionId;
  createdAt: number;
  expiresAt?: number;
  flags?: number;
  textKey?: string;
  sourceServiceId?: string;
}
```

Records are gameplay objects, not only prose. They can be represented as items, save entries or note ids, but the stable record id must survive save/load. Unknown records load as `unknown_record` and must not crash checks.

## Event Contract

Expansion 07 publishes facts; other systems may subscribe optionally.

```ts
export type MedicalEventType =
  | 'medical_condition_applied'
  | 'medical_condition_cleared'
  | 'medical_treatment_started'
  | 'medical_treatment_completed'
  | 'hospital_quarantine_started'
  | 'hospital_quarantine_cleared'
  | 'sanitar_check_failed'
  | 'medical_record_written'
  | 'morgue_record_contradiction'
  | 'hospital_variant_hook';

export interface MedicalEvent {
  type: MedicalEventType;
  tick: number;
  ownerKind?: MedicalOwnerKind;
  ownerId?: string;
  conditionId?: MedicalConditionId;
  severity?: number;
  roomId?: number;
  recordId?: string;
  serviceId?: string;
  variant?: string;
  flags?: number;
}
```

Events should use the existing world event/log path if available. If not, a local ring buffer is acceptable for MVP debug. No event can require a listener to exist.

## Director Integration

Expansion 07 exposes director hooks through local beat definitions, a compact `hospital_quarantine` signal provider and adapter-owned effects described in `director_hooks.md`. The director may select hospital beats for triage, quarantine, morgue contradictions, samosbor variant aftermath and treatment debt, but it must treat medical state, records, services and room flags as hospital-owned data.

Required director signals are scalar or bitmask facts: hospital pocket open, player condition mask, max condition severity, quarantine severity, reception queue pressure, room contamination, service availability, recent treatment/refusal/check events, morgue contradiction state, unpaid treatment debt severity and last samosbor variant. Signal collection must not scan all rooms, all NPCs, all corpse records or all inventory stacks.

Director effects are requests only: request a treatment window, write one medical record, apply one quarantine hint, contaminate one hospital room, offer one clearance route, create one capped treatment debt, request a market debt sink, scramble or reveal one morgue record, emit one rumor or seed one chain slot. The director must not directly heal the player, clear quarantine for free, mutate HP math, lock global services, spawn patrols, create loot or rewrite save fields.

Cross-expansion chain slots are optional and id-based: `steam_burn_paper_chain:hospital_triage`, `quarantine_paper_chain:sanitar_fail`, `quarantine_paper_chain:morgue_card`, `treatment_debt_industry_chain:hospital_debt`, `treatment_debt_industry_chain:market_sink`, `after_samosbor_hospital_chain:wet_infection` and `after_samosbor_hospital_chain:morgue_swap`. Missing partner expansions produce `missing_signal_provider` or `chain_consumer_missing` trace; local hospital beats must continue or reject cleanly according to their effect policy.

Trace is mandatory. Every selected or rejected hospital candidate records beat id, rejection reason, danger/relief budgets, condition hash, quarantine severity, targeted room/record when available, debt severity when relevant, samosbor variant for aftermath hooks and effect result. Debug must be able to list hospital beats, inspect provider signals, force each hospital beat, print medical status and dump record state without mutating unrelated systems.

## Save/Load Tolerance

```ts
export interface MedicalSaveV1 {
  version: 1;
  player?: MedicalStatusSave;
  npc?: MedicalStatusSave[];
  rooms?: MedicalRoomStatusSave[];
  records?: MedicalRecord[];
  aliases?: Record<string, string>;
}

export interface MedicalStatusSave {
  ownerId: string;
  conditions?: ActiveMedicalCondition[];
  quarantine?: QuarantineStatus;
  recordIds?: string[];
}

export interface MedicalRoomStatusSave {
  roomId: number;
  quarantine?: QuarantineStatus;
  contaminated?: boolean;
  disabledServices?: string[];
}
```

Load rules:

| Case | Required behavior |
| --- | --- |
| `medical` field absent | Normalize to empty V1 state. |
| `version` absent | Treat as V0 and normalize to empty unless known fields are present. |
| Unknown condition id | Convert to `unknown:<id>` or drop with one warning event; never throw. |
| Unknown record kind | Load as `unknown_record`. |
| Severity outside 1-3 | Clamp to nearest valid severity. |
| Progress outside 0-1 or NaN | Clamp finite values; replace NaN with 0 and emit debug warning. |
| Missing timestamps | Use current world tick or 0 during load, then continue. |
| Missing owner | Drop that status entry and emit debug warning. |
| Duplicate condition id on owner | Keep highest severity, newest timestamp; merge record ids. |
| Alias present | Rewrite old id to new stable id before validation. |

Save rules: do not serialize derived caches, debug-only text or per-frame telemetry. Serialize only stable statuses, room flags and records.

## Black Box Telemetry

Future implementation must keep the last 300 high-level medical/quarantine frames in a fixed circular buffer. The buffer is for state reconstruction, not analytics.

```ts
export interface MedicalTelemetryEntry {
  tick: number;
  playerConditionHash: number;
  quarantineFlags: number;
  roomId: number;
  serviceHash: number;
  eventHash: number;
  invalidFlags: number;
}
```

On invalid state, NaN, impossible severity, unknown service hard failure or corrupted save normalization, dump the buffer to `Docs/AgentLogs/Dump_EXP07_HOSPITAL.bin`. The dump path is fixed by agent id and must not write outside `Docs/AgentLogs`.

## Integration Points

| System | Allowed dependency | Forbidden dependency |
| --- | --- | --- |
| Inventory | Check/consume existing item ids through public helpers. | Directly rewrite inventory arrays from hospital service code. |
| Quests | Publish event or expose record id. | Start/finish unrelated quests directly. |
| Samosbor | Read current variant if available; apply local hospital hook. | Change global samosbor timing or fog rules. |
| A-Life | Named NPC condition/status only; generic NPC aggregate later. | Per-frame hospital pathfinding for all patients. |
| Economy | Optional price/access query by medcard/quarantine tags. | Global price mutation from treatment code. |
| Save | Optional `medical` block with normalizer. | Required new root fields without migration. |
| Debug | Register commands with narrow handlers. | Debug commands that mutate unrelated systems. |

## Runtime Budget

Medical logic runs on interaction, treatment completion, debug command, save/load and rare decay tick. It does not run per frame. The only per-frame cost allowed is HUD reading a precomputed summary.

Budget targets:

| Path | Weak hardware target |
| --- | ---: |
| `hasCondition` query | under 5 us |
| `canUseService` query | under 20 us |
| Rare player condition tick | under 40 us |
| Pocket room status tick | under 80 us |
| Telemetry write | under 5 us |
| Debug dump/format | out of frame-critical path |

## Acceptance Contract

The contract is satisfied when future code can apply and clear finite conditions, block or allow services through quarantine checks, write/load medical records, tolerate old saves and expose debug inspection without direct dependencies on unrelated expansions.

It is not satisfied by free-form string statuses, hidden HP penalties, required save fields without migration, cell-based infection spread, or medical code that directly controls global systems.
