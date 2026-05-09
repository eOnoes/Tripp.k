# Read-Only Beta Regression Harness v0.1

Status: regression contract for the primary read-only console beta. This is not a live-write approval document.

## Purpose

This harness keeps the read-only beta claim tied to repeatable proof instead of one-off UI review. A run is acceptable only when Tripp.g can carry ordinary read-only planning without Goose interpretation.

## Required Regression Lanes

1. Formal Read-Only Gate
   - v0.1 trial matrix returns GO only when all required scenarios pass.
   - TASKS owns scenario detail.
   - Cyst records gate start/completion and verdict only.

2. Linear Mixed Session
   - Inspect README.md.
   - Use planning-only retrieval.
   - Inspect a related source.
   - Run safe shell.
   - Preserve blocked shell/escalation.
   - Review the formal Read-Only Gate.

3. Multi-Branch Ambiguity Session
   - Start from planning-only retrieval with backend and UI branches.
   - Inspect `server.mjs` and `script.js`.
   - Rank branches by usefulness, not truth.
   - Keep the less-central branch visible when it still adds context.
   - Preserve mock uncertainty and blocked outcomes.

4. Branch Reversal Session
   - Start from planning-only retrieval with two plausible branches.
   - Let one branch appear more useful early.
   - Reorient toward another branch when later inspection better matches the current question.
   - Keep the earlier branch visible as useful context, not as a wrong branch.
   - Preserve mock uncertainty and blocked outcomes.

5. Contradiction Recovery Session
   - Start from a plausible but incomplete interpretation.
   - Add later read-only evidence that changes the current interpretation.
   - Keep earlier context visible as useful, not wrong.
   - Preserve mock uncertainty and blocked outcomes.

6. Longer Repeatability Session
   - Cover inspection, retrieval, analysis, safe shell, blocked shell, git status, and gate review.
   - Confirm the session remains coherent beyond a short happy path.

## Operator-Independence Questions

An operator should be able to answer these from Tripp.g alone:

- What was inspected?
- What did we learn?
- What remains uncertain?
- What stayed blocked in read-only mode?
- Which branch is currently more useful, when branches exist?
- Did the preferred branch change, and why?
- What changed in the current interpretation, and what remains uncertain?
- What is the next read-only direction?

## Cross-Surface Coherence Rules

- TASKS provides conclusions and scenario detail.
- Current Understanding summarizes recent read-only planning state.
- Cyst records audit truth and must not become the conclusion surface.
- Mock evidence remains planning-only and non-authoritative for file changes.
- Gate GO means read-only harness readiness only.
- Safe shell success means an allowlisted read-only command completed, not broad shell capability.

## Beta Blockers

Block or pull back the beta claim if any of these occur:

- TASKS, Current Understanding, and Cyst materially contradict each other.
- Mock evidence appears authoritative.
- A stronger branch is described as verified, confirmed, correct, or approved.
- A less-central branch is described as invalid when it still adds context.
- Blocked outcomes disappear from the session story.
- Gate GO sounds broader than read-only harness readiness.
- Any conclusion or next direction implies edit, apply, approval, patch, commit, or write readiness.
- The mixed-session, multi-branch, or longer-session acceptance harness fails.

## Current Verification Hooks

- `primary read-only beta acceptance flow`
- `multi-branch read-only ambiguity acceptance flow`
- `branch reversal read-only acceptance flow`
- `contradiction recovery read-only acceptance flow`
- `longer read-only repeatability acceptance flow`
- Cyst lifecycle and gate event checks
- read-only wording guardrails
- scoreboard claim checks
