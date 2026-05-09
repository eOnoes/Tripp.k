# Runtime Contract Report: goosed agent

## Scope

- Target: packaged Goose daemon `goosed.exe agent`
- Version: `goose-server 1.33.1`
- Date: 2026-05-08
- Observer: `tripp.watcher`
- Evidence sources:
  - `C:\Dev\playground.builds\Goose\dist-windows\resources\bin\goosed.exe --help`
  - `C:\Dev\playground.builds\Goose\dist-windows\resources\bin\goosed.exe agent --help`
  - `C:\Dev\playground.builds\Goose\dist-windows\resources\bin\goosed.exe --version`
  - Tripp bridge health probe

## Confirmed Entry Conditions

- Startup command: `goosed.exe agent`
- Working directory requirement: unknown
- Required environment variables: unknown
- Required config files: unknown
- Foreground/background behavior: unknown
- Port or socket behavior: unknown

## Confirmed Control Surface

- Transport: unknown
- Command format: unknown
- Input schema: unknown
- Auth assumptions: unknown
- Permission assumptions: unknown

## Confirmed Readiness Signals

- Signal 1: unknown
- Signal 2: unknown
- Timeout expectation: unknown
- Repeatability notes: not yet tested

## Confirmed Observation Surface

- stdout: `goosed.exe --help`, `goosed.exe agent --help`, and `goosed.exe --version` emit CLI text.
- stderr: unknown
- health endpoint: not confirmed
- status endpoint: not confirmed
- event stream: not confirmed
- completion indicator: not confirmed

## Confirmed Capability Surface

- Read-only inspection: not confirmed
- File edits: not confirmed
- Shell execution: not confirmed
- MCP/tool calls: not confirmed
- async tasks: not confirmed
- memory/state: not confirmed

## Confirmed Failure Modes

- Startup failure: unknown
- execution failure: unknown
- timeout behavior: unknown
- partial-output behavior: unknown
- malformed-response behavior: unknown
- retryable vs terminal failures: unknown

## Trust Contract

- Authoritative outputs:
  - `goosed.exe --version` reported `goose-server 1.33.1`.
  - `goosed.exe --help` confirmed top-level commands: `agent`, `mcp`, `validate-extensions`, `help`.
  - `goosed.exe agent --help` confirmed the agent subcommand exists.
- Advisory outputs:
  - `GOOSED_BOOT: main entered` appeared after CLI help/version output.
- Outputs requiring cross-check:
  - Any implied server port, protocol, or lifecycle behavior.
- Known stale or misleading signals:
  - None confirmed yet.

## Safety Constraints

- Forbidden probes:
  - destructive workspace commands
  - credential extraction
  - provider config mutation
- destructive surfaces: unknown
- credential-sensitive surfaces: likely provider/config files, not yet mapped
- state contamination risks:
  - launching `goosed.exe agent` may create or mutate user config/session state

## Open Questions

- Does `goosed.exe agent` bind an HTTP server, local socket, stdio protocol, or another transport?
- What readiness signal means it is safe to send requests?
- Which config files and environment variables does it require?
- What request/response schema does the agent use?
- How are tool events surfaced?
- How are errors surfaced?

## Confidence Levels

- High:
  - packaged `goosed.exe` exists
  - version is `1.33.1`
  - `agent` subcommand exists
- Medium:
  - bridge can detect the packaged daemon and expose shim health
- Low:
  - native `goosed agent` protocol and lifecycle

## Contract Summary

`goosed.exe agent` is present and versioned, but its native runtime contract is not yet locked. Tripp.g should remain in shim mode through `tripp-bridge.mjs` until watcher proves startup, readiness, control, observation, and failure behavior through repeatable safe probes.
