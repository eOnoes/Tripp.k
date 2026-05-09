# Tripp Agent Doctrine Pack

Starter files for the Tripp swarm.

Each agent has three docs:

- `role.md`: what the agent is responsible for.
- `soul.md`: the agent's working temperament and voice.
- `operator.md`: commands, tools, reporting, and escalation rules.

Keep these short. The strongest doctrine should be easy for an agent to remember under pressure.

Runtime-contract doctrine lives in `docs/`:

- `docs/runtime-contract-template.md`
- `docs/forward-mode-gate.md`
- `docs/goosed-agent-contract-report.md`

## Reporting Chain

```text
User
└─ Tripp
   └─ Tripp.supervisor
      ├─ specialist / drone agents
      ├─ Tripp.inspector
      └─ Tripp.auditor
```

Tripp is the only face the user should need to manage directly.
