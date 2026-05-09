# Read-Only 80 Percent Gate v0.1

Status: future readiness gate. This document does not change the current 75% read-only Goose replacement estimate.

## Purpose

This gate defines what must be proven before Tripp.g can move from 75% to 80% toward replacing Goose for structured and moderately ambiguous read-only planning/review.

## Required Proof Before 80%

All of these must pass:

1. Branch reversal proof
   - a previously useful branch can be downgraded without being erased
   - a later branch can become more useful without being described as correct or verified
   - mock uncertainty remains visible
   - blocked outcomes remain visible

2. Repeated ambiguity proof
   - at least two different ambiguity shapes pass
   - branch ranking stays based on usefulness for review
   - the next read-only direction remains clear

3. Contradiction and safe recovery proof
   - new read-only evidence can reduce confidence in an earlier synthesis without calling it wrong
   - Current Understanding shows what changed in interpretation
   - earlier useful context remains visible
   - recovery language stays scoped to current review usefulness, not final truth

4. Longer-session repeatability
   - repeated 8-10 task read-only sessions remain coherent
   - older but relevant blocked outcomes do not vanish from the story
   - Current Understanding does not overcompress uncertainty

5. Operator-independence proof
   - a reviewer can answer what was inspected, learned, uncertain, blocked, and next without Goose narration
   - TASKS, Current Understanding, and Cyst remain confidence-coherent

## 80% Blockers

Do not move to 80% if:

- branch reversal is a single fragile happy path
- contradiction recovery is missing or only documented without acceptance proof
- weaker or downgraded branches disappear while still relevant
- mock evidence sounds authoritative after follow-up inspection
- safe shell success implies broad shell capability
- Gate GO sounds broader than read-only harness readiness
- Current Understanding compresses uncertainty into a settled answer
- operators still need Goose to explain ordinary read-only sessions

## Still Out Of Scope At 80%

- edit/build replacement
- live file mutation
- approval/apply runtime behavior
- authoritative write-relevant verification
- broad open-ended engineering synthesis parity
- replacing Goose for implementation ownership

## Candidate Future Tests

- `second_ambiguity_shape_passes_without_overclaim`
- `contradiction_recovery_updates_synthesis_without_calling_earlier_context_wrong`
- `current_understanding_shows_what_changed_without_final_truth_language`
- `branch_reversal_remains_stable_across_repeat_runs`
- `long_session_keeps_relevant_blocked_outcomes_visible`
- `current_understanding_does_not_overcompress_uncertainty`
- `operator_independence_check_passes_without_sidecar_explanation`
- `tasks_current_understanding_and_cyst_stay_confidence_coherent_after_reversal`
