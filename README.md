# Tripp.k

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

The verifier uses an isolated temporary runtime directory so test tasks and sessions do not appear in the local app.

Reset local Connections first boot:

```powershell
node .\scripts\reset-first-boot.mjs
```

The reset is local/dev only. It clears Tripp-local saved model/provider connections, connection secrets, default prompt-testing selection, and first-boot browser suppression keys. It writes `.tripp-runtime/first-boot-reset.json` so the frontend can invalidate relevant `localStorage`/`sessionStorage` keys on the next load. A server restart is not required for the script path, but reload or reopen the app afterward. Expected result: the Connections first-boot setup state appears again, and prompt testing remains unavailable until a connection is configured.

Connections support four modeled modes: API-key provider access, local runtime access, backend-managed provider access, and account-linked provider access. API-key, local runtime, and backend-managed modes are operational for prompt testing and read-only planning. Backend-managed mode routes through the trusted local/server-side Tripp backend and does not require a provider key in the browser. Account-linked mode now has a Goose-style OAuth shell for managed providers such as ChatGPT Codex: browser login starts through Tripp, a temporary `localhost:1455/callback` server catches the provider redirect, tokens cache under `~/.kimi-tripp/oauth-tokens/`, and saved models use `account_linked` provider records. Live Codex conversation calls remain behind the managed-provider adapter until the upstream endpoint contract is confirmed.

The current Connections UI follows the provider-group and model-inventory design in `docs/model-connection-system-v0.2.md`. The OAuth managed-provider lane is documented in `docs/oauth-provider-system-v0.1.md`.

## Chat, Auto, And Lane Routing

CHAT changes conversational routing. It can use the selected prompt lane and configured connection to produce conversational or prompt-testing output with lane, connection, provider, and model metadata.

AUTO changes whether supervised task routing can occur. It can create task cards, route through Supervisor/agent ownership, attach Warden/permission decisions, and run allowed read-only adapter paths.

Neither CHAT nor AUTO changes Tripp's read-only product scope, Warden authority, blocked-state rules, evidence provenance rules, Cyst audit-only role, TASKS interpretation role, Current Understanding synthesis role, Read-Only Gate semantics, live-write availability, approval/apply runtime behavior, edit/build readiness, or broad Goose parity boundaries.

Prompt lane selection is explicit when the app is expanded. If a selected lane has an assigned enabled connection, that connection is used. If the selected lane is unassigned, prompt testing falls back to the default prompt-testing connection and the result metadata still reports the lane used and the connection/provider/model that answered. If no usable connection exists, prompt testing fails with a bounded setup message.

Run the linked Tripp bridge verifier:

```powershell
node .\scripts\verify-linked.mjs
```

Start the app linked to the local Tripp bridge:

```powershell
.\scripts\start-linked.ps1
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
  - `GET /api/tripp/permissions`
  - `GET /api/tripp/coding-modes`
  - `GET /api/tripp/backend/status`
  - `GET /api/tripp/swarm`
  - `GET /api/tripp/workspace/tree`
  - `GET /api/tripp/workspace/file?path=...`
  - `POST /api/tripp/swarm/route`
  - `POST /api/tripp/reply`
  - `GET /api/tripp/tasks`
  - `POST /api/tripp/tasks/:taskId/approve`
  - `POST /api/tripp/tasks/:taskId/dismiss`
  - `POST /api/tripp/sessions`
  - `POST /api/tripp/sessions/:sessionId/select`
- Optional backend bridge env:
  - Copy `.env.example` to `.env.local` for manual local config. `.env.local` is ignored by Git.
  - `TRIPP_BACKEND_URL`
  - `TRIPP_BACKEND_SECRET` or `GOOSE_SERVER__SECRET_KEY`
  - `TRIPP_ENABLE_BACKEND_REPLY=true`
  - `TRIPP_BACKEND_HEALTH_PATH`, default `/health`
  - `TRIPP_RUNTIME_DIR` for overriding the local task/session store directory
  - `GOOSED_PATH` for the packaged Goose daemon path used by `tripp-bridge.mjs`
  - `GOOSE_AGENT_URL` for forwarding bridge replies to a live Goose agent endpoint
- Agent role/soul/operator doctrine lives under `agents/`.
- The machine-readable swarm manifest lives at `agents/tripp-swarm-manifest.json`.
- Runtime-contract doctrine and reports live under `docs/`.
- Tripp core and workspace schemas live in `docs/tripp-core-schema-v0.1.md` and `docs/workspace-model-v0.1.md`.

Task approval is guarded. Approving a write task prepares a patch preview; applying currently supports only the approved welcome-message patch in `tripp-terminal-data.json`.
Patch tasks now carry a scoped `patchPlan` with exact target file, expected text, and replacement text. Apply remains guarded to approved repo-local files and refuses stale previews.
Inspect tasks are read-only, auto-complete without acknowledgement, and can show excerpts for approved repo-local files such as `README.md`, `server.mjs`, `script.js`, `styles.css`, and `tripp-terminal-data.json`.
`git status` tasks are also read-only and auto-complete; mutating git actions such as commit are recorded as gated without an approval/apply click-through.
Shell tasks auto-run only a small read-only allowlist such as `node --version`, `npm --version`, and repo file listing; other shell requests are recorded as gated.
Permission decisions are exposed through `GET /api/tripp/permissions` and copied onto task cards as `permission.decision` with a short reason.
Coding behavior modes are exposed through `GET /api/tripp/coding-modes`; tasks are tagged with `codingMode` such as `tripp`, `cline`, or `augment`.
Analysis tasks are read-only, auto-complete for approved repo-local files, and show a short excerpt plus lightweight findings in the task detail.
Task and session history are persisted locally under `.tripp-runtime/`, which is ignored by Git.
The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.

## Backend Bridge Contract

When backend replies are enabled, Tripp.g expects:

- `GET /health` or the configured `TRIPP_BACKEND_HEALTH_PATH`
- `POST /sessions/:sessionId/reply`

Reply requests send `{ "message": "...", "mode": "CHAT|AUTO", "sessionId": "..." }`.
Reply responses can return a simple `message`, `content`, or `text`, or a `messages` array with `{ kind, speaker, body }` entries. Optional usage can be returned as `{ usage: { inputTokens, outputTokens } }`.
Backend `messages` with `{ kind: "tool", tool, result }` and explicit `tasks` arrays are normalized into right-panel task cards with `origin: "backend"`.
Tasks also receive a first-pass `agentId` from the local swarm router, so the UI can show which Tripp role owns the lane.
Task cards include a compact swarm trace showing Tripp intent intake, supervisor delegation, and assigned agent ownership.

## Workspace API

The workspace API is read-only in v0.1:

- `GET /api/tripp/workspace/tree`
- `GET /api/tripp/workspace/file?path=README.md`

File access is repo-local, ignores runtime/private/generated paths, caps inline file size, and marks HTML files as previewable for the future sidebar preview.

## Local Tripp Bridge

`tripp-bridge.mjs` is the local adapter shim between Tripp.g and Goose. It exposes the Tripp backend bridge contract now, reports the packaged `goosed.exe` path/version, and can forward to a live Goose agent when `GOOSE_AGENT_URL` is configured.
