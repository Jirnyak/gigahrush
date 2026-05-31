# Expansion 10 Integration Contract: Void Afterprotocol

Версия: 0.1 planning  
Agent: EXP10_VOID  
Goal: additive interfaces for Void protocols, local effects, backlash and world log

## Boundary

This contract describes future code shape. It does not require code changes in this planning pass. Implementation must not rewrite samosbor, A-Life, save/load, dialogue or previous expansions to serve Void protocols. Each integration point is an adapter or event consumer with a bounded return value.

The owning system for protocol application is `src/systems/void_protocols.ts`. Data lives in `src/data/void_protocols.ts`. The `VOID` room or plot hook grants protocol ownership, but it does not apply effects. Samosbor, world log, debug, NPC memory and route/document systems only observe or query marks.

## Director Integration

Companion contract: `director_hooks.md` defines how Expansion 10 registers Samosbor Director beats, signal facts, chain slots, trace fields and debug validation. The director may schedule late unlock, `seal_seam` target hint, backlash reveal and trace echo beats. It must not apply protocols directly, scan for anchors, rewrite samosbor or mutate archive/NPC/route systems without their owning adapters.

The Void protocol system remains authoritative for ownership, cooldowns, target validation, marks, backlash and `VoidProtocolTrace`. Director trace can cross-reference protocol state by `protocolId`, `markId`, `targetKey` and `voidTraceId`, but it is not a replacement for the Void black box.

## Core Types

```typescript
export type VoidProtocolId =
  | 'seal_seam'
  | 'restore_record'
  | 'quiet_room'
  | 'tenant_memory'
  | 'blind_elevator'
  | 'market_erasure'
  | 'line_stabilizer';

export type VoidTargetScope = 'door' | 'room' | 'zone' | 'npc' | 'route' | 'document';

export type VoidBacklashKind =
  | 'route_degraded'
  | 'silent_warning'
  | 'false_record'
  | 'fear_memory'
  | 'wrong_detour'
  | 'defective_neighbor'
  | 'void_tagged_spawn';

export interface VoidProtocolDef {
  id: VoidProtocolId;
  name: string;
  shortName: string;
  targetScope: VoidTargetScope;
  anchorTags: readonly string[];
  costTags: readonly string[];
  effectKind: string;
  backlashKind: VoidBacklashKind;
  cooldownHours: number;
  traceSeverity: 3 | 4 | 5;
  minStoryFlag?: string;
  debugOnly?: boolean;
}
```

`effectKind` stays string-like only if the resolver maps it through a finite switch. No data-defined arbitrary callbacks. The catalog must be readonly and import-safe.

## Target And Anchor Request

```typescript
export interface VoidProtocolTarget {
  scope: VoidTargetScope;
  key: string;
  floor: FloorLevel;
  zoneId?: number;
  roomId?: number;
  x?: number;
  y?: number;
  entityId?: number;
  routeId?: string;
  documentId?: string;
  tags: readonly string[];
}

export interface VoidProtocolApplyRequest {
  protocolId: VoidProtocolId;
  target: VoidProtocolTarget;
  anchorTags: readonly string[];
  source: 'player' | 'debug' | 'plot' | 'void_room';
  now: number;
}

export type VoidProtocolRejectReason =
  | 'unknown_protocol'
  | 'not_owned'
  | 'cooldown'
  | 'wrong_scope'
  | 'missing_anchor'
  | 'target_too_far'
  | 'unsupported_adapter'
  | 'story_gate'
  | 'invalid_target'
  | 'state_full';

export interface VoidProtocolApplyResult {
  ok: boolean;
  rejectReason?: VoidProtocolRejectReason;
  markId?: number;
  traceId?: number;
  backlashId?: number;
}
```

The current interact target can be built by `debug.ts`, `main.ts` interaction code or a future target resolver. It must not scan the whole world. It reads the cell/entity/document under interaction range and emits one candidate.

## State Contract

```typescript
export interface VoidProtocolState {
  owned: VoidProtocolId[];
  cooldownUntil: Partial<Record<VoidProtocolId, number>>;
  marks: VoidProtocolMark[];
  traces: VoidProtocolTrace[];
  nextMarkId: number;
  nextTraceId: number;
}

export interface VoidProtocolMark {
  id: number;
  protocolId: VoidProtocolId;
  target: VoidProtocolTarget;
  appliedAt: number;
  expiresAt?: number;
  pendingSamosborCount?: number;
  effectState: 'armed' | 'consumed' | 'expired';
  backlash: VoidBacklashState;
}

export interface VoidBacklashState {
  id: number;
  kind: VoidBacklashKind;
  state: 'armed' | 'visible' | 'resolved' | 'expired';
  targetKey?: string;
  floor: FloorLevel;
  zoneId?: number;
  roomId?: number;
  createdAt: number;
  resolvedAt?: number;
}

export interface VoidProtocolTrace {
  id: number;
  protocolId?: VoidProtocolId;
  type:
    | 'void_protocol_obtained'
    | 'void_protocol_rejected'
    | 'void_protocol_applied'
    | 'void_effect_consumed'
    | 'void_backlash_armed'
    | 'void_backlash_resolved'
    | 'void_trace_dumped';
  time: number;
  floor: FloorLevel;
  zoneId?: number;
  roomId?: number;
  targetKey?: string;
  backlashKind?: VoidBacklashKind;
  severity: 0 | 1 | 2 | 3 | 4 | 5;
  dedupeKey: string;
  flags: number;
}
```

All arrays are bounded. If the project already has a ring buffer helper, use it. If not, implement small fixed push-with-overwrite logic. Old saves normalize `voidProtocols` to empty state.

## Public API

```typescript
export function normalizeVoidProtocolState(state: GameState): void;

export function grantVoidProtocol(
  state: GameState,
  protocolId: VoidProtocolId,
  source: 'debug' | 'plot' | 'void_room',
): VoidProtocolApplyResult;

export function applyVoidProtocol(
  state: GameState,
  request: VoidProtocolApplyRequest,
): VoidProtocolApplyResult;

export function getVoidMarksForTarget(
  state: GameState,
  targetKey: string,
): readonly VoidProtocolMark[];

export function getVoidMarksForZone(
  state: GameState,
  floor: FloorLevel,
  zoneId: number,
): readonly VoidProtocolMark[];

export function onVoidSamosborEvent(
  state: GameState,
  event: VoidSamosborHookEvent,
): void;

export function pushVoidTrace(
  state: GameState,
  trace: Omit<VoidProtocolTrace, 'id'>,
): VoidProtocolTrace;
```

No consumer should mutate `VoidProtocolState` except through these functions. Direct field reads are acceptable for debug displays.

## Samosbor Hook

```typescript
export type VoidSamosborHookEvent =
  | {
      type: 'samosbor_warning' | 'samosbor_started' | 'samosbor_ended';
      floor: FloorLevel;
      zoneId?: number;
      time: number;
      variantId?: string;
    }
  | {
      type: 'door_seal_check';
      floor: FloorLevel;
      zoneId: number;
      roomId?: number;
      targetKey: string;
      x: number;
      y: number;
      baseReliability: number;
      time: number;
    };
```

The samosbor system asks a local question and receives no giant object graph. For `seal_seam`, a door check can receive a small modifier result:

```typescript
export interface VoidDoorModifier {
  reliabilityAdd: number;
  holdSecondsAdd: number;
  consumeMarkId?: number;
  traceId?: number;
}
```

If adding a return value to samosbor is too invasive, the first implementation can use event-only reporting: samosbor publishes `door_seal_check`, `void_protocols` writes a trace and a post-effect mark, and actual mechanical improvement is deferred. That is lower-quality MVP and must be marked incomplete until a visible door effect exists.

## Backlash Resolver

Backlash selection is local. The resolver can inspect current target room, neighbor doors in a short radius, zone id, route adapter or document adapter. It must never scan all 1024x1024 cells.

```typescript
export interface VoidBacklashCandidate {
  key: string;
  kind: VoidBacklashKind;
  floor: FloorLevel;
  zoneId?: number;
  roomId?: number;
  x?: number;
  y?: number;
  score: number;
  reason: string;
}

export interface VoidBacklashAdapter {
  kind: VoidBacklashKind;
  collectCandidates(state: GameState, mark: VoidProtocolMark): readonly VoidBacklashCandidate[];
  apply(state: GameState, mark: VoidProtocolMark, candidate: VoidBacklashCandidate): void;
}
```

MVP includes local candidates for `route_degraded` and `silent_warning`. Other adapters may return empty arrays. Empty candidates produce a trace `void_backlash_armed` with reject flag and a safe fallback `silent_warning` in the same zone.

## World Log And Event Contract

Void protocols should publish structured facts through existing `WorldEvent` if available. If the current code only exposes message log helpers, `pushVoidTrace` writes trace first and calls the existing message/log consumer second. Text is a view, not the source of truth.

Recommended event shape:

```typescript
export type VoidWorldEventType =
  | 'void_protocol_obtained'
  | 'void_protocol_applied'
  | 'void_effect_consumed'
  | 'void_backlash_resolved';

export interface VoidWorldEventData {
  protocolId?: VoidProtocolId;
  targetScope?: VoidTargetScope;
  targetKey?: string;
  backlashKind?: VoidBacklashKind;
  markId?: number;
  traceId?: number;
}
```

Event severity: obtained 3, applied 4, effect consumed 4, backlash resolved 4 or 5 if it affects a critical route. Privacy is usually `local` or `public` for visible samosbor consequences. `secret` is acceptable only for hidden false records, and debug must still show it.

## NPC Memory And Dialogue Contract

NPC memory is a consumer, not a dependency. The protocol system can emit a compact fact:

```typescript
export interface VoidNpcMemoryFact {
  kind: 'void_protocol_seen' | 'door_saved' | 'false_record_seen' | 'impossible_memory';
  protocolId: VoidProtocolId;
  targetKey?: string;
  fearDelta: number;
  trustDelta: number;
  suspicionDelta: number;
  expiresAt?: number;
}
```

If `npc_memory.ts` is absent or not ready, the adapter no-ops and world log carries the player feedback. Dialogue must respect existing priority: danger and needs before protocol lore; plot `talkLines` before generated protocol barks.

## Cross-Expansion Adapter Contract

Expansion 10 is late glue, but it must not import every previous expansion directly. Each optional system exposes or receives a small adapter:

```typescript
export interface VoidProtocolAdapter {
  id: string;
  supportsTarget(target: VoidProtocolTarget): boolean;
  validateAnchor(state: GameState, target: VoidProtocolTarget, anchorTags: readonly string[]): boolean;
  applyLocalEffect?(state: GameState, mark: VoidProtocolMark): void;
  collectBacklashCandidates?(state: GameState, mark: VoidProtocolMark): readonly VoidBacklashCandidate[];
}
```

Adapters register from their owning modules or are listed in `void_protocols.ts` with optional imports only if the current project style supports it. Missing systems return `unsupported_adapter`, not compile-time dependency demands.

## Debug Contract

Debug commands call public API only. They print target eligibility, reject reasons, cooldowns, marks and traces. Debug may bypass story gates with explicit source `debug`, but it must still write trace so testers can see artificial setup.

Required debug data per active mark: mark id, protocol id, target key, floor, zone, state, backlash kind, backlash target, age, cooldown. Required reject print: protocol id, reason, current target tags, required anchor tags.

## Black Box Telemetry

```typescript
export interface VoidTelemetryEntry {
  frameOrTick: number;
  time: number;
  floor: FloorLevel;
  zoneId: number;
  protocolHash: number;
  targetHash: number;
  effectState: number;
  backlashState: number;
  samosborPhase: number;
  flags: number;
}
```

Runtime keeps exactly 300 entries in a circular buffer. On impossible state, NaN, missing target for armed mark, or adapter exception, dump to `gatbage/history/agent_logs/Dump_EXP10_VOID.bin` if the runtime environment permits file writes; otherwise expose copyable debug output. The dump is diagnostic, not gameplay save.

Estimated overhead: one telemetry write on protocol events and samosbor hook events should target 3-8 us on low-end hardware. No per-frame write is required unless protocol debug overlay is active.

## Performance Contract

No per-frame global scans. No unbounded arrays. No JSON serialization during active gameplay except save/debug. No continuous VOID simulation. Candidate search is limited to current target, room, small radius or zone aggregate. Protocol visuals are cheap masks, palette shifts and sprite overlays.

Expected costs: apply command 20-60 us low tier, samosbor event response 50-120 us middle tier, debug trace formatting variable but debug-only, idle cost 0 us except checking a small active mark list when an owning system emits a relevant event.

## Verification Contract

Implementation is acceptable when these checks pass: build succeeds; old save loads with empty protocol state; debug grant/list/apply works; invalid target returns typed reject; valid `seal_seam` creates mark and trace; samosbor consumes or observes mark; backlash resolves locally; traces are bounded; baseline samosbor without marks is unchanged; no previous expansion becomes required for compile.
