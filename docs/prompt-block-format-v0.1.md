# Prompt Block Format v0.1

## Purpose

Tripp.g can hand work to another agent by emitting a copy-ready writing block instead of loose chat text. This keeps prompts easy to inspect, copy, paste, and archive.

Prompt blocks are contract objects, not task descriptors. See [PromptBlockDescriptor v0.1](../contracts/descriptors/prompt-block-descriptor-v0.1.md).

## Message Shape

```json
{
  "kind": "agent",
  "speaker": "tripp.prompt>",
  "body": "Copy-ready prompt block prepared.",
  "promptBlock": {
    "type": "prompt_block",
    "label": "Goose.Prompt",
    "header": "---pb:v1---",
    "body": "Goose.Prompt\n\nContext:\n- ...\n\nTask:\n- ...\n\nOutput:\n- ...",
    "executionAllowed": false,
    "contextOnly": true,
    "descriptorStatus": "proposed",
    "requiresReview": true,
    "pinnedWorkspaceRoot": "C:\\Dev\\playground.builds\\Goose\\tripp-goose-prototype",
    "contextSnapshotId": "ctx_...",
    "validation": {
      "status": "valid"
    }
  }
}
```

## Rendering Rules

- The UI renders `promptBlock.body` inside a fixed-width writing block.
- Each block gets a `COPY` button.
- Fenced Markdown blocks in normal message text also render as copyable prompt blocks.
- Prompt block text is never auto-executed. It is handoff material only.
- Prompt blocks render in the PB lane with no approve, run, or pipeline glyph.

## Standard Block Header

```text
---pb:v1---
Goose.Prompt

pinnedWorkspaceRoot: C:\Dev\playground.builds\Goose\tripp-goose-prototype
contextSnapshotId: ctx_...
executionAllowed: false
contextOnly: true
descriptorStatus: proposed

Context:
- ...

Task:
- ...

Output:
- ...
```

## Current Trigger Phrases

Tripp.g returns a `Goose.Prompt` block when a prompt includes:

- `Goose.Prompt`
- `goose` and `prompt`
- `copy ready prompt`
- `copy-ready prompt`

## Safety Doctrine

Prompt blocks are writing artifacts, not tool calls. They can describe suggested work, but they must not imply that Tripp.g, Goose, or any agent has already executed the task.

The validator endpoint is:

```text
POST /api/tripp/prompt-block/validate
```

It returns `valid`, `stale_root`, `stale_context`, or `malformed`.
