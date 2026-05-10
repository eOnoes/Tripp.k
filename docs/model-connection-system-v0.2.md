# Model Connection System v0.2

Status: design contract. This replaces the current clunky Connections surface as the target design. It does not enable write capability or change Tripp.g's read-only safety scope.

## Purpose

Tripp.g needs a simple model setup flow:

1. choose provider or runtime
2. enter only the needed credential or endpoint
3. get an immediate red/green health result
4. populate model choices from that provider
5. save one or more model rows under the provider group
6. assign each saved model to lanes

The page should feel like adding audio devices, not configuring a server.

## Architecture

Tripp.g should use a three-layer model system inspired by Goose:

```text
Layer 1: Declarative Provider Config
  Static provider definitions, default endpoints, known model fallbacks, and auth requirements.

Layer 2: Provider Runtime Registry
  Runtime adapter lookup by provider id and engine type.

Layer 3: Model Inventory
  Live discovered models plus saved model rows, lane assignments, test status, and metadata.
```

## Layer 1: Declarative Provider Config

Provider configs describe what the UI needs before any user credential is saved.

Shape:

```json
{
  "id": "deepseek",
  "displayName": "DeepSeek",
  "engine": "openai",
  "auth": "api_key",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "defaultBaseUrl": "https://api.deepseek.com",
  "dynamicModels": true,
  "knownModels": [
    { "id": "deepseek-v4-chat", "contextLimit": 1000000, "recommended": true },
    { "id": "deepseek-v4-flash", "contextLimit": 1000000, "recommended": false },
    { "id": "deepseek-v4-think", "contextLimit": 1000000, "recommended": false },
    { "id": "deepseek-v4-pro", "contextLimit": 1000000, "recommended": false }
  ]
}
```

Fields:

- `id`: stable provider id used by server routes and saved settings
- `displayName`: UI label
- `engine`: `openai`, `anthropic`, `ollama`, or `backend`
- `auth`: `api_key`, `none`, or `backend_managed`
- `apiKeyEnv`: optional env seed name
- `defaultBaseUrl`: endpoint default
- `dynamicModels`: whether live model discovery is attempted
- `knownModels`: fallback list when live discovery fails or is unavailable

## Built-In Provider Configs

Initial built-ins:

```text
deepseek
ollama
openai
anthropic
openrouter
custom-openai
backend-managed
```

Initial Ollama known free/cloud list:

```text
kimi-k2.6:cloud
glm-5.1:cloud
qwen3.5:cloud
nemotron-3-super:cloud
gemma4:31b-cloud
mistral-large-3:675b-cloud
qwen3-coder-next:cloud
qwen3.5:397b-cloud
```

## Layer 2: Provider Runtime Registry

The runtime registry maps provider config to concrete behavior.

Registry entry:

```yaml
providerId: ollama
engine: ollama
healthCheck: checkOllamaHealth
discoverModels: listOllamaModels
testModel: testOllamaModel
sendPrompt: callOllamaGenerate
```

Engine behavior:

- `openai`: use `/chat/completions`; use `/models` where supported
- `anthropic`: use `/messages`; model list may be known-list first
- `ollama`: use `/api/tags` for local models and known cloud fallback models
- `backend`: use Tripp backend bridge health and reply contract

The registry must return structured errors:

```yaml
status: connected | checking | auth_error | endpoint_unreachable | model_not_found | tls_error | unsupported
message: user readable message
diagnosticCode: stable_machine_code
safeDetail: redacted detail safe for UI
```

## Layer 3: Model Inventory

Inventory is the app's source of truth for usable model routing.

Provider group:

```yaml
id: provider_ollama_local
providerId: ollama
displayName: Ollama
baseUrl: http://127.0.0.1:11434
authMode: none
status: connected
lastCheckedAt: 2026-05-10T00:00:00Z
modelsDiscovered:
  source: live | fallback | mixed
  count: 8
```

Model row:

```yaml
id: model_ollama_kimi_cloud
providerGroupId: provider_ollama_local
modelId: kimi-k2.6:cloud
displayName: kimi-k2.6:cloud
status: connected
lanes:
  - default_chat
  - default_prompt_testing
  - coder_primary
  - fallback
contextLimit: null
recommended: true
lastTestedAt: 2026-05-10T00:00:00Z
```

Secrets:

- API keys live only in `.tripp-runtime/connection-secrets.json` or local env.
- The UI never echoes raw keys after entry.
- Saved provider groups expose only `hasToken` and `maskedToken`.

## UX Contract

The page has two major zones.

### Add Model

Single entry point at the top:

```text
Add model

Provider
[ Ollama                         v ]

Endpoint
[ http://127.0.0.1:11434          ]

status: green connected
8 models available

Model
[ kimi-k2.6:cloud                 v ]

Use for
[x] Chat  [x] Prompt test  [ ] Planning  [x] Coder primary  [ ] Verifier  [x] Fallback

[ Save model ]
```

Provider-specific rules:

- Ollama: show endpoint, no API key field
- DeepSeek: show API key, hide base URL unless Advanced is open
- Backend-managed: show backend URL, no provider key field
- Custom OpenAI-compatible: show API key and base URL

DeepSeek dropdown profiles:

```text
deepseek-v4-chat  -> deepseek-v4-flash with thinking disabled
deepseek-v4-flash -> deepseek-v4-flash with thinking disabled
deepseek-v4-think -> deepseek-v4-flash with thinking enabled, high effort
deepseek-v4-pro   -> deepseek-v4-pro with thinking enabled, high effort
```

Legacy aliases `deepseek-chat` and `deepseek-reasoner` remain available for compatibility, but the v4 profiles should be shown first.

As soon as the endpoint or key has enough information, run a debounced health check.

Health lights:

```text
green: connected
yellow: checking
red: auth failed
red: endpoint unreachable
red: TLS/local certificate issue
red: no models found
```

The model dropdown stays disabled until provider health is green or a known fallback list is explicitly available.

### Model Roster

The roster groups by provider group, then tiers models under it.

```text
Model roster

Ollama
http://127.0.0.1:11434
green connected - 8 models available

  kimi-k2.6:cloud
  Chat - Prompt test - Coder primary - Fallback
  [Test] [Edit lanes] [Remove]

  nemotron-3-super:cloud
  Coder secondary - Verifier
  [Test] [Edit lanes] [Remove]

DeepSeek
API key connected
green connected - 2 models available

  deepseek-v4-flash
  Prompt test - Planning - Synthesis - Fallback
  [Test] [Edit lanes] [Remove]
```

Save behavior:

- Saving a model adds a model row under the existing provider group.
- The Add Model form resets to allow adding another model immediately.
- If the same provider/endpoint remains selected, keep the green light and model inventory warm.

Remove behavior:

- Removing a model row asks for confirmation.
- If a lane used that model, the lane is cleared or the user is prompted to choose a replacement.
- Removing the final model under a provider group can offer to remove the provider group too.

Edit behavior:

- Edit lanes opens only lane assignment by default.
- Edit provider opens credential/endpoint fields separately and retests before applying.

## Server API Target

Current connection routes should be replaced with provider-group and model-inventory routes.

```text
GET  /api/tripp/model-providers
POST /api/tripp/model-providers/:providerId/health
POST /api/tripp/model-providers/:providerId/models

GET  /api/tripp/model-inventory
POST /api/tripp/model-inventory/provider-groups
PATCH /api/tripp/model-inventory/provider-groups/:groupId
DELETE /api/tripp/model-inventory/provider-groups/:groupId

POST /api/tripp/model-inventory/models
PATCH /api/tripp/model-inventory/models/:modelRowId
DELETE /api/tripp/model-inventory/models/:modelRowId
POST /api/tripp/model-inventory/models/:modelRowId/test
```

Compatibility phase:

- Keep old `/api/tripp/connections` read-compatible until the UI no longer uses it.
- Map old connection records into provider groups and model rows during migration.

## Runtime Stores

New files under `.tripp-runtime/`:

```text
model-provider-groups.json
model-inventory.json
model-secrets.json
model-discovery-cache.json
```

Discovery cache:

- cache live model lists for 24 hours
- allow manual refresh
- keep fallback known models if live discovery fails

## Error Handling

Do not collapse all failures into `endpoint_unreachable`.

Required UI-visible categories:

- `connected`: provider answered
- `auth_error`: key rejected or missing
- `endpoint_unreachable`: host unavailable
- `tls_error`: local Node/certificate trust problem
- `model_not_found`: selected model is not available
- `no_models`: provider connected but no models were discovered
- `unsupported`: selected provider mode is not supported

The UI should show plain fixes:

- auth error: "Check the API key."
- endpoint: "Check URL and whether the runtime is running."
- TLS: "Node cannot verify this provider certificate on this machine. Use local certificate setup or dev-only TLS bypass."
- model missing: "Pick another model from the dropdown."

## Safety Contract

This system configures model access only.

It must not:

- enable writes
- approve tasks
- bypass Warden
- modify source files
- expose raw API keys
- imply ChatGPT subscription reuse
- treat connection success as execution permission

All existing read-only and Warden constraints remain unchanged.

## Build Order

1. Add provider config objects and registry functions.
2. Add health/discovery/test API routes with structured errors.
3. Add model inventory store and migration from old connection records.
4. Rebuild Connections UI as Add Model plus grouped Model Roster.
5. Add live debounced health checks.
6. Add model dropdown discovery with fallback known lists.
7. Add lane assignment per model row.
8. Keep verifier coverage for DeepSeek, Ollama, local TLS error classification, roster grouping, removal, and lane migration.
