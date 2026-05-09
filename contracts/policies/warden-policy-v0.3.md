# Warden Policy v0.3

## Purpose

Warden is the policy gate before any descriptor can become execution. It blocks prompt blocks, unsafe descriptor types, unsafe tools, and mode transitions that lack explicit confirmation.

Warden is fail-closed. Unknown shape means denied before Munch.

## Descriptor Rules

```yaml
requiredDescriptorFields:
  - id
  - type
  - intent
  - target
  - constraints
  - budget
  - allowedTools
  - trace
blockedDescriptorTypes:
  - prompt_block
allowedDescriptorTypes:
  - task_descriptor
approvedTraceSources:
  - gateway
  - harness
  - supervisor
allowedTargets:
  - model
  - tool
  - data
```

## Blocked Tools

```yaml
blockedTools:
  - Developer.edit
  - Developer.write
  - delegate
  - Apps.createApp
  - git_commit
```

## Blocked Response Flags

```yaml
blockedResponseFlags:
  - policyViolation
  - unsafeToolCall
  - sandboxEscape
```

## Blocked Intents

```yaml
blockedIntents:
  - unscoped_write
  - credential_access
  - destructive_shell
  - silent_workspace_mutation
```

## Path Sandbox Rules

```yaml
workspaceRoot:
  required_when_files_present: true
  must_be_absolute: true
forbiddenPaths:
  - node_modules/
  - .git/
  - dist/
  - build/
  - coverage/
  - generated/
  - vendor/
```

Warden denies path traversal before Router or Executor see the descriptor.

## Mode Transition Policy

```yaml
CHAT:
  allowed: [AUTO]
  requiresConfirmation: false
  allowedTargets: [conversation, prompt_block]
AUTO:
  allowed: [CHAT]
  requiresConfirmation: true
  allowedTargets: [review, retrieval, guarded_task]
AUDIT:
  allowed: [CHAT, AUTO]
  requiresConfirmation: false
  allowedTargets: [review]
BUILD:
  allowed: [AUDIT]
  requiresConfirmation: true
  allowedTargets: [executor]
```

## Prompt Block Rule

Prompt blocks are always context-only:

```yaml
type: prompt_block
executionAllowed: false
contextOnly: true
descriptorStatus: proposed
```

If a prompt block reaches Warden as an execution candidate, Warden denies it by type.

Warden also denies task descriptors that contain prompt-block-only fields:

- `pinnedWorkspaceRoot`
- `contextSnapshotId`
- `---pb:v1---`

## Denial Codes

Important denial codes:

- `PROMPT_BLOCK_FIELDS_IN_TASK_DESCRIPTOR`
- `AUDIT_MODE_TOOL_EXECUTION_BLOCKED`
- `PATH_SANDBOX_ESCAPE`
- `TRACE_SOURCE_NOT_APPROVED`
- `TRACE_OWNER_MISSING`
- `BUDGET_INVALID`
- `TOOL_BLOCKED`
- `INTENT_BLOCKED`
- `BLOCKED_RESPONSE_FLAG`

## API Projection

```text
GET /api/tripp/permissions
POST /api/tripp/warden/precheck
```

The prototype server currently projects this policy from `readPermissionPolicy()`.
