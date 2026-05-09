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
  - `POST /api/tripp/reply`
  - `GET /api/tripp/tasks`
  - `POST /api/tripp/tasks/:taskId/approve`
  - `POST /api/tripp/tasks/:taskId/dismiss`
- Optional backend bridge env:
  - `TRIPP_BACKEND_URL`
  - `TRIPP_BACKEND_SECRET` or `GOOSE_SERVER__SECRET_KEY`
  - `TRIPP_ENABLE_BACKEND_REPLY=true`
- Agent role/soul/operator doctrine lives under `agents/`.

Task approval is currently UI/state only. Real filesystem writes remain disabled until the supervised execution bridge is implemented.
Approving a write task prepares a patch preview; applying remains blocked until filesystem mutation is explicitly wired.
