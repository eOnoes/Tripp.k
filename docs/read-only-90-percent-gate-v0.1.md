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
   - more than three scenario families
   - docs/config vs runtime
   - Warden vs adapter/tool-route
   - longer-session branch rolloff
   - contradiction recovery
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
   - no required scenario family is omitted
   - no pack pass when any scenario or required check fails

5. Release and copy discipline
   - scoped read-only beta language remains stable
   - no broad Goose parity language
   - no edit/build bleed-through
   - no write-capable implications in docs, UI, or artifacts
   - Cyst remains audit/timeline truth only

## Blockers

Do not move to 90% if:

- broader everyday session shapes still need Goose interpretation
- long-session stress causes Current Understanding to become cluttered or vague
- partial-evidence synthesis becomes too strong or too weak
- blocked outcomes disappear in longer sessions
- operator-independence evidence fails on any required scenario family
- release/copy discipline drifts into broader replacement claims
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
- `ninety_percent_gate_requires_long_session_stress_pass`
- `ninety_percent_gate_requires_deeper_partial_evidence_synthesis_quality`
- `ninety_percent_gate_requires_pack_level_operator_independence_across_all_required_scenarios`
- `ninety_percent_gate_requires_release_and_copy_scope_discipline`
- `ninety_percent_claim_is_invalidated_by_scope_or_cross_surface_regression`
