# Tripp.g

Tripp terminal harness prototype.

This repository is the Tripp-facing frontend and agent doctrine workspace. It intentionally does not include or modify packaged Goose reference builds.

## Run Locally

Open `index.html` directly, or run the local static server:

```powershell
node .\server.mjs
```

Then open:

```text
http://127.0.0.1:4177/
```

Run the core AUTO-lane verifier:

```powershell
node .\scripts\verify.mjs
```

## Design Direction

- Match the Tripp terminal shell first: lime header, glyph rail, terminal surface, right ops panel, and bottom command/status bars.
- Keep the Tripp black/lime identity.
- Keep the left rail narrow and non-expanding.
- Keep sessions, tools, and system status in the right ops panel.
- Wire backend behavior behind a Tripp adapter layer so implementation details do not leak into the product face.

## Current Status

- Static HTML/CSS/vanilla JS prototype.
- Local JSON-backed terminal, tools, sessions, and status data.
- Interactive chat/auto modes, session switching, new chat action, expandable tools, and collapsible ops panel.
- Tripp adapter routes for bootstrap and prompt replies:
  - `GET /api/tripp/bootstrap`
  - `GET /api/tripp/health`
  - `POST /api/tripp/reply`
  - `GET /api/tripp/tasks`
  - `POST /api/tripp/tasks/:taskId/approve`
  - `POST /api/tripp/tasks/:taskId/dismiss`
  - `POST /api/tripp/sessions`
  - `POST /api/tripp/sessions/:sessionId/select`
- Optional backend bridge env:
  - `TRIPP_BACKEND_URL`
  - `TRIPP_BACKEND_SECRET` or `GOOSE_SERVER__SECRET_KEY`
  - `TRIPP_ENABLE_BACKEND_REPLY=true`
- Agent role/soul/operator doctrine lives under `agents/`.

Task approval is guarded. Approving a write task prepares a patch preview; applying currently supports only the approved welcome-message patch in `tripp-terminal-data.json`.
Inspect tasks are read-only, auto-complete without acknowledgement, and can show excerpts for approved repo-local files such as `README.md`, `server.mjs`, `script.js`, `styles.css`, and `tripp-terminal-data.json`.
`git status` tasks are also read-only and auto-complete; mutating git actions such as commit are recorded as gated without an approval/apply click-through.
Shell tasks auto-run only a small read-only allowlist such as `node --version`, `npm --version`, and repo file listing; other shell requests are recorded as gated.
Analysis tasks are read-only, auto-complete for approved repo-local files, and show a short excerpt plus lightweight findings in the task detail.
Task and session history are persisted locally under `.tripp-runtime/`, which is ignored by Git.
The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.
