# Read-Only 90 Percent Gate v0.1

Status: future readiness gate. This document does not change the current scoped 85% read-only planning/review readiness estimate.

## Scope

Structured, moderately ambiguous, and broader everyday read-only planning/review workflows only.

Still out of scope:

- edit/build replacement
- runtime writes
- approval/apply runtime behavior
- broad Goose parity
- open-ended engineering reasoning parity
- mutation-capable planning

## Required Proof Before 90%

All of these must pass:

1. Broader read-only session variety
   - at least four distinct read-only scenario families
   - more than three scenario families
   - docs/config vs runtime
   - Warden vs adapter/tool-route
   - longer-session branch rolloff
   - contradiction recovery
   - one broader everyday mixed-session family
   - at least one broader everyday mixed session without a tightly curated branch question

2. Deeper synthesis under weak or aging evidence
   - Current Understanding remains useful under partial evidence
   - mixed signals stay in uncertainty until directly reviewed
   - older context compresses without rewriting history
   - next read-only direction remains clear without sounding final

3. Long-session stress
   - at least one 8 to 12+ task read-only session
   - multiple branch shifts
   - multiple blocked outcomes
   - aging context
   - compact and coherent Current Understanding
   - operator reconstructability without Goose interpretation

4. Operator-independence breadth
   - pack-level artifact includes the long-session stress flow
   - required scenario IDs include docs/config vs runtime, Warden vs adapter/tool-route, longer-session branch rolloff, contradiction recovery, long-session stress, and everyday mixed session
   - long-session stress is a required scenario in the broadened pack
   - every required scenario ID appears exactly once
   - duplicate required scenario IDs are rejected
   - long-session scenario includes continuity reconstruction and branch-shift checks
   - no required scenario family is omitted
   - no pack pass when any scenario or required check fails
   - pack summary uses understandability wording, not certification or replacement language
   - per-scenario summaries pass copy-safety checks
   - expected evidence classes are present for each required scenario

5. Release and copy discipline
   - scoped read-only beta language remains stable
   - no broad Goose parity language
   - no edit/build bleed-through
   - no write-capable implications in docs, UI, or artifacts
   - Cyst remains audit/timeline truth only

6. Kimi red-team hardening
   - evidence provenance tags exist and are used in verifier/synthesis discipline
   - compact contract-to-runtime traceability matrix exists
   - recommendation-laundering copy guardrails pass checks
   - minimum adversarial pack passes
   - readiness percentage language is internal, scoped, gate-based, non-external, and non-parity

## Blockers

Do not move to 90% if:

- broader everyday session shapes still need Goose interpretation
- the broader everyday mixed-session family is missing
- fewer than four distinct read-only scenario families are covered
- long-session stress is absent or only lightly tested
- long-session stress causes Current Understanding to become cluttered or vague
- partial-evidence synthesis becomes too strong or too weak
- blocked outcomes disappear in longer sessions
- operator-independence evidence fails on any required scenario family
- release/copy discipline drifts into broader replacement claims
- evidence provenance, contract traceability, recommendation-laundering guardrails, or adversarial pack coverage is missing
- future write docs or UI language blur current read-only scope

## Invalidation Conditions

A 90% claim should be invalidated if:

- cross-surface coherence regresses under longer or broader sessions
- operator-independence artifact loses integrity or breadth coverage
- blocked outcomes stop persisting where relevant
- branch rolloff rewrites history or hides still-relevant context
- release wording broadens beyond read-only planning/review
- edit/build replacement language begins to bleed into read-only readiness claims

## Candidate Tests

- `ninety_percent_gate_requires_broader_session_variety_pack`
- `ninety_percent_requires_minimum_four_distinct_readonly_scenario_families`
- `ninety_percent_gate_requires_long_session_stress_pass`
- `ninety_percent_requires_ten_task_or_longer_stress_scenario`
- `ninety_percent_requires_broadened_operator_independence_pack_artifact`
- `ninety_percent_gate_requires_deeper_partial_evidence_synthesis_quality`
- `everyday_mixed_session_is_required_for_ninety_percent_breadth`
- `long_session_stress_is_included_in_required_pack_scenarios_for_ninety_percent`
- `ninety_pack_artifact_requires_all_required_scenario_ids_exactly_once`
- `ninety_pack_artifact_rejects_duplicate_required_scenario_ids`
- `ninety_pack_artifact_requires_long_session_stress_as_required_scenario`
- `long_session_stress_requires_continuity_reconstructed_and_branch_shift_understood_checks`
- `ninety_pack_artifact_fails_if_any_required_scenario_or_check_fails`
- `ninety_pack_artifact_pack_summary_uses_understandability_not_certification_language`
- `ninety_pack_artifact_requires_per_scenario_summary_copy_safety`
- `ninety_pack_artifact_requires_expected_evidence_classes_per_scenario`
- `ninety_pack_artifact_is_beta_harness_output_only`
- `ninety_percent_gate_requires_pack_level_operator_independence_across_all_required_scenarios`
- `ninety_percent_gate_requires_release_and_copy_scope_discipline`
- `ninety_percent_claim_is_invalidated_by_scope_or_cross_surface_regression`
- `ninety_score_is_blocked_until_broadened_pack_exceeds_eighty_five_scope`
- `ninety_score_requires_long_session_stress_in_required_pack`
- `ninety_score_requires_everyday_mixed_session_in_required_pack`
- `ninety_score_requires_partial_evidence_quality_across_broadened_pack`
- `ninety_score_requires_operator_independence_across_all_required_ninety_pack_families`
- `ninety_scoreboard_copy_remains_scoped_to_readonly_planning_review_only`
- `ninety_scoreboard_copy_does_not_imply_broad_goose_parity_or_edit_build_readiness`
- `ninety_percent_requires_evidence_provenance_tags`
- `ninety_percent_requires_contract_runtime_trace_matrix`
- `ninety_percent_requires_recommendation_laundering_guardrails`
- `ninety_percent_requires_minimum_adversarial_pack`
- `ninety_percent_readiness_language_is_internal_scoped_gate_based_and_non_external`
