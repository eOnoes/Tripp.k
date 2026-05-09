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
- Agent role/soul/operator doctrine lives under `agents/`.
