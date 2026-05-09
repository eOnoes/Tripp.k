# Prompt Block Format v0.1

## Purpose

Tripp.g can hand work to another agent by emitting a copy-ready writing block instead of loose chat text. This keeps prompts easy to inspect, copy, paste, and archive.

## Message Shape

```json
{
  "kind": "agent",
  "speaker": "tripp.prompt>",
  "body": "Copy-ready prompt block prepared.",
  "promptBlock": {
    "label": "Goose.Prompt",
    "body": "Goose.Prompt\n\nContext:\n- ...\n\nTask:\n- ...\n\nOutput:\n- ..."
  }
}
```

## Rendering Rules

- The UI renders `promptBlock.body` inside a fixed-width writing block.
- Each block gets a `COPY` button.
- Fenced Markdown blocks in normal message text also render as copyable prompt blocks.
- Prompt block text is never auto-executed. It is handoff material only.

## Standard Block Header

```text
Goose.Prompt

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
