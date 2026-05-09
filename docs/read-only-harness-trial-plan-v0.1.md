# Read-Only Harness Trial Plan v0.1

## Scope

This plan verifies the Tripp.g harness before any write/edit path is enabled.

It covers:

- Warden pass/deny behavior
- Router lane selection
- Goose adapter read-only choke point
- Cyst adapter event logging
- UI task/session projection through TASKS

Forbidden during this plan:

- `Developer.edit`
- `Developer.write`
- delegation
- app creation or mutation
- git write operations
- destructive shell

## Prototype Endpoint

```text
POST /api/tripp/trials/read-only
```

The endpoint runs five safe trials and writes one completed/failed task card to the task queue.

## Trials

| Trial | Expected |
| --- | --- |
| Prompt block deny | Warden denies before Munch, Router, or Adapter. |
| Read README | Warden passes, Router targets `goose.adapter`, Adapter invokes `Developer.read`, Cyst event is recorded. |
| Safe shell | Warden passes, Adapter invokes read-only `Developer.shell` for `node --version`, Cyst event is recorded. |
| Blocked shell | Warden passes, Adapter blocks `git push` with `GIT_WRITE_BLOCKED`, no tool invocation occurs, Cyst event is recorded. |
| Munch retrieval | Retrieval lane resolves to `munch.mock`; no adapter invocation occurs. |

## Pass Criteria

All trials must pass:

- every execution candidate has a Warden state before invocation
- allowed adapter calls produce `status: ok`
- blocked adapter calls return `invoked: false`
- adapter attempts emit Cyst-shaped events
- the trial run creates a TASKS card with the trial evidence

## Stop Conditions

Stop before live writes if:

- any descriptor reaches the adapter without `WARDEN_PASS`
- Router returns an orphan route
- an adapter block still invokes a tool
- Cyst event persistence fails
- task projection hides trial failure evidence
