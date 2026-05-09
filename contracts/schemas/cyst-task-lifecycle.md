# Cyst Task Lifecycle Schema v0.1

## Purpose

The Cyst task lifecycle gives Tripp.g one auditable state model for dry-run descriptors, Warden decisions, routing, execution, verification, failure, and rollback.

It prevents task cards, Warden policy, Executor calls, and UI state from inventing separate lifecycle meanings.

## States

```yaml
states:
  - proposed
  - routed
  - evidence_ready
  - gated
  - approved
  - running
  - completed
  - failed
  - dismissed
terminal:
  - completed
  - failed
  - dismissed
```

## Allowed Transitions

```yaml
proposed:
  - routed
  - dismissed
routed:
  - evidence_ready
  - gated
  - completed
  - dismissed
evidence_ready:
  - gated
  - approved
  - dismissed
gated:
  - approved
  - dismissed
approved:
  - running
  - completed
  - failed
  - dismissed
running:
  - completed
  - failed
completed: []
failed: []
dismissed: []
```

## Descriptor Status Mapping

| Lifecycle State | Descriptor Status |
| --- | --- |
| `proposed` | `proposed` |
| `routed` | `review` |
| `evidence_ready` | `review` |
| `gated` | `review` |
| `approved` | `approved` |
| `running` | `approved` |
| `completed` | `verified` |
| `failed` | `failed` |
| `dismissed` | `dismissed` |

## Event Shape

```yaml
taskId: string
descriptorStatus: proposed | review | approved | verified | failed | dismissed
state: string
previousState: string | null
actor: string
reason: string
timestamp: string
rollback:
  files: string[]
  tests: string[]
  note: string
```

## Rollback Rule

Rollback pointers are required once a task reaches:

- `approved`
- `running`
- `completed`
- `failed`

The rollback surface should come from TraceDroneMap when available. If no trace map exists, the patch target is the fallback rollback file.

## API

```text
GET /api/tripp/task-lifecycle
```

Returns the lifecycle contract currently enforced by the prototype server.
