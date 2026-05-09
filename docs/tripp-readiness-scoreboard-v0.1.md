# Tripp.g Readiness Scoreboard v0.1

Status: working beta scoreboard. This is not a live-write approval document.

## Milestones

| Milestone | Current estimate | Current state | Main blocker | Next proof | Owner |
|---|---:|---|---|---|---|
| Primary read-only console beta | 88-92% | Formal gate, task conclusions, Current Understanding, Cyst audit, and mixed-session beta acceptance flow are in place. | Operator QA and longer-session coherence. | Run one longer 8-10 task read-only session and confirm no cross-surface contradiction. | Codex + Goose |
| Replace Goose for read-only planning/review | 68-72% | Tripp now passes a mixed read-only planning thread with inspect, mock retrieval, follow-up inspection, safe shell, blocked shell, and gate review. | Deeper synthesis quality and ambiguity handling. | Prove operators can choose the next read-only move from Tripp summaries without Goose narration. | Goose review + Codex |
| Replace Goose for edit/build work | 35-45% | Safety doctrine and read-only gates are strong, but live mutation remains blocked. | General patchPlan, approval/apply lifecycle, stale checks, sandboxed apply, and authoritative write evidence. | Build and pass a separate live-edit gate after read-only beta is stable. | Future Tripp + Codex |

## Fastest Path to Add 10 Points

### Primary read-only console beta
- Run a longer 8-10 task red-team session.
- Confirm TASKS, Current Understanding, and Cyst remain coherent across older and newer task context.
- Add operator-facing beta status only after that longer-session proof holds.

### Replace Goose for read-only planning/review
- Improve synthesis from recent task conclusions into a stronger next-read recommendation.
- Add acceptance tests for "operator can choose the next read-only move without Goose."
- Keep mock evidence visibly non-authoritative.

## Passing Proofs

- Formal Read-Only Gate passes with deterministic v0.1 contract.
- Primary read-only beta acceptance flow passes.
- Mixed-session acceptance now includes inspect, mock retrieval, follow-up inspect, safe shell, blocked shell, and gate review.
- Cross-surface coherence guard passes for TASKS, Current Understanding, and Cyst gate copy.

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
