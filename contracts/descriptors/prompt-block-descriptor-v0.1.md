# PromptBlockDescriptor v0.1

## Purpose

`PromptBlockDescriptor` is a write-only handoff artifact. It packages context and instructions for copy/paste into another agent, but it is not an executable task descriptor.

Prompt blocks must never open an execution lane, AUTO route, tool approval, Warden approval, or filesystem mutation path.

## Required Shape

```yaml
type: prompt_block
header: "---pb:v1---"
label: string
body: string
executionAllowed: false
contextOnly: true
descriptorStatus: proposed
requiresReview: true
pinnedWorkspaceRoot: string
contextSnapshotId: string | null
validation: PromptBlockValidation
```

## Body Header

Every prompt block body starts with:

```text
---pb:v1---
```

AUTO routers, task routers, and Warden validators must ignore this block as an execution candidate.

## Validation Result

```yaml
type: prompt_block_validation
valid: boolean
status: valid | stale_root | stale_context | malformed
executionAllowed: false
contextOnly: true
descriptorStatus: proposed
pinnedWorkspaceRoot: string
currentWorkspaceRoot: string
contextSnapshotId: string | null
warnings: string[]
```

## Warden Rule

Prompt blocks are denied as executable descriptors by type.

```yaml
blockedTypes:
  - prompt_block
allowedDescriptorTypes:
  - task_descriptor
  - trace_descriptor
  - runtime_contract_descriptor
```

## UI Rule

Prompt blocks render in the PB visual lane:

- gray glass background
- `PB` prefix
- copy/reference affordances only
- no approve button
- no run button
- no task status glyph
- no pipeline state change

## Staleness Rules

- If `pinnedWorkspaceRoot` does not match the current workspace, status is `stale_root`.
- If `contextSnapshotId` is missing, status is `stale_context`.
- If the `---pb:v1---` header is missing, status is `malformed`.
- If executable fields appear in the body, status is `malformed`.

## Doctrine

Prompt blocks are valuable for handoff, but dangerous if treated like plans. They are context-only artifacts with explicit execution denial.
