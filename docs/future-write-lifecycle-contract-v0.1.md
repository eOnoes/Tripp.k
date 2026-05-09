# Future Write Lifecycle Contract v0.1

Status: design-only contract. This document must not enable live mutation paths.

Not active in current read-only harness. Design-only contract; no runtime mutation path is enabled.

## Purpose

This contract describes the future write lifecycle so the read-only prototype can evolve deliberately later. Current runtime behavior remains read-only. Mock retrieval, read-only inspection, safe shell, and Read-Only Gate GO do not authorize edits.

## Non-Negotiables

- Warden remains default-deny for every mutation-capable path.
- No write-capable adapter route may be invoked without explicit future approval/apply gates.
- Mock or planning-only evidence can never authorize file changes.
- Mock or planning-only evidence is never sufficient for write approval and can never unlock apply.
- Approval and apply are separate states.
- Review, approve, and apply are separate future lifecycle steps.
- A previewed patch is not an applied patch.
- Stale approval must block apply.
- Cyst records write lifecycle audit truth; TASKS presents operator interpretation.

## Future Patch Plan Shape

A future `patchPlan` should carry:

- `taskId`
- `targetFile`
- `previewFingerprint`
- `proposedChanges`
- `evidenceAuthority`
- `writeApprovalEligible`
- `approvalStatus`
- `applyStatus`
- `createdAt`
- `updatedAt`

Required rule:
- `writeApprovalEligible` must be false unless evidence is explicitly authoritative for write review.

## Future Review / Approve / Apply Split

Future lifecycle meanings:

- `review`: inspect a proposed change and its evidence without authorizing mutation.
- `approve`: authorize the exact reviewed proposal and preview fingerprint.
- `apply`: execute an approved proposal only after fresh policy, fingerprint, target-drift, and evidence checks.

Rules:

- review does not authorize writes.
- approve does not execute writes.
- apply cannot proceed from mock or planning-only evidence.
- apply cannot proceed from stale or dismissed approval.
- apply cannot proceed unless the exact reviewed preview remains current.

## Future Approval States

Minimum future states:

- `not_ready`
- `preview_ready`
- `approved_not_applied`
- `stale`
- `dismissed`
- `applied`

Rules:
- approval is bound to a preview fingerprint
- preview changes invalidate approval
- dismissed approval cannot be reused
- approval does not imply apply success

## Future Apply Gate

Apply may proceed only when:

- Warden allows the apply descriptor
- adapter route is write-capable and explicitly selected
- approval state is `approved_not_applied`
- preview fingerprint still matches
- target file has not drifted
- evidence authority supports the requested write path

Any failed condition must produce an apply-blocked or write-escalation-blocked event with `invoked:false` when the adapter was not called.

## Future Cyst Events

Candidate event types:

- `write_intent_received`
- `patch_plan_created`
- `patch_preview_generated`
- `approval_recorded`
- `stale_check_performed`
- `apply_requested`
- `apply_started`
- `patch_approval_stale`
- `patch_approval_dismissed`
- `apply_blocked`
- `apply_succeeded`
- `apply_failed`

Required event fields:

- `taskId`
- `traceId`
- `eventType`
- `timestamp`
- `cystSequence`
- `blockLayer` when blocked
- `reasonCode` when blocked
- `invoked`
- `approvalState` when approval-related
- `wardenDecision` when policy-related
- `adapterDecision` when route/tool-related

## Future Trial Matrix

Before enabling live writes, a separate live-write gate must prove:

- mock evidence cannot authorize write approval
- passive/read-only evidence cannot authorize apply
- authoritative evidence can support preview only when explicitly marked eligible
- stale approval blocks apply
- dismissed approval blocks apply
- Warden denial blocks before adapter invocation
- adapter denial preserves `invoked:false`
- successful apply records exact task, target, and lifecycle correlation

## Explicitly Out Of Scope Now

- live file mutation
- approval buttons
- apply buttons
- write-capable adapter routing
- automatic patch application
- claiming edit/build replacement readiness
