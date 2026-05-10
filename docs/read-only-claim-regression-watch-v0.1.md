# Read-Only Claim Regression Watch v0.1

Status: post-finish maintenance sentinel for the internal scoped 90% read-only planning/review claim.

This watch keeps the finish-line release/readiness lock from becoming stale. It does not raise readiness, add a capability class, or change runtime permissions.

## Watch Scope

Monitor future changes to:

- scoreboard wording
- beta release notes
- known limitations
- capability statements
- Read-Only Gate GO / NO GO wording
- harness artifact summaries
- future write lifecycle docs
- post-90 roadmap language

## Required Invariants

- Score wording keeps all four qualifiers: internal, scoped, gate-based, and read-only only.
- Capability-list wording stays adjacent to the score claim.
- Known limitations continue to state no live writes, no approval/apply, no edit/build replacement, and non-authoritative mock/planning-only evidence.
- Read-Only Gate GO / NO GO stays scoped to read-only harness readiness only.
- Harness artifacts remain fail-capable beta-harness evidence, not normal product UI or certification.
- Future write lifecycle docs remain design-only and do not imply a current runtime mutation path.
- Edit/build readiness remains a separate lower-readiness milestone.
- Soft wording must not inflate the claim through vague confidence language such as broader day-to-day use, mature review assistant, trusted workflow, production-trusted review, general review maturity, or practical replacement.

## Maintenance Automation

Run the focused sentinel before merging release/readiness wording changes:

`node scripts/verify-claim-regression.mjs`

This script checks the scoreboard, beta release notes, 90 go/no-go checklist, release claim coherence lock, claim-regression watch, and future write lifecycle contract. It exits nonzero when a required invariant fails.

The full beta harness also emits `claim_regression_watch_check` through `node scripts/verify.mjs`.

## Rollback Triggers

Roll back the claim or reopen the coherence station if:

- score wording loses internal, scoped, gate-based, or read-only-only scope
- capability-list wording and score wording diverge
- known limitations are removed, softened, or made generic
- Gate GO wording expands beyond read-only harness readiness
- harness artifacts become informative-only rather than fail-capable
- future write docs imply current runtime mutation capability
- release wording implies broad Goose parity, external validation, or edit/build readiness
- soft confidence wording inflates the scoped score without using an explicit hard-blocked phrase

## Sentinel Artifact

The verifier may emit a claim-regression watch artifact in the beta harness. It must fail on regression and must not render in normal product UI.

Minimum artifact fields:

- `artifactType: "claim_regression_watch_check"`
- `mode: "read_only_beta_harness"`
- `overallStatus`
- `checks.scoreQualifiers`
- `checks.capabilityPairing`
- `checks.knownLimitations`
- `checks.gateScope`
- `checks.harnessFailCapable`
- `checks.futureWriteSeparation`
- `checks.noClaimInflation`

## Verification Hooks

- `claim_regression_watch_fails_when_score_qualifiers_are_missing`
- `claim_regression_watch_fails_when_capability_list_and_score_diverge`
- `claim_regression_watch_fails_when_known_limitations_weaken`
- `claim_regression_watch_fails_when_gate_go_scope_expands`
- `claim_regression_watch_fails_when_harness_artifacts_stop_being_fail_capable`
- `claim_regression_watch_fails_when_future_write_docs_imply_runtime_mutation`
- `claim_regression_watch_artifact_is_harness_only_not_product_ui`
- `claim_regression_watch_fails_on_soft_wording_inflation`
- `claim_regression_watch_can_run_as_focused_maintenance_script`
