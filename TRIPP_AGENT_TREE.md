# Tripp Agent Tree

First-pass working model for the Tripp swarm.

## Core Shape

```text
Tripp
└─ Tripp.supervisor
   ├─ Tripp.drone.one
   ├─ Tripp.drone.two
   ├─ Tripp.drone.three
   ├─ Tripp.inspector
   └─ Tripp.auditor
```

## Roles

### Tripp

The face of the app. Tripp owns the conversation, the tone, and the final answer. The user should feel like they are talking to one coherent entity, even when the work is distributed under the hood.

### Tripp.supervisor

The coordinator. It receives intent from Tripp, breaks the work into scoped tasks, chooses which agents should work, prevents overlap, and merges the result back into a single clean response.

### Tripp.drone.one

Tool worker for set 1-3. Early candidate scope:

- context reads
- file listing
- status probes

### Tripp.drone.two

Tool worker for set 4-6. Early candidate scope:

- code search
- code analysis
- structured summaries

### Tripp.drone.three

Tool worker for set 7-10. Early candidate scope:

- command execution
- test verification
- diff review
- patch support

### Tripp.inspector

Quality gate. It checks whether the work stayed on point, avoided unnecessary churn, followed the requested style, and produced something usable.

### Tripp.auditor

Risk and traceability gate. It checks permission boundaries, tool use, state changes, assumptions, and whether the final answer has enough evidence behind it.

## Early Layout Idea

The right ops panel can eventually gain a `SWARM TREE` section:

- top row: `Tripp`
- second row: `Tripp.supervisor`
- worker rows grouped by drone set
- inspector/auditor shown as quality gates

The main terminal should still speak as `tripp>`. Internal agents can appear as compact trace events only when useful:

```text
tripp.supervisor :: assigned code search to Tripp.drone.two
tripp.inspector  :: no scope drift found
tripp.auditor    :: permission boundary clean
```

## Design Principle

The swarm should be visible enough to trust, but not so visible that the user feels they are managing the swarm manually.
