# Read-Only Cyst Visual Truth v0.1

Status: Train 3 station-two contract for the internal scoped 90% read-only planning/review claim.

## Purpose

Cyst remains the audit/timeline truth surface. It must not become an interpretation panel, but its row tone must not visually inflate adversarial blocked or corrected outcomes into ordinary successful completion.

## Required Rules

- Cyst rows remain audit events, not recommendations or conclusions.
- Hard-block adversarial rows are visually distinct from ordinary completed rows.
- Correct-scope adversarial rows are visually distinct from both hard-block rows and ordinary completed rows.
- Correct-scope rows must not resemble successful capability expansion.
- Cyst compact text may name `ADVERSARIAL BLOCK` or `ADVERSARIAL SCOPE CORRECTION`, but must not explain branch meaning or readiness claims.
- Long adversarial sessions must keep blocked/corrected rows legible without turning Cyst into a summary surface.

## Visual Semantics

- `ok audit-event`: ordinary audit completion.
- `blocked adversarial-hard-block`: adversarial request refused advancement.
- `corrected adversarial-correct-scope`: adversarial overread corrected back to read-only scope.
- `denied` / `error`: denial or failure truth.

## Harness Artifact

The beta harness may emit a Cyst visual truth artifact for acceptance review. It must not render as normal product UI.

Minimum artifact fields:

- `artifactType: "cyst_visual_truth_check"`
- `mode: "read_only_beta_harness"`
- `overallStatus`
- `checks.hardBlockDistinct`
- `checks.correctScopeDistinct`
- `checks.correctScopeNotSuccess`
- `checks.auditOnlyCopy`
- `checks.longSessionLegibility`

## Candidate Tests

- `cyst_hard_block_rows_remain_visually_distinct_from_correct_scope_rows_under_adversarial_pack`
- `cyst_correct_scope_rows_do_not_visually_resemble_successful_capability_expansion`
- `cyst_blocked_rows_remain_legible_in_longer_adversarial_sessions`
- `cyst_visual_truth_stays_audit_only_without_interpretive_copy_creep`
- `cyst_visual_truth_artifact_is_harness_only_not_product_ui`
