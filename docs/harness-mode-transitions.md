# Harness Mode Transitions v0.1

## Purpose

Harness modes describe operator intent and UI posture. They do not grant execution by themselves.

Mode changes are navigation and control-plane signals. Tool execution still requires descriptor validation, Warden approval, routing, Executor handling, and Cyst audit.

## Modes

| Mode | Meaning | Execution Meaning |
| --- | --- | --- |
| `CHAT` | Conversational session. | No execution implied. |
| `AUTO` | Supervised task routing can occur. | Tasks can be proposed, not silently executed. |
| `AUDIT` | Review evidence, policy, and result quality. | Read-only review. |
| `BUILD` | Future executor-backed implementation lane. | Requires explicit confirmation and Warden approval. |

## Chat vs Auto Contract

CHAT changes conversational routing. It keeps the operator in a response-first posture and does not imply supervised task execution.

AUTO changes whether supervised task routing can occur. It allows Tripp to propose scoped task cards when a prompt looks executable, but those tasks still remain inside the current read-only harness rules.

Neither `CHAT` nor `AUTO` changes:

- read-only scope
- Warden authority
- blocked-state rules
- evidence provenance rules
- Read-Only Gate semantics
- Cyst audit-only ownership
- TASKS and Current Understanding interpretation ownership
- approval/apply runtime availability
- edit/build readiness
- broad Goose parity

Mode changes can affect which prompt lane is used for conversational/model routing, but they do not upgrade evidence authority, unblock denied requests, or turn a Gate GO into write-capable readiness.

## Transition Rules

```yaml
CHAT -> AUTO:
  requiresConfirmation: false
  meaning: allow task proposals
AUTO -> CHAT:
  requiresConfirmation: true
  meaning: leave task-routing posture
AUTO -> BUILD:
  requiresConfirmation: true
  meaning: future live implementation posture
BUILD -> AUDIT:
  requiresConfirmation: true
  meaning: leave executor posture for review
AUDIT -> CHAT:
  requiresConfirmation: false
  meaning: return to conversation
```

## Prompt Block Rule

Prompt blocks do not change mode.

Copying, referencing, or viewing a prompt block must not:

- create a task
- approve a task
- open BUILD mode
- enqueue Executor work
- alter pipeline state

## UI Rule

The chat-follow affordance is navigation only. It must not change mode or lifecycle state.
