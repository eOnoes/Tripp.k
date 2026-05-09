# TraceDroneMap Contract v0.1

## Purpose

`TraceDroneMap` is Tripp.g's read-only boundary map. It identifies likely owner files, related files, tests, rollback surface, evidence, warnings, and terminal verification state before retrieval can become edit preparation.

Trace maps are evidence inputs. They do not authorize execution, planning, implementation, shell calls, edits, or routing decisions.

## Required Top-Level Fields

```yaml
role: "Trace.Drone"
status: "boundary_map"
readOnly: true
executionAllowed: false
planningAllowed: false
implementationAllowed: false
task: string
owners: OwnerItem[]
related: string[]
chain_effects: string[]
tests: string[]
forbidden: string[]
rollback_surface: RollbackSurface
confidence: number
confidenceLabel: none | weak | medium | strong
evidence: EvidenceItem[]
warnings: string[]
trace:
  traceId: string
  source: "trace-drone"
traceVerification: TraceVerification
```

Default forbidden paths:

```yaml
- node_modules/
- .git/
- dist/
- build/
- coverage/
- generated/
- vendor/
```

## Owner Item

```yaml
file: string
confidence: number # 0.10 to 0.95
reason: string
role: source_of_truth | controller | dependency | legacy | supporting | unknown
signals: string[]
```

Common signals include:

- `basename_match`
- `inspect_source_bias`
- `path_segment_match`
- `content_token_match`
- `symbol_match`
- `section_match`
- `prompt_surface_hint`
- `ui_layout_stylesheet`

## Evidence Item

```yaml
file: string
signals: string[]
score: number
note: string
warning: string
```

Ranked file evidence should include `file`, `signals`, and `score`. Manifest warning evidence should include `warning`.

## Rollback Surface

```yaml
files: string[]
tests: string[]
scope: bounded_owner_surface | broad_owner_surface | unresolved | none
note: string
```

Scope meanings:

- `bounded_owner_surface`: four or fewer owners, focused enough for exact native reads.
- `broad_owner_surface`: more than four owners, likely needs tightening before edits.
- `unresolved`: no owner file was found.
- `none`: task is empty or no useful surface exists.

The rollback note must be actionable. Filler guidance is not acceptable.

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

| State | Meaning | Supervisor Action |
| --- | --- | --- |
| `TRACE_PASS` | First pass succeeded without warnings. | Proceed to exact native reads or edit prep. |
| `TRACE_PASS_WITH_WARNINGS` | Map is usable but has missing tests, docs-only retrieval, mock mode, or other cautions. | Surface warnings and require inspector review before edits. |
| `TRACE_TIGHTENED_PASS` | A tightened retry succeeded after the first surface was weak or broad. | Proceed with focused caution. |
| `TRACE_ESCALATE` | Blocking issues exist, but some files were found. | Block edits and escalate. |
| `TRACE_UNRESOLVED` | No owner surface, or confidence remains below threshold. | Block edits and require rephrase or manual file identification. |

## Downstream Rules

### `tripp.supervisor`

- `traceVerification.pass` must be true before the map can support action.
- Allowed terminal states are `TRACE_PASS`, `TRACE_PASS_WITH_WARNINGS`, and `TRACE_TIGHTENED_PASS`.
- Target edit files must be inside `rollback_surface.files`.
- `unresolved` or `none` rollback scope is a hard block.
- `broad_owner_surface` requires inspector review and human confirmation.
- `weak` or `none` confidence blocks edits.
- `medium` confidence can proceed only with inspector review.
- `strong` confidence can proceed to exact native reads.
- `legacy` owners block edits on that file.

### `tripp.auditor`

- `readOnly` must be true.
- `executionAllowed`, `planningAllowed`, and `implementationAllowed` must be false.
- `trace.source` must be `trace-drone`.
- Forbidden paths in owners deny approval.
- `docsOnly: true` denies edit approval, but is acceptable for retrieval-only questions.
- Retry discipline is audited through `attempts`, `tightened`, and `previous`.

### `tripp.inspector`

- Four or fewer owners is preferred.
- More than four owners without a tightened retry creates an actionability warning.
- Missing tests creates an actionability warning.
- Chain effects should be specific enough to explain blast radius.
- Zero-score owners are context noise.
- Rollback notes must be actionable.

### `tripp.echo`

Echo renders:

- clickable owners with confidence badges and reason tooltips
- related files
- test coverage indicator
- confidence meter
- terminal state badge
- rollback surface banner
- chain effect tags
- warning banner
- trace ID footer
- verification checks table

## Minimum Viable Mock Behavior

Until real `traceDrone.js` wiring exists, the mock must preserve contract semantics:

| Contract Element | Mock Behavior |
| --- | --- |
| `role` | Hardcode `Trace.Drone`. |
| permissions | Hardcode read-only true and all execution/planning/implementation flags false. |
| `owners` | Return two to four files using simple task-token and basename matching. |
| `related` | Return non-owner files connected to the owner surface. |
| `tests` | Return verifier or test files when found. |
| `forbidden` | Use the standard forbidden list. |
| `rollback_surface` | Include owners plus the top related files, capped to a bounded surface. |
| `confidence` | Use `0.55+` when owners are found and `0.05` when unresolved. |
| `evidence` | Include one evidence item per owner. |
| `warnings` | Include `mock Trace.Drone map; real trace runtime is not wired yet`. |
| `traceVerification` | Compute pass, terminal state, warnings, blocking, and checks from the mock data. |

Mock mode must still respect: no execution, no editing, no model calls, and no routing decisions.

## Example Decision

Task: `Where is Munch health exposed?`

Expected behavior:

- Owner surface can include `server.mjs` and Munch contract docs.
- `TRACE_PASS_WITH_WARNINGS` is acceptable because mock mode and missing tests may be present.
- `docsOnly: true` is acceptable for retrieval-only tasks.
- If the task changes to `edit Munch health`, `docsOnly: true` becomes a hard auditor block until an implementation owner is identified.

Supervisor summary:

Retrieval-only questions may proceed to exact native reads from a docs-only map. Edit-oriented tasks require implementation ownership, rollback surface, and policy approval before any mutation path opens.
