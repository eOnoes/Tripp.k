# Tripp / Goose Frontend Audit

## Current State

There are three relevant things in this workspace:

```text
dist-windows/
  Packaged Goose desktop app and goosed backend.

kimi-agent-deployment-v1/
  Extracted Kimi visual reference build.

tripp-goose-prototype/
  Active Tripp terminal prototype.
```

Only `tripp-goose-prototype` is the active Tripp app surface.

## Tripp Prototype Stack

Current stack:

- static HTML
- static CSS
- vanilla JS
- JSON data files
- tiny Node static server

This is intentionally simple. It is good for visual iteration and doctrine/data shaping. It is not yet wired to Goose runtime behavior.

## Goose Packaged App Stack

Observed from `dist-windows/resources/app.asar`:

- Electron desktop app
- React renderer
- Vite build
- generated OpenAPI client
- `goosed.exe` Rust backend
- Electron main process starts `goosed`
- renderer talks to local backend using `X-Secret-Key`

Goose backend version:

```text
goose-server 1.33.1
```

Goose daemon commands:

```text
goosed.exe agent
goosed.exe mcp <SERVER>
goosed.exe validate-extensions
```

## Important Goose Runtime Mechanics

Electron main process:

- chooses/sets `GOOSE_PORT`
- sets `GOOSE_SERVER__SECRET_KEY`
- starts or connects to `goosed`
- health checks `/status`
- exposes backend URL through IPC `get-goosed-host-port`
- exposes secret through IPC `get-secret-key`

Renderer:

- receives base URL and secret
- calls backend HTTP API
- uses generated client routes

## Goose API Surfaces Worth Reusing

High-value routes for first integration:

```text
/status
/system_info
/config
/config/read
/config/upsert
/config/providers
/config/extensions
/config/permissions
/config/slash_commands
/sessions
/sessions/search
/sessions/{id}/events
/sessions/{id}/reply
/sessions/{session_id}
/agent/start
/agent/stop
/agent/restart
/agent/tools
/agent/call_tool
/action-required/tool-confirmation
```

Later routes:

```text
/recipes/*
/schedule/*
/local-inference/*
/dictation/*
/tunnel/*
/telemetry/event
/mcp-ui-proxy
```

## What Goes Where

### Tripp Frontend Owns

- visual identity
- top lime header
- glyph rail
- terminal chat surface
- right ops panel
- swarm tree display
- agent doctrine viewer
- Tripp command vocabulary
- user-facing wording

Reason: this is the product face. It should not inherit Goose's visual or naming model.

### Goose Backend Owns Initially

- provider configuration
- sessions
- chat/reply execution
- MCP extension plumbing
- tools list and tool calls
- permissions and tool confirmations
- schedules/recipes if we choose to expose them

Reason: these are the hard harness behaviors Goose already provides.

### Tripp Adapter Layer Should Own

- mapping Goose concepts to Tripp names
- hiding raw Goose API details from UI components
- translating `TRIPPMODE::CHAT` / `TRIPPMODE::AUTO`
- eventually translating Tripp agents into concrete Goose sessions/tools/prompts

Reason: this avoids wiring the UI directly to Goose-specific semantics.

## Proposed Bridge Order

1. Runtime status

   Wire right panel `SYSTEM STATUS` to `/status` and `/system_info`.

2. Tool registry

   Wire `TOOL REGISTRY` to `/agent/tools`.

3. Sessions

   Wire `SESSIONS` to `/sessions` and `/sessions/search`.

4. Chat send/reply

   Wire terminal input to `/reply` or session reply routes after confirming required payloads.

5. Tool confirmations

   Wire permission events to `/action-required/tool-confirmation`.

6. Extensions/config

   Wire provider/extensions panels to `/config/*` only after core chat works.

7. Tripp swarm

   Add Tripp supervisor/drone/inspector/auditor layer as an orchestration model above Goose sessions/tools.

## What Not To Do Yet

- Do not mutate the packaged Goose app.
- Do not edit `dist-windows/app.asar`.
- Do not rename backend environment variables yet.
- Do not remove Goose backend semantics until the Tripp adapter exists.
- Do not build the swarm before the basic bridge works.

## Recommended Stack Direction

Keep the static prototype for now.

When behavior wiring starts, move to:

```text
Vite + React + TypeScript
```

Later desktop shell options:

```text
Electron
Tauri
```

Given Goose already uses Electron and the backend bridge pattern is Electron-aware, Electron is the lower-friction first desktop target. Tauri may be worth evaluating later if footprint matters.

## Decision

Use Goose as the harness substrate, not the product face.

Use Tripp as the product face, command language, swarm model, and orchestration identity.

Build a Tripp adapter between them before wiring UI components directly to Goose APIs.

## Goose Button Interaction Model

Observed sidebar model:

```text
Home        -> route page
Chat        -> route page plus expandable session controls
Recipes     -> route page
Skills      -> route page
Apps        -> route page
Scheduler   -> route page
Extensions  -> route page
Settings    -> route page
```

Most primary buttons are simple route switches. They open a full page/panel with that section's options.

`Chat` is different. It is both:

- a route to the chat surface (`/pair`)
- a session control group

Goose's Chat group includes:

```text
Start New Chat
New Chat
recent session rows
Show All
```

Internally, Goose has a chat context that can reset to:

```text
sessionId: ""
name: "New Chat"
messages: []
recipe: null
recipeParameterValues: null
```

Relevant backend routes for this behavior include:

```text
/agent/start
/agent/resume
/agent/update_from_session
/agent/update_session
/sessions
/sessions/search
/sessions/{id}/events
/sessions/{id}/reply
/sessions/{session_id}
```

## Tripp Solution For Chat

Do not model Chat as a normal right-panel menu.

Model it as the terminal's primary mode:

```text
TRIPPMODE::CHAT
```

Recommended Tripp behavior:

```text
Chat glyph / mode button
  -> focuses the terminal input
  -> shows active session state in right panel

+ NEW SESSION
  -> creates local pending chat state first
  -> then calls Goose /agent/start or session creation flow when backend is connected

Existing session row
  -> loads session metadata
  -> resumes or updates the active backend session
  -> subscribes to /sessions/{id}/events

Show All / Search
  -> opens a sessions drawer/panel using /sessions and /sessions/search
```

This keeps the Tripp UI terminal-first while preserving Goose's session mechanics.
