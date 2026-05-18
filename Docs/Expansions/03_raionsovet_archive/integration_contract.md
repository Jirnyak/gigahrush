# Expansion 03 Integration Contract: Documents, Access, Archive

Статус: technical contract для будущей реализации  
Authority: `Docs/Expansions/03_raionsovet_archive/expansion.md`, `README.md`, `desdoc.md`, `Docs/Expansions/INDEX.md`  
Boundary: только расширение существующего `MINISTRY`; `FloorLevel.ADMIN` запрещен для MVP.

## Non-Negotiable Boundary

Expansion 03 не добавляет новый floor, новый root roadmap и новые зависимости на чужие expansion-папки. Все runtime hooks должны быть optional и decoupled. Если `world_log`, containers, NPC memory или future EventBus меняются другими агентами, документы продолжают работать через локальные definitions, inventory lookup и bounded archive facts.

Для интеграции с `MINISTRY` допускаются только контент-модули и registration hooks: queue room, permit bureau, stamp room, living archive, checker post. Названия могут быть министерскими или райсоветскими, но `FloorLevel.ADMIN` не появляется в MVP. Поздний `ADMIN` должен импортировать этот contract, а не наоборот.

## Data Definitions

```ts
export type DocumentId = string;
export type AccessTag = string;

export interface DocumentPermitDef {
  id: DocumentId;
  title: string;
  issuer: string;
  accessTags: readonly AccessTag[];
  validFloors: readonly FloorLevel[];
  suspicion: number;
  forgeryDifficulty: number;
  expiresHours?: number;
  onInspectText: string;
  flags?: readonly DocumentFlag[];
}

export type DocumentFlag =
  | 'legal'
  | 'forged'
  | 'warped'
  | 'wet'
  | 'stamp_damaged'
  | 'false_order'
  | 'consumable_access'
  | 'stale_archive';

export interface DocumentInstance {
  instanceId: number;
  defId: DocumentId;
  issuedAtHour: number;
  expiresAtHour: number;
  flags: number;
  issuerNpcId?: number;
  ownerEntityId?: number;
  usesLeft?: number;
}
```

Definitions are immutable. Instances are compact. Future code should map flags to numeric bitmasks on hot path and only expand labels for inspect/debug UI.

## Access Interface

```ts
export type AccessTargetKind =
  | 'door'
  | 'npc'
  | 'container'
  | 'archive'
  | 'quest'
  | 'speaker';

export type AccessResultCode =
  | 'allow'
  | 'allow_suspicious'
  | 'deny_missing_tag'
  | 'deny_expired'
  | 'deny_floor'
  | 'deny_forgery_detected'
  | 'deny_warped'
  | 'deny_samosbor_lockdown';

export interface AccessCheckRequest {
  actorEntityId: number;
  targetId: number;
  targetKind: AccessTargetKind;
  floor: FloorLevel;
  roomId: number;
  zoneId: number;
  requiredTags: readonly AccessTag[];
  currentHour: number;
  faction?: Faction;
  samosborVariant?: string;
}

export interface AccessCheckResult {
  allowed: boolean;
  code: AccessResultCode;
  documentInstanceId?: number;
  documentDefId?: DocumentId;
  suspicionDelta: number;
  consumeUse: boolean;
  publishEvent: boolean;
  hudTextId: string;
}
```

The check is pull-based. Doors, guards, archive cards, containers and quests call the helper during interaction. There is no per-frame document validation. Missing optional systems must return deterministic denial or local fallback, never throw.

## Archive Interface

```ts
export type ArchiveQueryKind = 'npc' | 'quest' | 'event' | 'document' | 'penalty';

export interface ArchiveQuery {
  kind: ArchiveQueryKind;
  id: string;
  requesterEntityId: number;
  currentHour: number;
  accessContext?: AccessCheckRequest;
}

export interface ArchiveCard {
  queryKey: string;
  title: string;
  subjectName: string;
  lastKnownZoneId: number;
  riskLevel: 0 | 1 | 2 | 3 | 4;
  linkedAccessTags: readonly AccessTag[];
  debtTextId?: string;
  eventTextId?: string;
  reliability: 'official' | 'stale' | 'rumor' | 'warped' | 'future_dated';
}
```

Archive results are bounded summaries. Exact NPC coordinates are not part of this contract. The archive may use `worldEvents` if present, but the fallback source is static/quest/NPC facts. A query may call access first, usually requiring `archive_entry` or `personal_file`.

## Event And Telemetry Contract

```ts
export interface DocumentTelemetryEntry {
  frame: number;
  hour: number;
  actorEntityId: number;
  targetId: number;
  documentDefHash: number;
  requiredTagHash: number;
  resultCode: number;
  suspicionDelta: number;
  flags: number;
}
```

Critical document/access/archive code must keep the last 300 high-level decisions in a fixed-size circular buffer. In MVP TypeScript this can begin as a bounded numeric array. On NaN, impossible `expiresAtHour`, invalid missing def, or unknown result code, the future runtime must dump to `Docs/AgentLogs/Dump_EXP03_RAIONSOVET.bin`.

Event bridge is optional:

```ts
export type DocumentEventKind =
  | 'document_issued'
  | 'document_forged'
  | 'document_checked'
  | 'document_denied'
  | 'document_warped'
  | 'archive_query'
  | 'archive_record_warped';
```

If a central `world_log` API exists, publish concise events. If it is absent, keep local bounded telemetry and debug output.

## Director Integration

Expansion 03 exposes optional director hooks through `director_hooks.md`. The director may schedule document/access/archive beats such as legal route offers, forged-paper heat, wet stamp decay, stale archive cards, false orders and one-shot checker lockdowns. These beats are data requests into document/access/archive helpers; they must not directly create rooms, add a new floor, scan the whole inventory every frame or bypass the access contract.

The read-only signal provider is `raionsovet_archive`. It may report bounded aggregates including valid archive access, forged ministry papers, document suspicion, recent denial, recent archive query, archive reliability, queue pressure, stamp integrity, speaker-order readiness and ministry lockdown. Missing provider or missing adapter rejects dependent beats with `missing_signal_provider`; it is not a runtime failure.

Director effects must remain interaction-bound. Document corruption targets one eligible document on next access or inspect. Archive corruption changes one next query reliability field. Checker pressure changes one next access check. Cross-expansion chain payloads store only a small id such as access tag, archive query key or source beat id.

Debug validation for the director path must include forced `exp03.*` beats, visible cooldown/max-run rejection, trace payloads and proof that adapter failure consumes no cooldown. Director traces can reference EXP03 telemetry ids, but the document/access/archive black box remains the authoritative local record for access decisions.

## MINISTRY Integration Rules

`MINISTRY` generator may register rooms through small modules named by role: `raionsovet_queue`, `permit_bureau`, `stamp_room`, `live_archive`, `checker_post`. Each module should expose deterministic placement intent and graceful fallback if placement fails. No module should import future `ADMIN` symbols.

Room modules must not own access policy. They provide target ids and required tags, then call the shared access helper. This keeps guard, door, archive and container checks consistent.

NPC modules must not depend on new A-Life states. Named clerks and guards use existing NPC definitions, dialogue hooks and quest/action callbacks. Heavy social simulation is phase-later and event-driven.

Containers are optional. If `world.containers` exists, cartoteka and stamp safe use container access checks. If it does not, archive/stamp interactions use room feature prompts and item grants.

## Rules For Other Expansions

Other expansions may request documents by stable access tags, not by room implementation. Examples: mushroom sanitary form requests `sanitary_clearance`; metro route permit requests `route_permit`; hospital medcard requests `medical_record`; black market license requests `trade_license`.

Expansion 03 owns tag semantics and document checking. Other expansions own their local consequences after `AccessCheckResult`. No expansion should copy title-based checks such as `if item.name.includes("propusk")`.

## Failure Modes

If document def is missing, result is `deny_missing_tag` plus debug telemetry. If document expired, result is `deny_expired`; do not delete the item silently. If forged document is detected, result is `deny_forgery_detected`, suspicion increases, and event publishing is requested. If samosbor lockdown is active, room policy may return `deny_samosbor_lockdown` even with valid paper. If archive is corrupted, return `ArchiveCard.reliability = 'warped'` or `'future_dated'`, not null.

## Math LOD Contract

Low: no background processing, interaction-only access, static archive cards, fixed NPC clerks.

Middle: expiry, suspicion, forged/warped flags, guard reactions, two samosbor document mutations.

High: optional world events, NPC memory facts, faction modifiers, price/quest consequences.

Ultra: DATA visuals, animated lamps, perforated tape, ghosted archive cards and visual paper damage. Logic remains lookup-based.

## DOD For Integration

Integration is acceptable when one shared access function can serve a door, guard, archive and container; eight document defs exist; archive query returns a bounded card; samosbor can mutate at least two document states; debug can list/give/check/warp/query; no file or enum named `ADMIN` is required for the MVP.
