# Read-Only Beta Release Notes v0.1

Status: scoped beta release artifact. This is not a live-write approval document and does not change runtime permissions.

## Release Scope

Tripp.g is currently a scoped read-only beta for structured and moderately ambiguous planning/review workflows.

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
- Current behavior is read-only. Tripp.g does not enable live writes, edit/build workflows, or approval/apply flows in this beta.
- No runtime mutation path is enabled.
- No approval/apply capability exists in this beta.
- Gate GO means read-only harness readiness only.
- Gate GO does not imply write readiness, edit readiness, approval readiness, or implementation readiness.
- Read-Only Gate GO / NO GO reflects current read-only harness readiness only. It does not imply edit readiness, approval readiness, or write capability.
- Mock or planning-only evidence is non-authoritative and cannot authorize file changes.
- Mock or planning-only retrieval is non-authoritative. It can support review and narrowing, but it cannot authorize file changes.
- Structured and moderately ambiguous read-only planning/review is supported; broad open-ended implementation reasoning remains outside scope.
- Current readiness applies only to structured/moderately ambiguous read-only planning/review. It does not claim broad Goose parity or implementation replacement.
- Longer and messier sessions may still require external review discipline.

## Operator Usage Note

Use the surfaces this way:

- TASKS provides per-task conclusions and outcome interpretation.
- Current Understanding summarizes the recent read-only planning thread.
- Cyst records audit/timeline truth and blocked/allowed event history.
- Read-Only Gate reports formal read-only harness status.
- TASKS: read conclusions, scenario details, and task-level evidence labels.
- Current Understanding: read what Tripp currently knows, what remains uncertain, what is blocked, and the next read-only direction.
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
- `beta_release_notes_include_scoped_readonly_beta_statement`
- `beta_release_notes_list_included_readonly_surfaces_and_flows`
- `beta_release_notes_exclude_edit_build_and_live_write_claims`
- `beta_known_limitations_include_no_live_writes_and_no_edit_build_replacement`
- `known_limitations_include_readonly_only_scope`
- `known_limitations_include_no_live_writes_and_no_approval_apply`
- `known_limitations_include_mock_evidence_non_authoritative_disclaimer`
- `known_limitations_include_no_edit_build_replacement_claim`
- `beta_docs_state_mock_evidence_is_non_authoritative`
- `beta_gate_go_does_not_imply_write_readiness`
- `beta_operator_usage_note_keeps_cyst_as_audit_truth`
- `operator_usage_note_assigns_tasks_as_interpretation_surface`
- `operator_usage_note_assigns_current_understanding_as_session_synthesis_surface`
- `operator_usage_note_assigns_cyst_as_audit_timeline_only`
- `operator_usage_note_assigns_gate_as_readonly_harness_check_only`
- `beta_label_is_blocked_when_scope_or_limitations_are_missing`
- `beta_wording_does_not_imply_general_goose_replacement`
- `beta_docs_do_not_use_write_readiness_language`
- `beta_docs_do_not_use_broad_goose_replacement_language`
- `beta_docs_do_not_overstate_gate_go_scope`
- `beta_docs_do_not_overstate_mock_or_planning_only_evidence`
- `beta_artifacts_require_scoped_readonly_statement_before_beta_label`
- `beta_artifacts_require_known_limitations_before_beta_label`
- `beta_artifacts_require_gate_go_no_go_disclaimer_before_beta_label`
- `beta_artifacts_require_mock_evidence_disclaimer_before_beta_label`
