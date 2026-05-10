# Read-Only Current Understanding Anti-Laundering v0.1

Status: Train 2 station-two contract for the internal scoped 90% read-only planning/review claim.

## Purpose

Current Understanding is the highest-risk laundering surface because it compresses direct findings, planning-only retrieval, blocked outcomes, branch rankings, and adversarial corrections into a compact synthesis. This contract keeps that synthesis useful without upgrading weak evidence.

## Required Rules

### What We Know

- Use direct, bounded, reviewed context only.
- It may say a planning-only retrieval event happened, but must not restate retrieval-only suggestions as direct facts.
- It must not absorb attack-prompt assumptions.
- It must not include adversarial correction language, mixed-evidence poisoning language, mutation-relevant authority, or Warden/blocked-state suppression.

### What Remains Uncertain

- Keep planning-only and mock retrieval non-authoritative.
- Preserve unreviewed paths after multiple inspections when they still matter.
- Preserve adversarial correction context when an attack tried to upgrade evidence.
- Preserve mixed-evidence boundaries when direct, retrieval, safe-shell, or older-summary signals are combined.

### Blocked In Read-Only Mode

- Blocked outcomes decay slower than ordinary findings while still relevant.
- Adversarial hard blocks remain visible as read-only boundary evidence.
- Mixed-evidence escalation that targets mutation, Warden, or blocked-state boundaries is blocked context, not uncertainty-only context.

### Next Read-Only Direction

- Keep one direction.
- Keep it specific.
- Keep it provisional.
- Never turn attack-prompt assumptions, policy/config manipulation, or mutation-adjacent phrasing into a next step.

## Summary Linter

The runtime synthesis path includes a lightweight `planningSummaryLinter` and `isKnownFindingAllowed` guard. The linter should reject or flag:

- adversarial assumptions in `What we know`
- mixed evidence in `What we know`
- retrieval-only evidence in `What we know`
- mutation-adjacent language in next direction
- ownership, finality, or certainty inflation
- missing uncertainty
- missing blocked-state visibility

## Candidate Tests

- `current_understanding_knowns_do_not_absorb_synthesized_or_mock_only_assumptions`
- `current_understanding_knowns_remain_direct_supported_under_compression`
- `current_understanding_uncertainty_persists_under_long_session_compression`
- `blocked_state_remains_visible_when_summary_compacts_older_context`
- `branch_ranking_copy_remains_usefulness_based_under_repeated_updates`
- `next_direction_remains_provisional_after_multiple_branch_shifts_and_adversarial_attempts`
- `summary_linter_rejects_finality_ownership_or_mutation_adjacent_language`
- `current_understanding_does_not_promote_mixed_evidence_poisoning_into_knowns`
