# OAuth Provider System v0.1

This document tracks Tripp.g's managed-provider lane: browser login providers that use cached OAuth tokens instead of pasted API keys.

## Current Shape

- Provider id: `chatgpt_codex`
- UI label: `ChatGPT (Codex)`
- Auth mode: `account_linked`
- Callback listener: `http://localhost:1455/callback`
- Token cache: `~/.kimi-tripp/oauth-tokens/`
- OAuth routes:
  - `GET /api/tripp/oauth-providers`
  - `POST /api/tripp/oauth/chatgpt_codex/start`
  - `GET /api/tripp/oauth/chatgpt_codex/status`
  - `POST /api/tripp/oauth/chatgpt_codex/logout`
  - callback control is handled by a temporary local HTTP server on port `1455`

## Flow

1. The setup panel starts on ChatGPT Codex when Tripp has no default prompt/chat model.
2. `CONNECT` calls the OAuth start route.
3. The server starts a temporary local callback server on `localhost:1455`.
4. The server creates a PKCE verifier/challenge and returns an authorization URL.
5. The browser opens the provider login page.
6. The provider redirects to `http://localhost:1455/callback` with `code` and `state`.
7. The callback server validates `state`, exchanges the code for tokens, extracts account id claims when present, writes the token cache, and shuts down.
8. The setup panel can refresh status, discover the known Codex models, and save an account-linked model.

## Guardrails

- Tokens are never stored in browser storage.
- Tokens are stored outside the repo by default.
- The callback uses a random `state` value to protect against CSRF.
- PKCE is used for the code exchange.
- Logout deletes the cached token file.
- The current build verifies OAuth connection and model registration, but live Codex conversation calls remain staged behind the managed-provider adapter until the upstream endpoint contract is confirmed.

## Known Models

- `gpt-5.3-codex`
- `gpt-5.4`
- `gpt-5.4-mini`
