# Tripp Core Schema v0.1

Tripp is driven by structured state. Chat, workspace, task cards, runtime contracts, and agent traces should render from shared objects instead of loose transcript fragments.

## Master Models

### Agent Model

Who is acting.

Fields:

- `id`: stable agent id, such as `tripp.watcher`
- `displayName`: user-readable name
- `class`: face, supervisor, worker, quality, specialist
- `reportsTo`: parent agent id
- `lane`: operating lane
- `role`: primary and secondary responsibilities
- `soul`: doctrine and temperament
- `operator`: commands, tools, and escalation rules
- `permissions`: allowed and forbidden actions
- `inputContract`: what the agent can receive
- `outputContract`: what the agent must produce

Source today:

- `agents/tripp-swarm-manifest.json`
- `agents/*/*.role.md`
- `agents/*/*.soul.md`
- `agents/*/*.operator.md`

### Work Model

What is being attempted.

Objects:

- `Task`
- `Handoff`
- `ExecutionEvent`
- `Evidence`
- `Artifact`
- `RuntimeContract`

Work state must answer:

- what is the user asking?
- who owns the work?
- what files or runtime surfaces are in scope?
- what has actually happened?
- what evidence supports the result?
- what remains unsafe, unknown, or unverified?

### Workspace Model

What the user sees.

Objects:

- `WorkspaceSession`
- `WorkspaceTree`
- `WorkspaceFile`
- `WorkspacePreview`
- `WorkspaceActivity`
- `WorkspaceProjection`

Workspace state must answer:

- what did the agent build?
- which files are active?
- which files changed?
- what can be previewed?
- what logs or events matter?
- what task/agent owns the current surface?

## Core Objects

### Task

```yaml
id: task_0042
title: Lock goosed runtime contract
type: runtime-investigation
status: in_progress
priority: high
requested_by:
  actor: user
  via: tripp
owner: tripp.watcher
supervised_by: tripp.supervisor
scope:
  repo: C:\Dev\playground.builds\Goose\tripp-goose-prototype
  target:
    - goosed runtime
    - startup behavior
constraints:
  - no destructive actions
  - evidence-backed findings only
success_criteria:
  - startup contract identified
  - observation surface identified
  - bridge viability verified
```

### Handoff

```yaml
id: handoff_18
from: tripp.supervisor
to: tripp.watcher
task_id: task_0042
objective: Determine runtime startup and readiness contract
required_outputs:
  - startup conditions
  - readiness signal
  - failure modes
constraints:
  - readonly investigation only
  - no config mutation
done_when:
  - contract report created
  - open questions listed
  - confidence assigned
```

### ExecutionEvent

```yaml
id: evt_1021
timestamp: 2026-05-08T21:48:22Z
task_id: task_0042
actor: tripp.drone.three
action: shell_command
status: completed
input:
  command: goosed.exe --version
  safety_class: readonly
output:
  exit_code: 0
  summary: goose-server 1.33.1
verified: true
```

### Evidence

```yaml
id: ev_3007
task_id: task_0042
gathered_by: tripp.watcher
type: runtime-observation
claim: goosed.exe reports version 1.33.1
confidence: high
based_on:
  - evt_1021
repeat_count: 1
classification: confirmed_fact
notes:
  - version output observed directly
```

### RuntimeContract

```yaml
id: contract_goosed_agent_v0
target: goosed-agent
owner: tripp.watcher
status: provisional
launch:
  command: goosed.exe agent
  cwd_required: unknown
readiness:
  signals: []
control:
  transport: unknown
observation:
  logs: stdout
failure_modes: []
confidence:
  launch: medium
  readiness: low
  control: low
```

## Design Rule

The UI is a projection of orchestration state.

If the UI needs to show it, the state layer should be able to name it.
