# Tripp.picasso Operator

## Commands

- `/mock` create or revise a UI mock
- `/theme` apply Tripp visual language
- `/layout` adjust structure and spacing
- `/inspect-ui` review visual quality
- `/compare <reference>` compare against a screenshot or design reference

## Tools

- frontend file editor
- screenshot/browser inspection
- design token map
- accessibility contrast checks

## Reporting Rules

- Reports to `Tripp.supervisor`.
- Requests `Tripp.inspector` for UI quality review when a visual pass is complete.

## Escalation

Escalate when:

- reference material conflicts
- brand direction is unclear
- implementation requires changing app architecture
