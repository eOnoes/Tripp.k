# Read-Only 85 Percent Gate v0.1

Status: future readiness gate. This document does not change the current 80% read-only Goose replacement estimate.

## Purpose

This gate defines what must be proven before Tripp.g can move from 80% to 85% toward replacing Goose for structured and moderately ambiguous read-only planning/review.

## Required Proof Before 85%

All of these must pass:

1. Broader read-only session variety
   - multiple distinct session shapes pass
   - allowed and blocked read-only outcomes stay understandable together
   - mock evidence remains planning-only across varied prompts
   - docs/config vs runtime implementation acceptance lane passes
   - operator-independence pack artifact covers all required variety-pack scenario families

2. Branch rolloff proof
   - older branch context can age out of the immediate task window without disappearing from the session story
   - older blocked read-only outcomes remain visible longer than ordinary findings
   - Current Understanding distinguishes recent findings from older-but-relevant read-only context
   - runtime acceptance lane passes

3. Synthesis quality under partial evidence
   - summaries preserve uncertainty when inspection coverage is incomplete
   - next read-only direction remains specific without implying final certainty
   - branch ranking remains based on usefulness for review
   - partial evidence synthesis contract passes

4. Beta release discipline
   - scoped release notes exist
   - known limitations remain visible
   - read-only-only scope is explicit
   - future write design does not affect current runtime claims
   - beta label does not imply edit/build replacement, approval/apply capability, or broad Goose parity

## 85% Blockers

Do not move to 85% if:

- older blocked read-only outcomes disappear from the planning story while still relevant
- older branch context is erased instead of summarized or aged down
- Current Understanding overcompresses partial evidence into a settled answer
- single-branch evidence is treated as enough to settle a multi-branch question
- release language implies edit/build or write-capable readiness
- release language implies approval/apply capability or broad Goose replacement
- operator-independence artifact fails or becomes certification-sounding
- operator-independence pack artifact passes while any required scenario family fails
- Cyst becomes an interpretation surface instead of audit truth

## Branch Rolloff Policy

- Keep the immediate Current Understanding compact.
- Preserve older blocked read-only outcomes longer than ordinary findings.
- Preserve older branch context when it still explains the current next read-only direction.
- Label older context as earlier context, not stale failure.
- Do not use certainty, approval, or readiness language.

## Candidate Future Tests

- `branch_rolloff_keeps_older_blocked_readonly_outcomes_visible`
- `session_variety_pack_covers_multiple_distinct_readonly_planning_shapes`
- `docs_config_vs_runtime_session_remains_self_explanatory`
- `branch_rolloff_summarizes_older_branch_context_without_overclaim`
- `current_understanding_distinguishes_recent_from_older_relevant_context`
- `partial_evidence_synthesis_preserves_uncertainty`
- `single_branch_partial_evidence_stays_useful_but_incomplete`
- `what_we_know_uses_only_directly_inspected_context_under_partial_evidence`
- `operator_independence_pack_artifact_requires_all_scenario_families`
- `operator_pack_artifact_contains_required_scenario_ids_and_results`
- `operator_pack_artifact_overall_status_matches_scenario_level_results`
- `operator_independence_pack_artifact_fails_if_any_required_scenario_fails`
- `eighty_five_percent_requires_operator_independence_artifact_across_pack`
- `beta_release_notes_remain_scoped_to_readonly_planning_review`
- `future_write_docs_do_not_affect_current_runtime_claims`
