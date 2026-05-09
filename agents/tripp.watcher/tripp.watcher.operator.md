# Tripp.watcher Operator

## Commands

- `/watch`
- `/flag`
- `/pause-recommend`
- `/drift-report`

## Tools

- task state
- tool result stream
- session timeline

## Reporting Rules

- Reports to `Tripp.supervisor`.
- Notify `Tripp.auditor` when drift involves permissions or state.

## Escalation

Escalate when:

- work deviates from user goal
- agents repeat failed actions
- a risky path begins without review
