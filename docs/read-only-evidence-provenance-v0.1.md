# Read-Only Evidence Provenance v0.1

Status: required hardening lane for the internal scoped 90% read-only planning/review claim.

## Purpose

Evidence provenance keeps read-only synthesis from laundering one evidence class into another. Operators must be able to distinguish direct inspection, mock retrieval, safe-shell observation, blocked outcomes, gate verdicts, and derived synthesis.

## Evidence Classes

- `DIRECT_INSPECT`: repo-local file content or behavior observed through a bounded read-only inspection.
- `MOCK_RETRIEVAL`: planning-only retrieval or mock trace output. It can narrow review direction but remains non-authoritative.
- `SAFE_SHELL`: allowlisted read-only shell output such as version or status checks.
- `BLOCKED_OUTCOME`: write-like shell, escalation, or mutation-adjacent path blocked before write-capable execution.
- `READONLY_GATE`: formal Read-Only Gate GO / NO GO status, scoped to harness readiness only.
- `SYNTHESIS`: derived Current Understanding language built from task conclusions and evidence-class boundaries.

## Placement Rules

- `What we know` may use `DIRECT_INSPECT`, bounded `SAFE_SHELL`, and scoped `READONLY_GATE` facts.
- `What remains uncertain` must carry `MOCK_RETRIEVAL` implications and unreviewed paths.
- `Blocked in read-only mode` must carry `BLOCKED_OUTCOME` facts while they remain relevant.
- `Next read-only direction` is `SYNTHESIS`; it must stay provisional and cannot authorize file changes.
- `SYNTHESIS` may summarize evidence, but must not erase source-class boundaries.

## Anti-Laundering Rules

- MOCK_RETRIEVAL must not be restated as direct inspection.
- `SAFE_SHELL` must not imply broad shell capability.
- `READONLY_GATE` GO must not imply edit readiness, approval readiness, or write capability.
- SYNTHESIS must not endorse policy/config mutation or produce operational write instructions.
- Cyst remains audit/timeline truth and must not become the interpretation surface for evidence provenance.

## Candidate Tests

- `current_understanding_displays_evidence_provenance_classes`
- `provenance_labels_include_direct_mock_safe_shell_blocked_gate_and_synthesis`
- `mock_retrieval_provenance_stays_in_uncertainty_not_knowns`
- `safe_shell_provenance_remains_bounded_to_readonly_observation`
- `synthesis_provenance_does_not_authorize_file_changes`
- `evidence_provenance_doc_blocks_recommendation_laundering`
