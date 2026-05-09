# Forward Mode Gate

Forward mode means Tripp speaks to a runtime close to its native semantics instead of hiding uncertainty behind a shim.

Do not leave shim mode until `tripp.watcher` has produced an evidence-backed runtime contract and `tripp.inspector` has verified it is actionable.

## Shim Mode

Tripp uses wrappers, normalized outputs, and guarded fallback behavior.

Shim mode is allowed when:

- startup behavior is not fully known
- readiness is not reliably detectable
- failure modes are not mapped
- response shape is unstable
- the bridge must protect the user from runtime uncertainty

## Forward Mode

Tripp relies on the runtime's native lifecycle, status, capabilities, and failures.

Forward mode requires:

- reproducible startup path
- stable readiness signal
- stable control surface
- stable observation surface
- mapped failure behavior
- at least one verified end-to-end loop
- permission and state contamination review

## Required Evidence

Before forward mode:

- `tripp.watcher` completes a runtime contract report.
- `tripp.drone.three` proves startup, readiness, and one request loop through safe probes.
- `tripp.drone.two` maps observed routes, schemas, and event behavior.
- `tripp.auditor` confirms probes did not overreach or contaminate state.
- `tripp.inspector` confirms the contract is usable by the bridge.

## Hard Stops

Stay in shim mode if:

- readiness depends only on timing
- output shape changes across runs
- failures are silent or ambiguous
- control surface is inferred but not observed
- logs are the only evidence for protocol guarantees
- a probe changes the state being measured

## Gate Decision Format

```md
# Forward Mode Gate Decision

Runtime:
Version:
Date:
Decision: stay-shim | allow-forward | partial-forward

Evidence:
- 

Blocking Unknowns:
- 

Allowed Forward Surfaces:
- 

Shim Surfaces Retained:
- 

Auditor Notes:

Inspector Notes:
```
