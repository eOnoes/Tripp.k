# Tripp.g Readiness Scoreboard v0.1

Status: working beta scoreboard. This is not a live-write approval document.

## Milestones

| Milestone | Current estimate | Current state | Main blocker | Next proof | Owner |
|---|---:|---|---|---|---|
| Primary read-only console beta | 90-93% | Formal gate, task conclusions, Current Understanding, Cyst audit, mixed-session beta acceptance, and longer-session repeatability are in place. | Operator QA across repeated real sessions. | Repeat the longer read-only session shape and confirm no cross-surface contradiction. | Codex + Goose |
| Replace Goose for structured/moderately ambiguous and broader everyday read-only planning/review | 85% | Tripp currently supports broader read-only planning/review workflows across multiple structured and moderately ambiguous session shapes, with stable synthesis, ambiguity handling, branch rolloff, blocked-state continuity, operator-independence evidence, and scoped beta release discipline. | 90% remains a future gate; breadth, long-session stress, partial-evidence quality, and operator-independence coverage must expand before any further score change. | Prove the broadened scenario pack, long-session stress coverage, deeper partial-evidence synthesis quality, expanded operator-independence breadth, and continued release/copy discipline. | Goose review + Codex |
| Replace Goose for edit/build work | 35-45% | Edit/build replacement remains a separate milestone. Current write lifecycle work is design-only, with no runtime mutation path, no approval/apply runtime behavior, and no live write capability enabled. | General patchPlan, approval/apply lifecycle, stale checks, sandboxed apply, and authoritative write evidence. | Build and pass a separate live-edit gate only after read-only beta is stable. | Future Tripp + Codex |

## Fastest Path to Add 10 Points

### Primary read-only console beta
- Run a longer 8-10 task red-team session.
- Confirm TASKS, Current Understanding, and Cyst remain coherent across older and newer task context.
- Add operator-facing beta status only after that longer-session proof holds.

### Replace Goose for read-only planning/review
- Prove longer and more varied read-only sessions stay coherent across repeated runs.
- Consolidate mixed-session, multi-branch, and copy-safety checks into a durable regression harness.
- Keep mock evidence visibly non-authoritative.
- Follow the post-85 roadmap in `docs/read-only-post-85-roadmap-v0.1.md`.

## Passing Proofs

- Formal Read-Only Gate passes with deterministic v0.1 contract.
- Primary read-only beta acceptance flow passes.
- Mixed-session acceptance now includes inspect, mock retrieval, follow-up inspect, safe shell, blocked shell, and gate review.
- Multi-branch ambiguity acceptance now keeps backend and UI branches visible, ranks by usefulness, preserves mock uncertainty, and keeps blocked outcomes visible.
- Branch-reversal acceptance now shows Tripp can reorient toward a more useful branch without erasing the earlier branch.
- Contradiction-recovery acceptance now shows Tripp can update interpretation from later read-only evidence without calling earlier context wrong.
- Warden-vs-adapter ambiguity acceptance now proves a distinct enforcement-boundary ambiguity shape.
- Longer-session repeatability acceptance now covers inspection, retrieval, analysis, safe shell, blocked shell, git status, and gate review.
- Operator-independence artifact now proves the beta harness can answer inspected, learned, uncertain, blocked, and next-direction questions without normal UI clutter.
- Cross-surface coherence guard passes for TASKS, Current Understanding, and Cyst gate copy.

## Read-Only Goose Replacement Statement

Replace Goose for structured/moderately ambiguous and broader everyday read-only planning/review: 85%.

Tripp.g currently supports broader read-only planning/review workflows across multiple structured and moderately ambiguous session shapes, with stable synthesis, ambiguity handling, branch rolloff, blocked-state continuity, operator-independence evidence, and scoped beta release discipline.

90% remains a future gate. It requires a broadened scenario pack, long-session stress coverage, deeper partial-evidence synthesis quality, expanded operator-independence breadth, and continued release/copy discipline.

This readiness estimate remains limited to read-only planning/review and does not include edit/build replacement, live writes, approval/apply workflows, or broad Goose parity.

## Evidence Required To Keep The 85% Claim

- Mixed-session acceptance harness passes.
- Multi-branch ambiguity acceptance harness passes.
- Branch-reversal acceptance harness passes.
- Contradiction-recovery acceptance harness passes.
- Warden-vs-adapter ambiguity acceptance harness passes.
- Longer-session repeatability harness passes.
- Session variety pack harness passes.
- Partial-evidence synthesis harness passes.
- Operator-independence artifact passes.
- Operator-independence pack artifact passes.
- Cross-surface coherence holds across TASKS, Current Understanding, and Cyst.
- Mock evidence remains clearly non-authoritative and planning-only.
- Branch ranking stays based on usefulness, not truth or verification.
- Less-central branches remain visible when they still add read-only context.
- Blocked outcomes remain visible in task-level and session-level understanding.
- Gate GO means read-only harness readiness only.
- Copy guardrails prevent edit, apply, approval, commit, write, verified-target, or implementation-readiness language.

## 85% Claim Invalidation

Pull the claim back if any of these occur:

- TASKS, Current Understanding, and Cyst contradict each other materially.
- Mock evidence appears authoritative or stronger than inspection.
- Stronger/less-central branch language drifts into verified/correct/invalid path language.
- Blocked outcomes disappear from session synthesis.
- Gate GO is read as broader than read-only harness readiness.
- Operators still need Goose to interpret ordinary mixed read-only sessions.
- The mixed-session, multi-branch, branch-reversal, contradiction-recovery, Warden-vs-adapter, longer-session, or operator-independence harness fails or becomes flaky.

### Replace Goose for edit/build work
- Keep this as a separate milestone.
- Current write lifecycle work is design-only.
- No runtime mutation path is enabled.
- No approval/apply runtime behavior is enabled.
- First define generalized patchPlan and approval/apply requirements.
- Keep all mutation paths blocked until the live-edit gate exists.

## Current Non-Negotiables

- Read-only mode remains the active doctrine.
- Mock evidence supports planning and narrowing only.
- Cyst records audit truth; TASKS presents interpretation.
- Gate GO means read-only harness readiness only.
- No surface may imply edit, apply, approval, commit, or write readiness.
