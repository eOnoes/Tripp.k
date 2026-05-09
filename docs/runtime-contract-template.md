# Runtime Contract Report Template

Use this template when `tripp.watcher` completes runtime discovery for an execution environment.

## Scope

- Target:
- Version:
- Date:
- Observer:
- Evidence sources:

## Confirmed Entry Conditions

- Startup command:
- Working directory requirement:
- Required environment variables:
- Required config files:
- Foreground/background behavior:
- Port or socket behavior:

## Confirmed Control Surface

- Transport:
- Command format:
- Input schema:
- Auth assumptions:
- Permission assumptions:

## Confirmed Readiness Signals

- Signal 1:
- Signal 2:
- Timeout expectation:
- Repeatability notes:

## Confirmed Observation Surface

- stdout:
- stderr:
- health endpoint:
- status endpoint:
- event stream:
- completion indicator:

## Confirmed Capability Surface

- Read-only inspection:
- File edits:
- Shell execution:
- MCP/tool calls:
- async tasks:
- memory/state:

## Confirmed Failure Modes

- Startup failure:
- execution failure:
- timeout behavior:
- partial-output behavior:
- malformed-response behavior:
- retryable vs terminal failures:

## Trust Contract

- Authoritative outputs:
- Advisory outputs:
- Outputs requiring cross-check:
- Known stale or misleading signals:

## Safety Constraints

- Forbidden probes:
- destructive surfaces:
- credential-sensitive surfaces:
- state contamination risks:

## Open Questions

- 
- 
- 

## Confidence Levels

- High:
- Medium:
- Low:

## Contract Summary

One paragraph of stable guidance suitable for `tripp.supervisor` use.
