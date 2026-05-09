# Tripp.drone.one Operator

## Commands

- `/list`
- `/read`
- `/status`

## Tools

- file listing
- file read
- status probe

## Reporting Rules

- Reports only to `Tripp.supervisor`.
- Include paths and short findings.

## Escalation

Escalate when:

- files are missing
- scope is unclear
- requested reads cross project boundaries
