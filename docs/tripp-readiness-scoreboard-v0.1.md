# Tripp.g Readiness Scoreboard v0.1

Status: working beta scoreboard. This is not a live-write approval document.

## Milestones

| Milestone | Current estimate | Current state | Main blocker | Next proof | Owner |
|---|---:|---|---|---|---|
| Primary read-only console beta | 90-93% | Formal gate, task conclusions, Current Understanding, Cyst audit, mixed-session beta acceptance, and longer-session repeatability are in place. | Operator QA across repeated real sessions. | Repeat the longer read-only session shape and confirm no cross-surface contradiction. | Codex + Goose |
| Replace Goose for read-only planning/review | 75% | Tripp now passes linear, multi-branch, and longer read-only planning threads with inspect, mock retrieval, follow-up inspection, safe shell, blocked shell, git status, and gate review. | Broader session variety and repeated operator review. | Prove Tripp stays coherent across repeated 8-10 task read-only sessions without Goose narration. | Goose review + Codex |
| Replace Goose for edit/build work | 35-45% | Safety doctrine and read-only gates are strong, but live mutation remains blocked. | General patchPlan, approval/apply lifecycle, stale checks, sandboxed apply, and authoritative write evidence. | Build and pass a separate live-edit gate after read-only beta is stable. | Future Tripp + Codex |

## Fastest Path to Add 10 Points

### Primary read-only console beta
- Run a longer 8-10 task red-team session.
- Confirm TASKS, Current Understanding, and Cyst remain coherent across older and newer task context.
- Add operator-facing beta status only after that longer-session proof holds.

### Replace Goose for read-only planning/review
- Prove longer and more varied read-only sessions stay coherent across repeated runs.
- Consolidate mixed-session, multi-branch, and copy-safety checks into a durable regression harness.
- Keep mock evidence visibly non-authoritative.

## Passing Proofs

- Formal Read-Only Gate passes with deterministic v0.1 contract.
- Primary read-only beta acceptance flow passes.
- Mixed-session acceptance now includes inspect, mock retrieval, follow-up inspect, safe shell, blocked shell, and gate review.
- Multi-branch ambiguity acceptance now keeps backend and UI branches visible, ranks by usefulness, preserves mock uncertainty, and keeps blocked outcomes visible.
- Longer-session repeatability acceptance now covers inspection, retrieval, analysis, safe shell, blocked shell, git status, and gate review.
- Cross-surface coherence guard passes for TASKS, Current Understanding, and Cyst gate copy.

## Read-Only Goose Replacement Statement

Read-only planning/review readiness: approximately 75% toward replacing Goose for structured and moderately ambiguous workflows. Tripp.g now supports coherent read-only planning/review flows across inspection, planning-only retrieval, safe shell checks, blocked escalation handling, formal read-only gate review, and two-branch ambiguity handling. In mixed read-only sessions, TASKS, Current Understanding, and Cyst provide enough consistent context for common structured review work without requiring Goose to interpret each step. This estimate applies only to read-only planning/review workflows and does not include edit/build work, approval/apply flows, or broader ambiguous implementation reasoning.

## Evidence Required To Keep The 75% Claim

- Mixed-session acceptance harness passes.
- Multi-branch ambiguity acceptance harness passes.
- Longer-session repeatability harness passes.
- Cross-surface coherence holds across TASKS, Current Understanding, and Cyst.
- Mock evidence remains clearly non-authoritative and planning-only.
- Branch ranking stays based on usefulness, not truth or verification.
- Less-central branches remain visible when they still add read-only context.
- Blocked outcomes remain visible in task-level and session-level understanding.
- Gate GO means read-only harness readiness only.
- Copy guardrails prevent edit, apply, approval, commit, write, verified-target, or implementation-readiness language.

## 75% Claim Invalidation

Pull the claim back if any of these occur:

- TASKS, Current Understanding, and Cyst contradict each other materially.
- Mock evidence appears authoritative or stronger than inspection.
- Stronger/less-central branch language drifts into verified/correct/invalid path language.
- Blocked outcomes disappear from session synthesis.
- Gate GO is read as broader than read-only harness readiness.
- Operators still need Goose to interpret ordinary mixed read-only sessions.
- The mixed-session, multi-branch, or longer-session acceptance harness fails or becomes flaky.

### Replace Goose for edit/build work
- Do not accelerate this yet.
- First define generalized patchPlan and approval/apply requirements.
- Keep all mutation paths blocked until the live-edit gate exists.

## Current Non-Negotiables

- Read-only mode remains the active doctrine.
- Mock evidence supports planning and narrowing only.
- Cyst records audit truth; TASKS presents interpretation.
- Gate GO means read-only harness readiness only.
- No surface may imply edit, apply, approval, commit, or write readiness.
