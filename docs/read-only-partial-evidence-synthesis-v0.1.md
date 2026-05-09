# Read-Only Partial Evidence Synthesis v0.1

Status: 85% evidence candidate. This document does not change the current 80% read-only Goose replacement estimate.

## Purpose

This contract keeps Current Understanding useful when evidence is partial, mixed, or aging out. Partial evidence should narrow the next read-only review direction without sounding settled.

## Core Rule

- What we know = direct, bounded, observed read-only context only.
- What remains uncertain = mock retrieval implications, uninspected branches, partial coverage, and possible reorientation.
- Blocked in read-only mode = guardrail context that persists longer than ordinary findings.
- Next read-only direction = one specific but provisional review move.

## What We Know Under Partial Evidence

Include only:

- facts from inspected files
- bounded findings from task conclusions
- safe-shell output scoped to the allowlisted command
- formal gate status scoped to read-only harness readiness

Do not include:

- inferred ownership from uninspected branches
- final implementation control
- correctness claims about the current branch

Safe copy:

- `Inspection of the runtime branch provided useful context for the current question.`
- `Inspection of README.md provided useful docs/config context for read-only review.`
- `Allowed shell output supported read-only review.`

## What Remains Uncertain Under Partial Evidence

Include:

- `Planning-only retrieval suggested additional paths that remain non-authoritative.`
- `Only part of the current question has been inspected directly.`
- `Additional related files may still refine the current interpretation.`
- `Current findings are useful for read-only review but remain incomplete.`

This is the correct home for branch/path implications that are not directly established.

## Branch Aging Model

Branch context moves through three states:

1. Active: primary current direction.
2. Compressed: older but still useful background.
3. Dropped: no longer helpful to current understanding.

Compressed older context should be one short line. It should explain the current direction without replaying full branch detail.

## Blocked Outcome Persistence

Blocked outcomes persist longer than ordinary findings when they still explain current read-only limits or session boundaries.

Safe copy:

- `A write-like shell or escalation path remains blocked in the current read-only session.`
- `Earlier blocked read-only outcome remains relevant.`

## Next Read-Only Direction

The next direction should:

- point to one likely read-only move
- stay provisional
- avoid certainty and exclusivity

Safe copy:

- `Inspect the next related source to clarify the remaining uncertainty.`
- `Continue from the currently more useful branch and inspect the next related source if more clarification is needed.`

## Blockers

Block progress if:

- What we know includes inferred ownership from uninspected branches
- mock retrieval stops being clearly non-authoritative
- older branch context vanishes too early
- blocked outcomes disappear sooner than ordinary branch findings
- next direction becomes vague or sounds final
- copy uses banned certainty, readiness, or finality language

## Candidate Tests

- `what_we_know_uses_only_directly_inspected_context_under_partial_evidence`
- `what_remains_uncertain_keeps_mock_retrieval_non_authoritative_and_visible`
- `single_branch_partial_evidence_stays_useful_but_incomplete`
- `older_branch_context_compresses_before_drop`
- `blocked_outcomes_persist_longer_than_ordinary_findings_under_partial_evidence`
- `next_readonly_direction_stays_specific_but_provisional`
- `partial_evidence_copy_does_not_overclaim`
