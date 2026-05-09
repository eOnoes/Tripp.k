# Tripp.g Readiness Scoreboard v0.1

Status: working beta scoreboard. This is not a live-write approval document.

## Milestones

| Milestone | Current estimate | Current state | Main blocker | Next proof | Owner |
|---|---:|---|---|---|---|
| Primary read-only console beta | 85-90% | Formal gate, task conclusions, Current Understanding, Cyst audit, and beta acceptance flow are in place. | Operator QA and longer mixed-session coherence. | Run realistic 5-task read-only sessions without Goose interpretation. | Codex + Goose |
| Replace Goose for read-only planning/review | 65-75% | Tripp can present read-only findings and continuity, but Goose still leads deeper synthesis. | Multi-task reasoning quality and ambiguity handling. | Add stronger session synthesis and prove operators can plan next reads from Tripp alone. | Goose review + Codex |
| Replace Goose for edit/build work | 35-45% | Safety doctrine and read-only gates are strong, but live mutation remains blocked. | General patchPlan, approval/apply lifecycle, stale checks, sandboxed apply, and authoritative write evidence. | Build and pass a separate live-edit gate after read-only beta is stable. | Future Tripp + Codex |

## Fastest Path to Add 10 Points

### Primary read-only console beta
- Run a longer mixed-session red-team scenario.
- Confirm TASKS, Current Understanding, and Cyst remain coherent.
- Add operator-facing beta status only after coherence holds.

### Replace Goose for read-only planning/review
- Improve synthesis from recent task conclusions into a more useful planning thread.
- Add acceptance tests for "operator can choose next read-only move without Goose."
- Keep mock evidence visibly non-authoritative.

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
