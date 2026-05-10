# Read-Only Traceability Freshness v0.1

Status: live freshness check for the internal scoped 90% read-only planning/review claim.

## Purpose

The contract-to-runtime matrix is useful only while it stays tied to live runtime paths, verifier lanes, and UI reflection points. This freshness check prevents the trace matrix from becoming comforting but stale documentation.

## Required Controls

| Control | Contract source | Runtime symbols | Verifier lanes | UI reflection |
|---|---|---|---|---|
| Mutation denial | `read-only-contract-runtime-trace-v0.1.md` | `permissionDecision`, `recordWriteEscalationBlockedIfNeeded`, `gooseAdapterCall`, `validateGooseAdapterGates` | `gated shell`, `patch gate`, `executor: goose adapter read-only gates` | `buildShellConclusion`, `buildBlockedConclusion`, Cyst blocked rows |
| Planning-only retrieval | `read-only-contract-runtime-trace-v0.1.md` | `createMunchRetrieval`, `recordRetrievalEvent`, `createEvidenceGate` | `munch: health, retrieval, and context-map stubs`, provenance checks | `buildRetrievalConclusion`, `buildPlanningProvenance`, `MOCK_RETRIEVAL` |
| Safe shell observation | `read-only-contract-runtime-trace-v0.1.md` | `detectSafeShellCommand`, `runTaskAdapterCall`, `createTaskAdapterEvidence` | `safe shell`, longer-session and everyday mixed-session flows | `buildShellConclusion`, `SAFE_SHELL` |
| Gate scope | `read-only-contract-runtime-trace-v0.1.md` | `createReadOnlyGoNoGo`, `createReadOnlySuiteSummary`, `recordReadOnlyGateEvent` | `trials: read-only harness suite`, beta gate lanes | `buildGateConclusion`, `renderGoNoGoSummary`, `READONLY_GATE` |
| Synthesis boundaries | `read-only-contract-runtime-trace-v0.1.md` | `buildPlanningSummary`, `buildPlanningProvenance`, `buildAdversarialGuardrailConclusion` | copy-safety checks, adversarial pack, cross-surface coherence guard | Current Understanding, TASKS conclusion blocks |
| Adversarial semantics | `read-only-adversarial-pack-v0.1.md` | `detectAdversarialGuardrail`, `adversarialSemantics`, `mixed_evidence_poisoning` | adversarial read-only pack | Cyst blocked/corrected rows, Current Understanding uncertainty |

## Freshness Rules

- Every required control must name live runtime symbols.
- Every required control must name at least one active verifier lane.
- Every required control must name an operator-visible UI reflection point.
- Stale route, state, scenario, or symbol names invalidate the freshness check.
- Freshness checks must not imply runtime write capability.

## Freshness Confidence Levels

- `symbol_linked`: named runtime/UI symbols still exist.
- `runtime_linked`: verifier observed the mapped runtime behavior.
- `verifier_exercised`: verifier lane exercises the mapped control.
- `ui_reflected`: mapped UI surface has bounded copy or state.
- `end_to_end_proven`: runtime behavior, verifier lane, and UI reflection all passed.

## Critical-Control Coverage Report

The verifier emits a compact in-memory coverage report for required controls. Each row includes:

- control id
- expected runtime behavior
- mapped verifier lane
- mapped UI reflection
- freshness status
- confidence level

Required controls must reach `end_to_end_proven` for the current 90% claim to stand.

## Rollback Triggers

- a required runtime symbol is removed without updating the matrix
- a verifier lane no longer exercises the mapped runtime behavior
- a UI reflection point stops carrying the mapped truth
- Cyst, TASKS, or Current Understanding drift from the matrix
- score wording cites 90 without internal/scoped/gate-based qualifiers

## Candidate Tests

- `trace_matrix_clauses_map_to_live_runtime_paths`
- `trace_matrix_runtime_paths_map_to_active_verifier_lanes`
- `trace_matrix_verifier_lanes_map_to_ui_reflection_points`
- `traceability_fails_when_matrix_references_stale_routes_or_states`
- `required_contract_clauses_have_runtime_and_ui_reflection_for_ninety_scope`
- `critical_control_coverage_report_marks_symbol_only_vs_end_to_end_proven_controls`
- `trace_matrix_symbol_checks_are_backed_by_runtime_behavior_checks_for_critical_controls`
- `traceability_fails_when_verifier_lane_exists_but_no_longer_exercises_required_case`
