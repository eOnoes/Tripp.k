# Warden Policy v0.2

## Purpose

Warden is the policy gate before any descriptor can become execution. It blocks prompt blocks, unsafe descriptor types, unsafe tools, and mode transitions that lack explicit confirmation.

## Descriptor Rules

```yaml
requiredDescriptorFields:
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
  - trace_descriptor
  - runtime_contract_descriptor
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

## Blocked Intents

```yaml
blockedIntents:
  - unscoped_write
  - credential_access
  - destructive_shell
  - silent_workspace_mutation
```

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

## API Projection

```text
GET /api/tripp/permissions
```

The prototype server currently projects this policy from `readPermissionPolicy()`.
