# Goose Runtime Adapter Contract v0.1

## Status

Doctrine and prototype execution contract. The current implementation exposes the first read-only slice at:

```text
POST /api/tripp/executor/goose-adapter
```

Future TripCore wiring should move this behavior behind `TripCore/Executor/adapters/goose.adapter.js` without changing the payload shape.

## Purpose

`goose.adapter` is the only sanctioned bridge between Goose-native tool behavior and Tripp.g's control plane.

The adapter must obey:

```text
Descriptor -> Warden -> Munch -> Router -> Executor -> goose.adapter -> Cyst
```

No UI panel, prompt block, TraceDroneMap, or Munch retrieval response may call Goose tools directly.

## Interface

```yaml
goose.adapter:
  call(route, descriptor) -> AdapterResult

AdapterResult:
  status: ok | denied | blocked | error | timeout
  tool: string
  invoked: boolean
  result: object | null
  error: AdapterError | null
  trace: AdapterTrace
  redactionLog: string[]
  cystEvent: object
```

## Fail-Closed Gates

The adapter must return without invocation unless every gate passes:

| Gate | Denial Code |
| --- | --- |
| `descriptor.trace.wardenDecision` missing | `WARDEN_MISSING` |
| Warden decision is not `WARDEN_PASS` | `WARDEN_DENIED` |
| `descriptor.trace.munch` missing | `MUNCH_MISSING` |
| Munch budget denied | `MUNCH_BUDGET_DENIED` |
| `route.id` or `route.destination` missing | `ROUTER_MISSING` |
| `route.destination !== "goose.adapter"` | `ROUTE_DESTINATION_MISMATCH` |
| Tool not in first-pass allowlist | `GOOSE_TOOL_UNAVAILABLE` |

Rule: the adapter must not call any tool until all gates pass.

## First-Pass Tool Surface

Allowed:

```yaml
- Developer.tree
- Developer.read
- Developer.shell
```

`Developer.shell` is read-only and allowlisted. It may run only commands equivalent to:

```yaml
- node --version
- npm --version
- git status
- dir
- type <repo-local-path>
- echo <text>
```

Blocked:

```yaml
- Developer.edit
- Developer.write
- Summon.delegate
- Apps.createApp
- Apps.iterateApp
- Apps.deleteApp
- Extensionmanager.manageExtensions
- git_commit
- destructive shell
```

Shell commands containing pipes or redirects are blocked. Shell commands containing mutation-oriented tokens such as `del`, `rmdir`, `git push`, `git commit`, `npm install`, `pip install`, `curl`, `wget`, `rm`, `mv`, or `cp` are blocked.

## Sandbox Rule

All `path`, `file`, or read targets must resolve inside the prototype workspace and must respect `descriptor.constraints.allowedPaths` when present.

Sandbox failures return:

```yaml
status: blocked
error.code: PATH_SANDBOX_ESCAPE
invoked: false
```

## Redaction

Before audit logging, the adapter redacts:

- keys matching `apiKey`, `token`, `secret`, `password`, or `credential`
- bearer tokens in shell command strings
- home-directory paths
- absolute paths outside the workspace

The redacted shape is written to `trace.argsRedacted` and `cystEvent.argsRedacted`. The list of redacted fields is returned as `redactionLog`.

## Result Shaping

Successful results normalize into:

```yaml
result:
  raw: object | string | null
  shaped:
    type: tree | file_content | shell_output | empty
    summary: string
    lines: integer | null
    paths: string[] | null
    content: string | null
    stdout: string | null
    stderr: string | null
    exitCode: integer | null
    meta:
      truncated: boolean
```

Content and stdout are truncated after 8KB with a `[TRUNCATED: N bytes omitted]` marker.

## Error Shaping

Raw exceptions and host stack traces do not enter Cyst. Errors use:

```yaml
AdapterError:
  code: string
  message: string
  wardenDecision: string | null
  munchDecision: string | null
  retryable: boolean
  retryAfterMs: number | null
```

Known codes include:

- `GOOSE_TOOL_UNAVAILABLE`
- `PATH_NOT_FOUND`
- `PATH_ACCESS_DENIED`
- `SHELL_NON_ZERO_EXIT`
- `ADAPTER_TIMEOUT`
- `ADAPTER_INTERNAL_ERROR`

## Cyst Event

Every adapter attempt returns a Cyst-shaped event:

```yaml
cystEvent:
  eventType: adapter_invocation
  adapter: goose.adapter
  descriptorId: string
  traceId: string
  ownerId: string
  wardenDecision: string
  munchDecision: object | null
  routeId: string
  tool: string
  argsRedacted: object
  resultStatus: string
  errorCode: string | null
  redactionCount: integer
  elapsedMs: number | null
  timestamp: string
  sandboxCheck: boolean
```

Cyst must reject persisted events that lack `descriptorId`, `traceId`, or `ownerId`.

## Stop Rule

Do not wire `Developer.edit`, `Developer.write`, delegation, app creation, extension management, or git writes until:

- Warden has explicit policy for those descriptor types
- Cyst has rollback pointers
- the UI has preview/confirmation states
- read-only trials have passed
