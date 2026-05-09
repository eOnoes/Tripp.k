# Workspace Model v0.1

The workspace answers: **what did the agent build?**

It is the surface layer for files, code, previews, logs, changed artifacts, and active work.

## Layout Model

```text
Tripp shell
├─ command rail
├─ conversation surface
└─ workspace sidebar
   ├─ tools tab
   ├─ workspace tab
   └─ status tab
```

The sidebar has two width states:

- `normal`: quick checks, about 280px
- `expanded`: code and preview work, about 60vw

The sidebar should never fully disappear.

## WorkspaceSession

```yaml
session_id: session_001
mode: coding
active_task_id: task_0042
selected_file: demo-website/index.html
preview_mode: code
sidebar:
  active_tab: workspace
  expanded: false
```

## WorkspaceTree

```yaml
root: project
files:
  - name: src
    path: src
    type: directory
    children:
      - name: App.tsx
        path: src/App.tsx
        type: file
        language: tsx
        size: 456
```

## WorkspaceFile

```yaml
path: demo-website/index.html
name: index.html
language: html
size: 4200
modified: 2026-05-09T14:00:00Z
content: "<!doctype html>..."
previewable: true
readonly: true
```

## WorkspacePreview

```yaml
file_path: demo-website/index.html
kind: html
sandbox: allow-scripts
source: srcDoc
status: ready
```

## WorkspaceActivity

```yaml
id: workspace_evt_001
timestamp: 2026-05-09T14:00:00Z
task_id: task_0042
actor: tripp.drone.three
action: file_created
path: demo-website/index.html
status: completed
```

## API v0.1

Read-only first:

- `GET /api/tripp/workspace/tree`
- `GET /api/tripp/workspace/file?path=...`

Later, guarded write:

- `POST /api/tripp/workspace/file`

## Rules

- Workspace file access is repo-local only.
- Ignore generated/runtime/private directories.
- Do not expose `.git`, `.tripp-runtime`, `node_modules`, build outputs, or logs by default.
- HTML preview uses sandboxed iframe content.
- Workspace state should link back to task, agent, and evidence state when possible.
