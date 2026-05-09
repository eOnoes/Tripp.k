# Goose Runtime Adapter Contract v0.1

## Purpose

This contract defines the narrow bridge between Tripp.g and Goose/goosed runtime behavior.

The adapter is not implemented yet. This document is the stop-rule artifact required before live execution work begins.

## Adapter Boundary

All live Goose tool calls must pass through an Executor-owned adapter.

```text
Descriptor -> Warden -> Munch -> Router -> Executor -> goose.adapter -> Cyst
```

No UI panel, prompt block, TraceDroneMap, or Munch retrieval response may call Goose tools directly.

## Initial Allowed Tool Surface

```yaml
allowed:
  - tree
  - shell.readonly
  - Developer.read
blocked:
  - Developer.edit
  - Developer.write
  - delegate
  - Apps.createApp
  - git_commit
```

## Required Adapter Call Shape

```yaml
adapter: goose
route: string
descriptor:
  type: task_descriptor
  intent: string
  target: string
  constraints: string[]
  budget:
    maxTokens: number
  allowedTools: string[]
  trace:
    traceId: string
```

## Cyst Audit Event

Every adapter call emits:

```yaml
actor: tripp.executor
adapter: goose
tool: string
argsRedacted: object
resultStatus: completed | failed | blocked
timestamp: string
taskId: string
descriptorStatus: approved
```

## Redaction Rule

Arguments must be redacted before audit if they contain:

- credentials
- tokens
- personal identifiers
- environment secrets
- file contents longer than the approved excerpt budget

## Failure Rule

Adapter failures must return structured failure state to Cyst:

```yaml
resultStatus: failed
failureKind: startup | transport | permission | timeout | tool_error | malformed_response
retryable: boolean
summary: string
```

## Stop Rule

Do not wire `Developer.edit`, `Developer.write`, delegation, or app creation until Warden has explicit policy for those descriptor types and Cyst has rollback pointers.
