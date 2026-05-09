# Read-Only Contract Runtime Trace v0.1

Status: lightweight traceability matrix required before any future 90% readiness claim. This document does not change the current scoped 85% read-only planning/review readiness estimate.

## Purpose

This matrix connects contract intent to runtime behavior, verifier proof, and operator-visible surfaces. It is intentionally compact; a fuller governance matrix can come later.

| Contract rule | Runtime path | Verifier lane | UI surface |
|---|---|---|---|
| Mutation-capable requests are denied by default. | `permissionDecision`, `gooseAdapterCall`, `validateGooseAdapterGates` in `server.mjs`. | `gated shell`, `patch gate`, `executor: goose adapter read-only gates`, `cyst: denial, trial, retrieval, and lifecycle events persisted`. | TASKS conclusion, Cyst blocked lifecycle rows, Current Understanding `BLOCKED_OUTCOME`. |
| Mock retrieval is planning-only and cannot authorize file changes. | `createMunchRetrieval`, `recordRetrievalEvent`, evidence gate metadata in `server.mjs`. | `munch: health, retrieval, and context-map stubs`, beta retrieval lanes, provenance checks. | TASKS retrieval conclusion, retrieval authority strip, Current Understanding `MOCK_RETRIEVAL`. |
| Safe shell is allowlisted read-only observation only. | `permissionDecision` shell allowlist and adapter invocation checks in `server.mjs`. | `safe shell`, longer-session and everyday mixed-session flows. | TASKS shell conclusion, Current Understanding `SAFE_SHELL`. |
| Read-Only Gate GO / NO GO is harness readiness only. | `/api/tripp/trials/read-only`, `createReadOnlyGoNoGo`, `createReadOnlySuiteSummary` in `server.mjs`. | `trials: read-only harness suite`, beta gate lanes. | Read-Only Gate panel, TASKS gate conclusion, Current Understanding `READONLY_GATE`. |
| Current Understanding is synthesis, not raw evidence or write authority. | `buildPlanningSummary`, `buildPlanningProvenance` in `script.js`. | copy-safety checks, provenance doc checks, cross-surface coherence guard. | Current Understanding sections plus evidence provenance strip. |

## 90% Gate Implication

Before 90%, this matrix must remain accurate enough to answer:

- what rule exists
- which runtime path enforces or reflects it
- which verifier lane proves it
- which operator surface shows it

## Candidate Tests

- `contract_runtime_trace_matrix_exists_before_ninety_percent`
- `trace_matrix_maps_contract_rule_to_runtime_path_verifier_lane_and_ui_surface`
- `trace_matrix_covers_mutation_denial_mock_retrieval_safe_shell_gate_and_synthesis`
- `trace_matrix_keeps_current_understanding_as_synthesis_not_authority`
- `trace_matrix_does_not_imply_runtime_write_capability`
