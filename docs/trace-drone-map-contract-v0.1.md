# TraceDroneMap Contract v0.1

## Purpose

`TraceDroneMap` is the read-only boundary map used by Tripp.g before retrieval output can become edit planning. It identifies likely owner files, related files, tests, rollback surface, evidence, warnings, and terminal verification state.

Trace maps are evidence inputs. They do not authorize execution.

## Top-Level Shape

```yaml
traceId: string
role: Trace.Drone
status: boundary_map
readOnly: true
executionAllowed: false
planningAllowed: false
implementationAllowed: false
task: string
owners: []
related: []
tests: []
chain_effects: []
forbidden: []
rollback_surface: {}
confidence: number
confidenceLabel: none | weak | medium | strong
evidence: []
warnings: []
trace:
  traceId: string
  source: trace-drone
traceVerification: {}
```

## Owner Item

```yaml
file: string
confidence: number
reason: string
role: source_of_truth | controller | dependency | supporting | legacy | unknown
signals: string[]
```

## Evidence Item

```yaml
file: string
signals: string[]
score: number
note: string
```

## Rollback Surface

```yaml
files: string[]
tests: string[]
scope: bounded_owner_surface | broad_owner_surface | unresolved
note: string
```

## Trace Verification

```yaml
pass: boolean
terminalState: TRACE_PASS | TRACE_PASS_WITH_WARNINGS | TRACE_TIGHTENED_PASS | TRACE_ESCALATE | TRACE_UNRESOLVED
tightenAllowed: boolean
warnings: string[]
blocking: string[]
checks:
  confidence: number
  ownerCount: number
  testsPresent: boolean
  docsOnly: boolean
  forbiddenHit: boolean
  broadSurface: boolean
attempts: number
tightened: boolean
previous: object | null
```

## Terminal States

- `TRACE_PASS`: owner surface is bounded, confidence is strong enough, and no blocking issues exist.
- `TRACE_PASS_WITH_WARNINGS`: usable map with non-blocking warnings, such as missing tests.
- `TRACE_TIGHTENED_PASS`: first pass was broad or weak, but tightened retry produced a usable map.
- `TRACE_ESCALATE`: blocking issue requires supervisor, auditor, inspector, or human review.
- `TRACE_UNRESOLVED`: no useful owner surface was found.

## Downstream Use

`tripp.supervisor` uses trace verification in the evidence gate.

`tripp.auditor` checks forbidden paths, terminal states, and rollback surface.

`tripp.inspector` checks actionability, breadth, and whether whole-file escalation is justified.

`tripp.echo` renders owners, warnings, confidence, terminal state, and rollback surface in the workspace.

## Minimum Viable Mock Behavior

Before real Trace.Drone wiring, Tripp.g should:

- return schema-compatible trace maps from `POST /api/tripp/trace/map`
- return schema-compatible verification from `POST /api/tripp/trace/verify`
- attach mock trace maps to Munch and hybrid tasks
- keep `executionAllowed`, `planningAllowed`, and `implementationAllowed` false
- block evidence gates when trace verification is unresolved or escalated

## Example

Task: `where is Munch health exposed?`

Expected mock output:

- owner candidate: `server.mjs`
- related docs: `docs/tripcore-munch-g-integration-plan.md`
- confidence: medium
- terminal state: `TRACE_PASS_WITH_WARNINGS`
- warning: real Trace.Drone is not wired yet
