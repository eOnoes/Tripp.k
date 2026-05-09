# Kimi Swarm Comparison Integration v0.1

Status: architecture comparison note. This document does not change runtime behavior or the current scoped 85% read-only planning/review readiness estimate.

## Summary

Kimi's swarm is simpler and proven for fast build orchestration. Tripp.g is more formal and potentially more trustworthy at scale, but only if its extra structure prevents failure modes instead of creating them.

## Keep

| Tripp.g element | Reason |
|---|---|
| Warden as hard safety authority | Supervisor should not be able to override read-only safety policy. |
| Session continuity | Required for branch ambiguity, contradiction recovery, rolloff, and operator-readable planning threads. |
| Multiple evidence classes | Direct inspection, mock retrieval, safe-shell observation, blocked outcomes, gate verdicts, and synthesis carry different trust levels. |
| Branch ambiguity and contradiction recovery | These are core differentiators from single-path orchestration. |
| Cyst as audit/timeline truth only | Keeps audit history separate from interpretation surfaces. |

## Adopt

| Kimi lesson | Tripp.g adoption |
|---|---|
| Simplicity is a proof advantage | Add capability lists and keep authority boundaries crisp. |
| Single-shot agents reduce contamination | Preserve session continuity, but add provenance, aging, and anti-laundering controls. |
| Manual orchestration validates before proceeding | Keep operator-independence artifacts and add adversarial packs before future 90% claims. |
| Vague percentages overlead | Frame scores as internal, scoped, gate-based readiness only. |
| Proof matters more than architecture claims | Require contract-to-runtime traceability and adversarial evidence before score increases. |

## Reject

| Kimi suggestion | Reason |
|---|---|
| Make Supervisor the sole authority | This would weaken Warden's hard-deny role and blur safety authority. |
| Drop persistent sessions entirely | This would remove Tripp.g's continuity, branch rolloff, and contradiction-recovery advantages. |
| Use only direct inspection evidence | This is too restrictive for current read-only planning; the better fix is explicit provenance separation. |
| Replace all percentages with capability lists internally | Keep percentages as internal gate shorthand, but pair them with capability lists and strict scope language. |

## Capability List

Current scoped read-only planning/review can:

- inspect repo-local files through read-only routes
- use planning-only retrieval to narrow review direction
- run bounded allowlisted safe-shell observations
- surface blocked write-like outcomes
- summarize recent read-only session state
- preserve ambiguity, branch shifts, and contradiction recovery without finality language
- show evidence provenance where synthesis risk is highest

Current scoped read-only planning/review cannot:

- edit files
- apply patches
- approve changes
- run live write workflows
- validate implementation readiness
- authorize policy/config mutation
- claim broad Goose parity
- serve as external validation of safety or correctness

## Candidate Tests

- `kimi_comparison_keeps_warden_as_hard_safety_authority`
- `kimi_comparison_keeps_session_continuity_with_provenance_controls`
- `kimi_comparison_adopts_capability_list_wording`
- `kimi_comparison_rejects_supervisor_as_sole_safety_authority`
- `kimi_comparison_scores_remain_internal_scoped_and_gate_based`
