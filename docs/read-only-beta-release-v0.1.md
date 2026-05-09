# Read-Only Beta Release Notes v0.1

Status: scoped beta release artifact. This is not a live-write approval document and does not change runtime permissions.

## Release Scope

This beta covers structured and moderately ambiguous read-only planning/review workflows.

Included:

- read-only inspection and planning support
- planning-only retrieval with explicit non-authoritative evidence labels
- allowlisted safe-shell review commands
- blocked shell/escalation handling that preserves read-only mode
- TASKS conclusions for completed read-only work
- Current Understanding synthesis for recent read-only session context
- Cyst audit timeline for activity truth
- Formal Read-Only Gate review with GO / NO GO scoped to harness readiness
- beta harness operator-independence artifact for acceptance review

Not included:

- live writes
- edit/build replacement
- approval/apply capability
- patch application
- commit or publish flows
- broad general reasoning parity with Goose
- authoritative mutation planning

## Known Limitations

- Current behavior is read-only.
- No runtime mutation path is enabled.
- No approval/apply capability exists in this beta.
- Gate GO means read-only harness readiness only.
- Gate GO does not imply write readiness, edit readiness, approval readiness, or implementation readiness.
- Mock or planning-only evidence is non-authoritative and cannot authorize file changes.
- Structured and moderately ambiguous read-only planning/review is supported; broad open-ended implementation reasoning remains outside scope.
- Longer and messier sessions may still require external review discipline.

## Operator Usage Note

Use the surfaces this way:

- TASKS: read conclusions, scenario details, and task-level evidence labels.
- Current Understanding: read the compact session synthesis across recent read-only work.
- Cyst: review audit truth and event ordering only; Cyst is not the conclusion surface.
- Read-Only Gate: interpret GO / NO GO as current read-only harness readiness only.
- Operator-independence artifact: review beta harness understandability evidence; it is not normal product UI and not a certification claim.

## Evidence Boundaries

- Direct inspection supports read-only review of inspected files only.
- Safe shell output supports read-only review of the allowlisted command output only.
- Mock retrieval supports planning and narrowing only.
- Blocked outcomes are intentional read-only boundary evidence.
- Future write lifecycle design docs do not change current runtime behavior.

## Beta Label Blockers

Do not label or present this beta as ready if:

- release wording implies write readiness, edit readiness, approval readiness, apply readiness, or implementation readiness
- mock evidence appears authoritative
- Gate GO is described as broader than read-only harness readiness
- TASKS, Current Understanding, and Cyst materially contradict each other
- blocked read-only outcomes disappear from the session story
- operator-independence artifact fails or sounds like certification
- operator-independence artifact is acceptance evidence only, not certification
- future write design language bleeds into current runtime claims

## Approved Readiness Statement

Tripp.g is ready for scoped read-only beta use in structured and moderately ambiguous planning/review workflows. This beta does not include live writes, edit/build replacement, approval/apply capability, or general reasoning parity with Goose.

## Release Verification Hooks

- `beta_release_notes_include_readonly_only_scope`
- `beta_known_limitations_include_no_live_writes_and_no_edit_build_replacement`
- `beta_docs_state_mock_evidence_is_non_authoritative`
- `beta_gate_go_does_not_imply_write_readiness`
- `beta_operator_usage_note_keeps_cyst_as_audit_truth`
- `beta_label_is_blocked_when_scope_or_limitations_are_missing`
- `beta_wording_does_not_imply_general_goose_replacement`
