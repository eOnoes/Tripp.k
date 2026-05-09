import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "127.0.0.1";

const bootstrapFile = join(root, "tripp-terminal-data.json");
const swarmManifestFile = join(root, "agents", "tripp-swarm-manifest.json");
const runtimeDir = resolve(process.env.TRIPP_RUNTIME_DIR || join(root, ".tripp-runtime"));
const taskStoreFile = join(runtimeDir, "tasks.json");
const sessionStoreFile = join(runtimeDir, "sessions.json");
const cystStoreFile = join(runtimeDir, "cyst-events.json");
const settingsStoreFile = join(runtimeDir, "settings.json");
const backendUrl = normalizeBackendUrl(process.env.TRIPP_BACKEND_URL);
const backendSecret = process.env.TRIPP_BACKEND_SECRET || process.env.GOOSE_SERVER__SECRET_KEY || "";
const backendReplyEnabled = process.env.TRIPP_ENABLE_BACKEND_REPLY === "true";
const backendHealthPath = process.env.TRIPP_BACKEND_HEALTH_PATH || "/health";
const taskQueue = loadTaskQueue();
const sessionStore = loadSessionStore();
const cystEventStore = loadCystEventStore();
const settingsStore = loadSettingsStore();

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (url.pathname.startsWith("/api/tripp/")) {
    await handleTrippApi(request, response, url);
    return;
  }

  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = resolve(root, normalize(requested));

  if (candidate !== root && !candidate.startsWith(root + sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`Tripp terminal prototype running at http://${host}:${port}/`);
});

async function handleTrippApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/tripp/bootstrap") {
    sendJson(response, readBootstrap());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/health") {
    sendJson(response, readHealth());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/permissions") {
    sendJson(response, readPermissionPolicy());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/settings") {
    sendJson(response, settingsStore);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/settings") {
    const payload = await readJson(request);
    sendJson(response, updateSettings(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/warden/precheck") {
    const payload = await readJson(request);
    const descriptor = payload?.descriptor || payload;
    const warden = wardenPrecheck(descriptor);
    if (!warden.allowed) recordWardenDenialEvent(descriptor, warden);
    sendJson(response, warden);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/task-lifecycle") {
    sendJson(response, readTaskLifecycleContract());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/executor/goose-adapter") {
    const payload = await readJson(request);
    sendJson(response, gooseAdapterCall(payload?.route || {}, payload?.descriptor || payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/cyst/events") {
    sendJson(response, { events: cystEventStore.events });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/review-changes") {
    sendJson(response, readReviewChanges());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/trials/read-only") {
    sendJson(response, runReadOnlyHarnessTrials());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/coding-modes") {
    sendJson(response, readCodingModes());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/backend/status") {
    sendJson(response, await readBackendStatus());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/munch/health") {
    sendJson(response, readMunchHealth());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/munch/retrieve") {
    const payload = await readJson(request);
    sendJson(response, createMunchRetrieval(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/munch/context-map") {
    const payload = await readJson(request);
    sendJson(response, createMunchContextMap(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/trace/map") {
    const payload = await readJson(request);
    sendJson(response, createTraceDroneMap(payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/trace/verify") {
    const payload = await readJson(request);
    sendJson(response, verifyTraceDroneMap(payload?.traceMap || payload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/prompt-block/validate") {
    const payload = await readJson(request);
    sendJson(response, validatePromptBlock(payload?.promptBlock || payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/swarm") {
    sendJson(response, readSwarmManifest());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/workspace/tree") {
    sendJson(response, readWorkspaceTree());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/workspace/file") {
    sendJson(response, readWorkspaceFile(url.searchParams.get("path") || ""));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/swarm/route") {
    const payload = await readJson(request);
    sendJson(response, { route: routePrompt(payload?.prompt || "", payload?.tool || "") });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/reply") {
    const payload = await readJson(request);
    sendJson(response, await createReply(payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/tasks") {
    sendJson(response, { tasks: taskQueue });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tripp/sessions") {
    sendJson(response, createSession());
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/tripp/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.split("/").at(-2) || "");
    const action = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    sendJson(response, updateSession(sessionId, action));
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/tripp/tasks/")) {
    const payload = await readJson(request);
    const taskId = decodeURIComponent(url.pathname.split("/").at(-2) || "");
    const action = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    sendJson(response, updateTask(taskId, action, payload));
    return;
  }

  sendJson(response, { error: "Unknown Tripp API route." }, 404);
}

function readBootstrap() {
  const bootstrap = JSON.parse(readFileSync(bootstrapFile, "utf8"));
  const sessions = ensureSessionStore(bootstrap);
  const health = readHealth();
  const swarm = readSwarmManifest();

  return {
    ...bootstrap,
    sessions,
    swarm,
    munch: readMunchHealth(),
    status: {
      ...bootstrap.status,
      contextLimit: settingsStore.compact.contextLimit,
      autoCompactAt: settingsStore.compact.autoCompactAt,
      connection: backendUrl ? "BRIDGE READY" : bootstrap.status.connection,
      model: backendUrl ? "tripp-adapter/backend" : bootstrap.status.model,
    },
    runtime: {
      mode: backendUrl ? "backend-ready" : process.env.TRIPP_RUNTIME || "mock",
      bridge: "tripp-adapter",
      backend: backendUrl,
      backendReplyEnabled,
      capabilities: health.capabilities,
    },
    tasks: taskQueue,
    settings: settingsStore,
  };
}

function readHealth() {
  return {
    ok: true,
    runtime: backendUrl ? "backend-ready" : process.env.TRIPP_RUNTIME || "mock",
    bridge: "tripp-adapter",
    backend: {
      configured: Boolean(backendUrl),
      replyEnabled: backendReplyEnabled,
      healthPath: backendHealthPath,
    },
    stores: {
      tasks: taskQueue.length,
      sessions: sessionStore.sessions.length,
      cystEvents: cystEventStore.events.length,
      agents: readSwarmManifest().agents.length,
      directory: ".tripp-runtime",
    },
    capabilities: {
      chat: "mock-reply",
      sessions: "persistent-local",
      tasks: "persistent-local",
      filesystemRead: "repo-local-readonly",
      filesystemWrite: "guarded-single-patch",
      shell: "read-only-allowlist",
      git: "status-only",
      backendReply: backendUrl && backendReplyEnabled ? "enabled" : "disabled",
      swarm: "manifest-local",
      permissions: "policy-local",
      codingModes: "policy-local",
      workspace: "repo-local-readonly",
      munch: "mock-contract",
      executorAdapter: "goose-readonly-v0.1",
    },
    contract: backendContract(),
    munch: readMunchHealth(),
  };
}

function readMunchHealth() {
  const checkedAt = new Date().toISOString();
  return {
    bridge_name: "TripCore.Munch.g",
    status: "degraded",
    mode: "passive_assist",
    evidenceAuthority: "mock",
    editAuthoritative: false,
    checked_at: checkedAt,
    backends: {
      "tripcore-jmri": {
        status: "unavailable",
        required: true,
        capabilities: ["search_code", "search_docs", "search_data", "map_context"],
        last_check: checkedAt,
        details: ["real Munch backend is not wired in this prototype"],
      },
      jcodemunch: {
        status: "unavailable",
        required: true,
        capabilities: ["search_code"],
        last_check: checkedAt,
        details: ["real Munch backend is not wired in this prototype"],
      },
      jdocmunch: {
        status: "unavailable",
        required: true,
        capabilities: ["search_docs"],
        last_check: checkedAt,
        details: ["real Munch backend is not wired in this prototype"],
      },
      jdatamunch: {
        status: "optional_missing",
        required: false,
        capabilities: ["search_data"],
        last_check: checkedAt,
        details: ["optional backend not required for baseline Tripp.g operation"],
      },
    },
    summary: [
      "Munch contract stubs are available",
      "Real retrieval backend is not connected yet",
      "Use native Tripp.g reads until TripCore.Munch.g runtime is configured",
    ],
    warnings: ["passive mock mode only", "mock evidence cannot authorize edits"],
    recommended_action: "continue_native_tripp_tools",
  };
}

function readReviewChanges() {
  const statusLines = safeGit(["status", "--short"]).trim().split(/\r?\n/).filter(Boolean);
  const numstatLines = safeGit(["diff", "--numstat"]).trim().split(/\r?\n/).filter(Boolean);
  const files = statusLines.map((line) => ({
    status: line.slice(0, 2).trim() || "changed",
    path: line.slice(3).trim(),
  }));
  const stats = numstatLines.reduce(
    (acc, line) => {
      const [added, removed] = line.split(/\s+/);
      acc.insertions += Number(added) || 0;
      acc.deletions += Number(removed) || 0;
      return acc;
    },
    { insertions: 0, deletions: 0 },
  );
  const reviewableTasks = taskQueue.filter((task) =>
    ["patch_ready", "apply_blocked", "applied", "approved"].includes(task.status),
  );

  return {
    hasChanges: files.length > 0 || reviewableTasks.length > 0,
    changedFiles: files.length,
    insertions: stats.insertions,
    deletions: stats.deletions,
    files: files.slice(0, 24),
    reviewableTasks: reviewableTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      tool: task.tool,
    })),
    source: "git-status-readonly",
    checkedAt: new Date().toISOString(),
  };
}

function safeGit(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true });
  } catch {
    return "";
  }
}

function createMunchRetrieval(payload = {}) {
  const id = payload.id || `rr_${Date.now()}`;
  const kind = normalizeMunchKind(payload.kind);
  const query = String(payload.query || "").trim();
  const paths = Array.isArray(payload.paths) ? payload.paths.map(String).slice(0, 12) : [];
  const warning = query ? "real Munch backend not connected; returning contract-shaped planning response" : "query missing";
  const mockWarning = "mock retrieval is planning-only and cannot authorize edits";

  return {
    id,
    status: query ? "warn" : "fail",
    backend: "tripp-munch-mock",
    capability: kind,
    evidenceAuthority: "mock",
    editAuthoritative: false,
    mock: true,
    mode: "passive_assist",
    summary: query
      ? [`Munch retrieval lane reserved for: ${query}`, "Supervisor should use native reads until real backend health is healthy"]
      : ["No retrieval query supplied"],
    results: paths.map((path) => ({
      path,
      symbol: null,
      section: null,
      reason: "caller supplied path scope",
      confidence: "low",
    })),
    evidence: [
      {
        type: "backend_note",
        source: "Tripp.g mock Munch adapter",
        note: "Schema-compatible stub; no TripCore.Munch backend call was made",
      },
    ],
    fallback_chain: ["tripp-munch-mock", "native-tripp-tools"],
    confidence: "low",
    warnings: [warning, mockWarning],
    next_steps: ["Wire TripCore.Munch.g runtime", "Retry retrieval with backend health confirmed"],
    meta: {
      truncated: false,
      deduped: Boolean(payload.policy?.dedupe_key),
      elapsed_ms: 0,
      evidenceAuthority: "mock",
      editAuthoritative: false,
    },
  };
}

function createMunchContextMap(payload = {}) {
  const id = payload.id || `cm_${Date.now()}`;
  const rootQuestion = String(payload.root_question || payload.query || "").trim();
  const scopePaths = Array.isArray(payload.scope_paths || payload.paths)
    ? (payload.scope_paths || payload.paths).map(String).slice(0, 12)
    : [];

  return {
    id,
    root_question: rootQuestion,
    workspace: payload.workspace || root,
    scope_paths: scopePaths,
    status: rootQuestion ? "warn" : "fail",
    backend: "tripp-munch-mock",
    evidenceAuthority: "mock",
    editAuthoritative: false,
    mock: true,
    mode: "passive_assist",
    summary: rootQuestion
      ? [`Context map requested for: ${rootQuestion}`, "Real relationship mapping awaits TripCore.Munch.g wiring"]
      : ["No root question supplied"],
    nodes: scopePaths.map((path, index) => ({
      id: `mock_node_${index + 1}`,
      type: "file",
      label: path.split(/[\\/]/).at(-1) || path,
      path,
      symbol: null,
      role: "unknown",
      confidence: "low",
    })),
    edges: [],
    evidence: [
      {
        type: "backend_note",
        source: "Tripp.g mock Munch adapter",
        note: "Schema-compatible stub; no TripCore.Munch backend call was made",
      },
    ],
    confidence: "low",
    warnings: ["passive mock mode only", "mock context map is planning-only and cannot authorize edits"],
    next_steps: ["Confirm Munch bridge health", "Run map_context through TripCore.Munch.g"],
    meta: {
      truncated: false,
      fallback_chain: ["tripp-munch-mock", "native-tripp-tools"],
      elapsed_ms: 0,
      evidenceAuthority: "mock",
      editAuthoritative: false,
    },
  };
}

function createTraceDroneMap(payload = {}) {
  const task = String(payload.task || payload.prompt || payload.query || "").trim();
  const traceId = payload.traceId || `trace_${Date.now()}`;
  const candidates = rankTraceCandidates(task);
  const owners = candidates.slice(0, Number(payload.ownerMax || 5)).map((candidate) => ({
    file: candidate.file,
    confidence: candidate.confidence,
    reason: candidate.reason,
    role: candidate.role,
    signals: candidate.signals,
  }));
  const ownerFiles = owners.map((owner) => owner.file);
  const related = uniqueStrings([
    "docs/tripcore-munch-g-integration-plan.md",
    "docs/tripp-supervisor-retrieval-playbook.md",
    "docs/agent-retrieval-responsibilities-matrix.md",
  ])
    .filter((file) => !ownerFiles.includes(file))
    .slice(0, 8);
  const tests = ["scripts/verify.mjs", "scripts/verify-linked.mjs"].filter((file) => existsSync(join(root, file)));
  const confidence = owners.length ? Math.max(...owners.map((owner) => owner.confidence)) : 0.05;
  const warnings = [
    "mock Trace.Drone map; real trace runtime is not wired yet",
    "mock trace evidence is planning-only and cannot authorize edits",
  ];
  const forbidden = ["node_modules/", ".git/", "dist/", "build/", "coverage/", "generated/", "vendor/"];

  const traceMap = {
    traceId,
    role: "Trace.Drone",
    status: "boundary_map",
    evidenceAuthority: "mock",
    editAuthoritative: false,
    mock: true,
    mode: "passive_assist",
    readOnly: true,
    executionAllowed: false,
    planningAllowed: false,
    implementationAllowed: false,
    task,
    owners,
    related,
    tests,
    chain_effects: traceChainEffects(task),
    forbidden,
    rollback_surface: {
      files: uniqueStrings([...ownerFiles, ...related.slice(0, 2)]).slice(0, 8),
      tests: tests.slice(0, 6),
      scope: owners.length > 4 ? "broad_owner_surface" : owners.length ? "bounded_owner_surface" : "unresolved",
      note: owners.length
        ? "If validation fails, roll back only files in this bounded owner surface before widening scope."
        : "Do not patch until an owner surface is identified.",
    },
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    evidence: owners.map((owner) => ({
      file: owner.file,
      signals: owner.signals,
      score: owner.confidence,
      note: owner.reason,
    })),
    warnings,
    trace: {
      traceId,
      source: "trace-drone",
      evidenceAuthority: "mock",
      editAuthoritative: false,
    },
  };
  traceMap.traceVerification = verifyTraceDroneMap(traceMap);
  return traceMap;
}

function verifyTraceDroneMap(traceMap = {}) {
  const owners = Array.isArray(traceMap.owners) ? traceMap.owners : [];
  const tests = Array.isArray(traceMap.tests) ? traceMap.tests : [];
  const warnings = Array.isArray(traceMap.warnings) ? [...traceMap.warnings] : [];
  const blocking = [];
  const confidence = Number(traceMap.confidence || 0);
  const task = String(traceMap.task || "").toLowerCase();
  const editIntent = isTraceEditIntent(task);
  const docsOnly = owners.length > 0 && owners.every((owner) => String(owner.file || "").toLowerCase().endsWith(".md"));
  const forbiddenHit = owners.some((owner) =>
    [".git/", "node_modules/", "vendor/", "dist/", "build/", "coverage/", "generated/"].some((prefix) =>
      String(owner.file || "").startsWith(prefix),
    ),
  );
  const broadSurface = owners.length > 4;

  if (!owners.length) blocking.push("no owners found");
  if (confidence < 0.45) blocking.push("confidence below trace threshold");
  if (docsOnly && editIntent) blocking.push("owners are docs-only for edit intent");
  else if (docsOnly) warnings.push("owners are docs-only; acceptable for retrieval but not edit approval");
  if (forbiddenHit) blocking.push("forbidden path in owners");
  if (broadSurface) warnings.push("owner surface is broad and should be tightened");
  if (!tests.length) warnings.push("no related tests found");

  const pass = blocking.length === 0;
  const terminalState = !owners.length
    ? "TRACE_UNRESOLVED"
    : blocking.length
      ? "TRACE_ESCALATE"
      : warnings.length
        ? "TRACE_PASS_WITH_WARNINGS"
        : "TRACE_PASS";

  return {
    pass,
    terminalState,
    tightenAllowed: broadSurface || confidence < 0.7,
    warnings,
    blocking,
    checks: {
      confidence,
      ownerCount: owners.length,
      testsPresent: tests.length > 0,
      docsOnly,
      forbiddenHit,
      broadSurface,
    },
    attempts: Number(traceMap.traceVerification?.attempts || 1),
    tightened: Boolean(traceMap.traceVerification?.tightened || false),
    previous: traceMap.traceVerification?.previous || null,
  };
}

function isTraceEditIntent(task) {
  return /\b(edit|modify|patch|write|change|fix|implement|refactor|delete|remove|create|add)\b/.test(String(task || ""));
}

function rankTraceCandidates(task) {
  const lower = String(task || "").toLowerCase();
  const candidates = [];
  const add = (file, confidence, reason, role, signals) => {
    if (existsSync(join(root, file))) candidates.push({ file, confidence, reason, role, signals });
  };

  if (lower.includes("munch") || lower.includes("health") || lower.includes("route") || lower.includes("api")) {
    add("server.mjs", 0.72, "server exposes Munch health, retrieval, context-map, and task routing routes", "controller", [
      "api-route",
      "munch",
      "health",
    ]);
    add("scripts/verify.mjs", 0.58, "verifier asserts Munch route and routing behavior", "supporting", [
      "verification",
      "munch",
    ]);
  }

  if (lower.includes("ui") || lower.includes("workspace") || lower.includes("task")) {
    add("script.js", 0.66, "browser state renders task, workspace, routing, retrieval, and evidence gate details", "controller", [
      "ui-render",
      "task-card",
    ]);
    add("styles.css", 0.52, "styles define task, retrieval, and evidence gate presentation", "supporting", [
      "ui-style",
      "evidence",
    ]);
  }

  if (lower.includes("doc") || lower.includes("doctrine") || lower.includes("playbook")) {
    add("docs/tripp-supervisor-retrieval-playbook.md", 0.62, "playbook defines supervisor retrieval doctrine", "source_of_truth", [
      "doctrine",
      "supervisor",
    ]);
  }

  if (!candidates.length) {
    add("server.mjs", 0.42, "fallback owner candidate from adapter API surface", "unknown", ["fallback"]);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function traceChainEffects(task) {
  const lower = String(task || "").toLowerCase();
  const effects = ["supervisor routing state", "task evidence gate"];
  if (lower.includes("workspace") || lower.includes("ui")) effects.push("workspace projection");
  if (lower.includes("munch") || lower.includes("retrieval")) effects.push("retrieval lane contract");
  if (lower.includes("runtime") || lower.includes("goosed")) effects.push("runtime contract evidence");
  return effects;
}

function confidenceLabel(value) {
  if (value >= 0.82) return "strong";
  if (value >= 0.55) return "medium";
  if (value > 0) return "weak";
  return "none";
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeMunchKind(kind) {
  const value = String(kind || "code_search");
  return ["code_search", "doc_search", "data_search", "context_map", "compress_result"].includes(value)
    ? value
    : "code_search";
}

function readPermissionPolicy() {
  return {
    version: "0.3.0",
    circuitBreaker: false,
    defaultDecision: "gated",
    requiredDescriptorFields: ["id", "type", "intent", "target", "constraints", "budget", "allowedTools", "trace"],
    blockedDescriptorTypes: ["prompt_block"],
    allowedDescriptorTypes: ["task_descriptor"],
    approvedTraceSources: ["gateway", "harness", "supervisor"],
    allowedTargets: ["model", "tool", "data"],
    blockedTools: ["Developer.edit", "Developer.write", "delegate", "Apps.createApp", "git_commit"],
    blockedResponseFlags: ["policyViolation", "unsafeToolCall", "sandboxEscape"],
    blockedIntents: ["unscoped_write", "credential_access", "destructive_shell", "silent_workspace_mutation"],
    forbiddenPaths: ["node_modules/", ".git/", "dist/", "build/", "coverage/", "generated/", "vendor/"],
    freshnessMs: 5 * 60 * 1000,
    harnessModeChangeRequiresConfirmation: true,
    modeTransitionPolicy: {
      CHAT: {
        allowed: ["AUTO"],
        requiresConfirmation: false,
        allowedTargets: ["conversation", "prompt_block"],
      },
      AUTO: {
        allowed: ["CHAT"],
        requiresConfirmation: true,
        allowedTargets: ["review", "retrieval", "guarded_task"],
      },
      AUDIT: {
        allowed: ["CHAT", "AUTO"],
        requiresConfirmation: false,
        allowedTargets: ["review"],
      },
      BUILD: {
        allowed: ["AUDIT"],
        requiresConfirmation: true,
        allowedTargets: ["executor"],
      },
    },
    lanes: {
      filesystem_read: {
        decision: "allow",
        scope: "repo-local approved file list",
      },
      filesystem_write: {
        decision: "gated",
        scope: "patch preview first, guarded apply only",
      },
      shell_execute: {
        decision: "allowlist",
        scope: "read-only commands only",
        allowed: ["node --version", "npm --version", "git ls-files"],
      },
      git_status: {
        decision: "allow",
        scope: "read-only status snapshot",
      },
      git_commit: {
        decision: "blocked",
        scope: "mutating git actions require a future command bridge",
      },
      backend: {
        decision: "allow",
        scope: "configured backend reply contract",
      },
    },
  };
}

function readTaskLifecycleContract() {
  return {
    version: "0.1.0",
    states: ["proposed", "routed", "evidence_ready", "gated", "approved", "running", "completed", "failed", "dismissed"],
    terminal: ["completed", "failed", "dismissed"],
    transitions: {
      proposed: ["routed", "dismissed"],
      routed: ["evidence_ready", "gated", "completed", "dismissed"],
      evidence_ready: ["gated", "approved", "dismissed"],
      gated: ["approved", "dismissed"],
      approved: ["running", "completed", "failed", "dismissed"],
      running: ["completed", "failed"],
      completed: [],
      failed: [],
      dismissed: [],
    },
    rollbackRequiredFrom: ["approved", "running", "completed", "failed"],
    auditFields: ["taskId", "descriptorStatus", "state", "previousState", "actor", "reason", "timestamp", "rollback"],
  };
}

function runReadOnlyHarnessTrials() {
  const startedAt = new Date().toISOString();
  const trials = [
    runWardenPromptBlockTrial(),
    runAdapterReadTrial("trial-readme-read", "Developer.read", { tool: "read", path: "README.md" }),
    runAdapterReadTrial("trial-safe-shell", "Developer.shell", { tool: "shell", command: "node --version" }),
    runAdapterReadTrial("trial-blocked-shell", "Developer.shell", { tool: "shell", command: "git push origin main" }),
    runMunchRetrievalTrial(),
  ];
  const passed = trials.every((trial) => trial.pass);
  const task = createTrialTask(trials, passed, startedAt);
  const result = {
    id: `trial-run-${Date.now()}`,
    status: passed ? "pass" : "fail",
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: passed
      ? "Read-only harness trials passed. Warden, Router, Adapter, Cyst, and UI task projection are wired for trial mode."
      : "Read-only harness trials found a blocking issue.",
    trials,
    task,
  };
  recordTrialRunEvent(result);
  taskQueue.unshift(task);
  saveTaskQueue();
  return result;
}

function runWardenPromptBlockTrial() {
  const descriptor = {
    id: "trial-prompt-block-deny",
    type: "prompt_block",
    intent: "handoff",
    target: "tool",
    constraints: [],
    budget: { maxTokens: 500 },
    allowedTools: [],
    trace: { traceId: "trial-prompt-block-deny", source: "supervisor", ownerId: "tripp.supervisor" },
    body: "---pb:v1---\nGoose.Prompt",
    pinnedWorkspaceRoot: root,
    contextSnapshotId: "trial-context",
  };
  const warden = wardenPrecheck(descriptor);
  if (!warden.allowed) recordWardenDenialEvent(descriptor, warden);
  return {
    id: "trial-prompt-block-deny",
    title: "Prompt block denied before execution",
    pass: warden.decision === "deny" && warden.terminalState === "DENIED_BEFORE_MUNCH",
    expected: "WARDEN_DENIED and no adapter invocation",
    wardenState: warden.terminalState,
    route: null,
    adapterStatus: "not_invoked",
    cystEvent: null,
    uiProjection: "TASKS card shows denied prompt-block leakage as non-executable context.",
    evidence: warden.denialReasons,
  };
}

function runAdapterReadTrial(id, tool, args) {
  const descriptor = createTrialDescriptor(id, tool, args);
  const warden = wardenPrecheck(descriptor);
  const route = { id: `route-${id}`, destination: "goose.adapter", tool };
  descriptor.trace.wardenDecision = warden.terminalState;
  const adapter = warden.allowed ? gooseAdapterCall(route, descriptor) : null;
  const expectBlocked = id.includes("blocked");
  const pass =
    warden.terminalState === "WARDEN_PASS" &&
    adapter?.invoked === !expectBlocked &&
    (expectBlocked ? adapter?.status === "blocked" : adapter?.status === "ok") &&
    Boolean(adapter?.cystEvent?.eventType);
  return {
    id,
    title: expectBlocked ? "Destructive shell blocked by adapter" : `${tool} read-only adapter call`,
    pass,
    expected: expectBlocked ? "WARDEN_PASS then adapter block without invocation" : "WARDEN_PASS then adapter ok with Cyst event",
    wardenState: warden.terminalState,
    route: route.destination,
    adapterStatus: adapter?.status || "not_invoked",
    adapterInvoked: adapter?.invoked || false,
    cystEvent: adapter?.cystEvent?.cysToken || adapter?.trace?.cysToken || null,
    uiProjection: "TASKS card can show adapter status, route, tool, and Cyst token.",
    evidence: adapter?.error?.code ? [adapter.error.code] : [adapter?.result?.shaped?.summary].filter(Boolean),
  };
}

function runMunchRetrievalTrial() {
  const route = routePrompt("where is Warden policy documented", "");
  const retrieval = createMunchRetrieval({
    id: "trial-munch-retrieval",
    kind: "doc_search",
    workspace: root,
    paths: ["contracts/policies/warden-policy-v0.3.md"],
    query: "where is Warden policy documented",
    intent: { task_type: "doc", reason: "read-only retrieval trial" },
    policy: { retrieval_mode: "retrieval_first", max_results: 4, include_evidence: true },
  });
  const pass = route.agentId === "tripp.supervisor" && retrieval.status === "warn" && retrieval.results?.length > 0;
  recordRetrievalEvent("trial-munch-retrieval", "trial-munch-retrieval", retrieval);
  return {
    id: "trial-munch-retrieval",
    title: "Munch mock retrieval lane resolves without adapter invocation",
    pass,
    expected: "Router selects retrieval support and Munch mock returns evidence",
    wardenState: "not_required_retrieval_only",
    route: "munch.mock",
    adapterStatus: "not_invoked",
    adapterInvoked: false,
    cystEvent: null,
    uiProjection: "Workspace can show backend, fallback chain, confidence, warnings, and narrowed files.",
    evidence: [retrieval.backend, retrieval.confidence, ...(retrieval.warnings || [])],
  };
}

function createTrialDescriptor(id, targetTool, args) {
  return {
    id,
    type: "task_descriptor",
    intent: "inspect",
    target: "tool",
    targetTool,
    workspaceRoot: root,
    constraints: { allowedPaths: ["README.md", "server.mjs", "scripts"] },
    budget: { maxTokens: 500 },
    allowedTools: ["Developer.read", "Developer.tree", "Developer.shell"],
    trace: {
      traceId: id,
      source: "supervisor",
      ownerId: "tripp.supervisor",
      munch: { decision: "allow", budgetDecision: "allow" },
    },
    args,
  };
}

function createTrialTask(trials, passed, startedAt) {
  const task = {
    id: `task-trials-${Date.now()}`,
    title: "Read-only harness trials",
    prompt: "Run read-only harness trial plan v0.1",
    kind: "trial",
    tool: "harness_trial",
    target: null,
    sessionId: null,
    status: passed ? "completed" : "failed",
    agentId: "tripp.inspector",
    result: passed ? "All read-only harness trials passed." : "One or more read-only harness trials failed.",
    trials,
    permission: permissionDecision("harness_trial", "allow", "read-only trial runner; no mutation tools enabled"),
    lifecycle: createTaskLifecycle("proposed", "tripp.supervisor", "read-only trial task created", null),
    createdAt: startedAt,
  };
  task.lifecycle.events[0].taskId = task.id;
  recordLifecycleEvent(task, task.lifecycle.events[0]);
  advanceTaskLifecycle(task, "routed", "tripp.supervisor", "trial routed to read-only harness lane");
  advanceTaskLifecycle(task, passed ? "completed" : "failed", "tripp.inspector", passed ? "trial evidence passed" : "trial evidence failed");
  return task;
}

function gooseAdapterCall(route = {}, descriptor = {}) {
  const started = Date.now();
  const tool = normalizeGooseTool(descriptor.args?.tool || route.tool || descriptor.targetTool || descriptor.tool || "");
  const traceId = descriptor.trace?.traceId || `adapter_${Date.now()}`;
  const redaction = redactAdapterArgs(descriptor.args || {});
  const cystBase = {
    eventType: "adapter_invocation",
    adapter: "goose.adapter",
    descriptorId: descriptor.id || null,
    traceId,
    ownerId: descriptor.trace?.ownerId || descriptor.trace?.owner || null,
    wardenDecision: descriptor.trace?.wardenDecision || null,
    munchDecision: descriptor.trace?.munch || null,
    routeId: route.id || null,
    tool,
    argsRedacted: redaction.value,
    errorCode: null,
    redactionCount: redaction.log.length,
    elapsedMs: null,
    timestamp: new Date().toISOString(),
    sandboxCheck: false,
  };

  const gate = validateGooseAdapterGates(route, descriptor, tool);
  if (gate) {
    return createAdapterResult({
      status: gate.status,
      tool,
      invoked: false,
      error: gate.error,
      traceId,
      argsRedacted: redaction.value,
      redactionLog: redaction.log,
      cystEvent: { ...cystBase, resultStatus: gate.status, errorCode: gate.error.code, elapsedMs: Date.now() - started },
      elapsedMs: Date.now() - started,
    });
  }

  const sandbox = validateAdapterSandbox(descriptor.args || {}, descriptor.constraints || {});
  if (!sandbox.ok) {
    return createAdapterResult({
      status: "blocked",
      tool,
      invoked: false,
      error: createAdapterError(sandbox.code, sandbox.message, descriptor),
      traceId,
      argsRedacted: redaction.value,
      redactionLog: redaction.log,
      cystEvent: { ...cystBase, resultStatus: "blocked", errorCode: sandbox.code, elapsedMs: Date.now() - started },
      elapsedMs: Date.now() - started,
    });
  }

  const shellCheck = tool === "Developer.shell" ? parseReadonlyShell(descriptor.args?.command || "") : { ok: true };
  if (!shellCheck.ok) {
    return createAdapterResult({
      status: "blocked",
      tool,
      invoked: false,
      error: createAdapterError(shellCheck.code, shellCheck.message, descriptor),
      traceId,
      argsRedacted: redaction.value,
      redactionLog: redaction.log,
      cystEvent: { ...cystBase, resultStatus: "blocked", errorCode: shellCheck.code, elapsedMs: Date.now() - started, sandboxCheck: true },
      elapsedMs: Date.now() - started,
    });
  }
  if (shellCheck.path) {
    const shellPathSandbox = validateAdapterSandbox({ path: shellCheck.path }, descriptor.constraints || {});
    if (!shellPathSandbox.ok) {
      return createAdapterResult({
        status: "blocked",
        tool,
        invoked: false,
        error: createAdapterError(shellPathSandbox.code, shellPathSandbox.message, descriptor),
        traceId,
        argsRedacted: redaction.value,
        redactionLog: redaction.log,
        cystEvent: {
          ...cystBase,
          resultStatus: "blocked",
          errorCode: shellPathSandbox.code,
          elapsedMs: Date.now() - started,
          sandboxCheck: false,
        },
        elapsedMs: Date.now() - started,
      });
    }
  }

  try {
    const shaped = invokeReadonlyGooseTool(tool, descriptor.args || {});
    const elapsedMs = Date.now() - started;
    return createAdapterResult({
      status: "ok",
      tool,
      invoked: true,
      result: { raw: shaped.raw, shaped: shaped.result },
      error: null,
      traceId,
      argsRedacted: redaction.value,
      redactionLog: redaction.log,
      cystEvent: { ...cystBase, resultStatus: "ok", elapsedMs, sandboxCheck: true },
      elapsedMs,
    });
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const adapterError = shapeAdapterException(error, descriptor);
    return createAdapterResult({
      status: "error",
      tool,
      invoked: true,
      error: adapterError,
      traceId,
      argsRedacted: redaction.value,
      redactionLog: redaction.log,
      cystEvent: { ...cystBase, resultStatus: "error", errorCode: adapterError.code, elapsedMs, sandboxCheck: true },
      elapsedMs,
    });
  }
}

function validateGooseAdapterGates(route, descriptor, tool) {
  if (!descriptor.trace?.wardenDecision) {
    return { status: "denied", error: createAdapterError("WARDEN_MISSING", "Warden decision is missing.", descriptor) };
  }
  if (descriptor.trace.wardenDecision !== "WARDEN_PASS") {
    return { status: "denied", error: createAdapterError("WARDEN_DENIED", "Warden did not pass this descriptor.", descriptor) };
  }
  if (!descriptor.trace?.munch) {
    return { status: "denied", error: createAdapterError("MUNCH_MISSING", "Munch budget/context decision is missing.", descriptor) };
  }
  if (descriptor.trace.munch.decision === "deny" || descriptor.trace.munch.budgetDecision === "denied") {
    return { status: "denied", error: createAdapterError("MUNCH_BUDGET_DENIED", "Munch denied the budget/context request.", descriptor) };
  }
  if (!route?.id || !route?.destination) {
    return { status: "denied", error: createAdapterError("ROUTER_MISSING", "Router route is missing.", descriptor) };
  }
  if (route.destination !== "goose.adapter") {
    return { status: "blocked", error: createAdapterError("ROUTE_DESTINATION_MISMATCH", "Route destination is not goose.adapter.", descriptor) };
  }
  const blocked = blockedGooseTool(tool);
  if (blocked) {
    return { status: "blocked", error: createAdapterError(blocked.code, blocked.message, descriptor) };
  }
  if (!["Developer.tree", "Developer.read", "Developer.shell"].includes(tool)) {
    return { status: "blocked", error: createAdapterError("GOOSE_TOOL_UNAVAILABLE", "Requested tool is not available in this runtime.", descriptor) };
  }
  return null;
}

function normalizeGooseTool(tool) {
  const value = String(tool || "").trim();
  const aliases = {
    tree: "Developer.tree",
    filesystem_list: "Developer.tree",
    read: "Developer.read",
    filesystem_read: "Developer.read",
    shell: "Developer.shell",
    shell_execute: "Developer.shell",
  };
  return aliases[value] || value;
}

function blockedGooseTool(tool) {
  const blocked = {
    "Developer.edit": ["GOOSE_EDIT_BLOCKED", "Developer.edit is blocked in read-only adapter v0.1."],
    "Developer.write": ["GOOSE_WRITE_BLOCKED", "Developer.write is blocked in read-only adapter v0.1."],
    "Summon.delegate": ["GOOSE_DELEGATE_BLOCKED", "Delegation is blocked in the Goose adapter."],
    "Apps.createApp": ["GOOSE_APP_CREATE_BLOCKED", "App creation is blocked in the Goose adapter."],
    "Apps.iterateApp": ["GOOSE_APP_ITERATE_BLOCKED", "App mutation is blocked in the Goose adapter."],
    "Apps.deleteApp": ["GOOSE_APP_DELETE_BLOCKED", "App deletion is blocked in the Goose adapter."],
    "Extensionmanager.manageExtensions": ["EXTENSION_MANAGE_BLOCKED", "Extension management is blocked in the Goose adapter."],
    git_commit: ["GIT_WRITE_BLOCKED", "Git write operations are blocked in the Goose adapter."],
  };
  if (!blocked[tool]) return null;
  return { code: blocked[tool][0], message: blocked[tool][1] };
}

function validateAdapterSandbox(args, constraints) {
  const pathValue = args.path || args.file || "";
  if (!pathValue) return { ok: true };
  const resolved = resolveWorkspacePath(pathValue);
  if (!resolved.ok) return { ok: false, code: "PATH_SANDBOX_ESCAPE", message: resolved.error };

  const allowedPaths = Array.isArray(constraints.allowedPaths) ? constraints.allowedPaths : [];
  if (allowedPaths.length && !allowedPaths.some((prefix) => pathMatchesAllowedPrefix(resolved.relative, prefix))) {
    return { ok: false, code: "PATH_SANDBOX_ESCAPE", message: "Requested path is outside descriptor.allowedPaths." };
  }

  return { ok: true, relative: resolved.relative, absolute: resolved.absolute };
}

function validateReadonlyShell(command) {
  const parsed = parseReadonlyShell(command);
  return parsed.ok ? null : { code: parsed.code, message: parsed.message };
}

function parseReadonlyShell(command) {
  const value = String(command || "").trim();
  const lower = value.toLowerCase();
  if (!value) return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "Shell command is missing." };
  if (/[|<>;&`]/.test(value) || value.includes("$(")) {
    return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "Command chaining, pipes, redirects, and substitutions are blocked." };
  }
  const deniedTokens = [" del ", " rmdir", " rd ", " format", "mkfs", "git commit", "git push", "git merge", "git rebase", "npm install", "pip install", "set-executionpolicy", "invoke-expression", "curl ", "wget ", " rm ", " mv ", " cp "];
  if (deniedTokens.some((token) => ` ${lower} `.includes(token))) {
    return { ok: false, code: lower.includes("git ") ? "GIT_WRITE_BLOCKED" : "SHELL_COMMAND_BLOCKED", message: "Shell command is outside the read-only allowlist." };
  }
  if (["node --version", "npm --version", "git status"].includes(lower)) return { ok: true, action: lower };
  if (lower === "dir" || lower.startsWith("dir ")) {
    return { ok: true, action: "dir", path: value.slice(3).trim() || "" };
  }
  if (lower.startsWith("type ")) {
    const pathValue = unquoteShellArg(value.slice(5).trim());
    if (!pathValue) return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "type requires a repo-local file path." };
    return { ok: true, action: "type", path: pathValue };
  }
  if (lower.startsWith("cd ")) {
    const pathValue = unquoteShellArg(value.replace(/^cd\s+\/d\s+/i, "").replace(/^cd\s+/i, "").trim());
    if (!pathValue) return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "cd requires a repo-local path." };
    return { ok: true, action: "cd", path: pathValue };
  }
  if (lower.startsWith("echo ")) return { ok: true, action: "echo", literal: value.slice(5) };
  if (lower.startsWith("findstr ")) {
    const match = value.match(/^findstr\s+\/n\s+"\."\s+"([^"]+)"$/i);
    if (!match) return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "findstr is limited to: findstr /n \".\" \"path\"." };
    return { ok: true, action: "findstr", path: match[1] };
  }
  return { ok: false, code: "SHELL_COMMAND_BLOCKED", message: "Shell command is not on the read-only allowlist." };
}

function unquoteShellArg(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

function invokeReadonlyGooseTool(tool, args) {
  if (tool === "Developer.tree") return invokeTreeTool(args);
  if (tool === "Developer.read") return invokeReadTool(args);
  if (tool === "Developer.shell") return invokeShellTool(args);
  throw Object.assign(new Error("Requested tool is not available in this runtime."), { code: "GOOSE_TOOL_UNAVAILABLE" });
}

function invokeTreeTool(args) {
  const target = validateAdapterSandbox(args, {});
  if (!target.ok) throw Object.assign(new Error(target.message), { code: target.code });
  const absolute = target.absolute || root;
  const entries = statSync(absolute).isDirectory() ? listWorkspaceChildren(absolute, target.relative || "", 0) : [];
  const paths = flattenWorkspaceTree(entries).slice(0, 120);
  return {
    raw: { paths },
    result: {
      type: "tree",
      summary: `Directory tree with ${paths.length} visible entries.`,
      lines: paths.length,
      paths,
      content: null,
      stdout: null,
      stderr: null,
      exitCode: null,
    },
  };
}

function invokeReadTool(args) {
  const file = readWorkspaceFile(args.path || args.file || "");
  if (file.error) throw Object.assign(new Error(file.error), { code: "PATH_NOT_FOUND" });
  const content = truncateAdapterText(file.content || "");
  return {
    raw: { path: file.path, size: file.size },
    result: {
      type: "file_content",
      summary: `Read ${file.path} (${file.size} bytes).`,
      lines: String(file.content || "").split(/\r?\n/).length,
      paths: [file.path],
      content: content.text,
      stdout: null,
      stderr: null,
      exitCode: null,
      meta: { truncated: content.truncated },
    },
  };
}

function invokeShellTool(args) {
  const command = String(args.command || "").trim();
  const parsed = parseReadonlyShell(command);
  if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: parsed.code });
  if (parsed.action === "dir") {
    const tree = invokeTreeTool({ path: parsed.path || "" });
    return {
      raw: { command },
      result: { ...tree.result, type: "shell_output", stdout: tree.result.paths.join("\n"), exitCode: 0 },
    };
  }
  if (parsed.action === "type") {
    const read = invokeReadTool({ path: parsed.path });
    return {
      raw: { command },
      result: { ...read.result, type: "shell_output", stdout: read.result.content, content: null, exitCode: 0 },
    };
  }
  if (parsed.action === "cd") {
    const target = validateAdapterSandbox({ path: parsed.path }, {});
    if (!target.ok) throw Object.assign(new Error(target.message), { code: target.code });
    const stdout = `${target.relative || "."}\n`;
    return {
      raw: { command },
      result: {
        type: "shell_output",
        summary: `Read-only shell path check completed: ${target.relative || "."}`,
        lines: 1,
        paths: [target.relative || "."],
        content: null,
        stdout,
        stderr: "",
        exitCode: 0,
      },
    };
  }
  if (parsed.action === "echo") {
    const stdout = `${parsed.literal}\n`;
    return {
      raw: { command },
      result: {
        type: "shell_output",
        summary: `Read-only shell command completed: ${command}`,
        lines: 1,
        paths: null,
        content: null,
        stdout,
        stderr: "",
        exitCode: 0,
      },
    };
  }
  if (parsed.action === "findstr") {
    const read = invokeReadTool({ path: parsed.path });
    const numbered = String(read.result.content || "")
      .split(/\r?\n/)
      .map((line, index) => `${index + 1}:${line}`)
      .join("\n");
    return {
      raw: { command },
      result: { ...read.result, type: "shell_output", stdout: numbered, content: null, exitCode: 0 },
    };
  }
  const parts = command.split(/\s+/);
  const executable = parts[0];
  const shellArgs = parts.slice(1);
  const stdout = execFileSync(executable, shellArgs, { cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true });
  const shaped = truncateAdapterText(stdout);
  return {
    raw: { command },
    result: {
      type: "shell_output",
      summary: `Read-only shell command completed: ${command}`,
      lines: stdout.split(/\r?\n/).filter(Boolean).length,
      paths: null,
      content: null,
      stdout: shaped.text,
      stderr: "",
      exitCode: 0,
      meta: { truncated: shaped.truncated },
    },
  };
}

function flattenWorkspaceTree(entries) {
  const paths = [];
  entries.forEach((entry) => {
    paths.push(entry.path);
    if (entry.children) paths.push(...flattenWorkspaceTree(entry.children));
  });
  return paths;
}

function truncateAdapterText(value) {
  const text = String(value || "");
  const max = 8192;
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n[TRUNCATED: ${text.length - max} bytes omitted]`, truncated: true };
}

function redactAdapterArgs(value, path = []) {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => redactAdapterArgs(item, [...path, String(index)]));
    return {
      value: items.map((item) => item.value),
      log: items.flatMap((item) => item.log),
    };
  }
  if (value && typeof value === "object") {
    const output = {};
    const log = [];
    Object.entries(value).forEach(([key, child]) => {
      const redacted = redactAdapterArgs(child, [...path, key]);
      output[key] = shouldRedactKey(key) ? "[REDACTED]" : redactPathValue(key, redacted.value, log, [...path, key]);
      if (shouldRedactKey(key)) log.push([...path, key].join("."));
      log.push(...redacted.log);
    });
    return { value: output, log };
  }
  if (typeof value === "string") {
    let text = value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [BEARER_REDACTED]");
    const log = text !== value ? [[...path].join(".") || "value"] : [];
    return { value: text, log };
  }
  return { value, log: [] };
}

function shouldRedactKey(key) {
  return /apiKey|token|secret|password|credential/i.test(key);
}

function redactPathValue(key, value, log, path) {
  if (typeof value !== "string" || !/path|cwd|workspace/i.test(key)) return value;
  if (/^[a-zA-Z]:\\Users\\/.test(value) || value.startsWith("~")) {
    log.push(path.join("."));
    return "[HOME_DIR]";
  }
  if (isAbsoluteWindowsPath(value) && !resolve(value).startsWith(root)) {
    log.push(path.join("."));
    return "[OUTSIDE_WORKSPACE]";
  }
  return value;
}

function createAdapterResult({ status, tool, invoked, result = null, error = null, traceId, argsRedacted, redactionLog, cystEvent, elapsedMs }) {
  const lifecycle = lifecycleForAdapterStatus(status, invoked);
  const persistedCystEvent = {
    ...cystEvent,
    lifecycleState: cystEvent.lifecycleState || lifecycle.state,
    previousLifecycleState: cystEvent.previousLifecycleState || lifecycle.previous,
    cysToken: createCystToken(cystEvent),
  };
  recordCystEvent(persistedCystEvent);
  return {
    status,
    tool,
    invoked,
    result,
    error,
    trace: {
      traceId,
      adapter: "goose.adapter",
      tool,
      argsRedacted,
      resultStatus: status,
      elapsedMs,
      timestamp: persistedCystEvent.timestamp,
      cysToken: persistedCystEvent.cysToken,
    },
    redactionLog,
    cystEvent: persistedCystEvent,
  };
}

function lifecycleForAdapterStatus(status, invoked) {
  if (status === "ok") return { state: "executed", previous: "routed" };
  if (status === "blocked") return { state: invoked ? "failed" : "blocked_before_execution", previous: "routed" };
  if (status === "denied") return { state: "denied_before_execution", previous: "routed" };
  if (status === "timeout" || status === "error") return { state: "failed", previous: invoked ? "running" : "routed" };
  return { state: "routed", previous: "proposed" };
}

function createAdapterError(code, message, descriptor) {
  return {
    code,
    message,
    wardenDecision: descriptor.trace?.wardenDecision || null,
    munchDecision: descriptor.trace?.munch?.decision || descriptor.trace?.munch?.budgetDecision || null,
    retryable: code === "ADAPTER_TIMEOUT",
    retryAfterMs: code === "ADAPTER_TIMEOUT" ? 1000 : null,
  };
}

function shapeAdapterException(error, descriptor) {
  const code = error?.code === "ENOENT" ? "GOOSE_TOOL_UNAVAILABLE" : error?.code || "ADAPTER_INTERNAL_ERROR";
  const known = ["GOOSE_TOOL_UNAVAILABLE", "PATH_NOT_FOUND", "PATH_ACCESS_DENIED", "ADAPTER_TIMEOUT"];
  return createAdapterError(known.includes(code) ? code : "ADAPTER_INTERNAL_ERROR", known.includes(code) ? error.message : "Adapter encountered an unexpected condition.", descriptor);
}

function wardenPrecheck(descriptor = {}) {
  const policy = readPermissionPolicy();
  const type = String(descriptor.type || "");
  const tool = String(descriptor.tool || descriptor.targetTool || "");
  const intent = String(descriptor.intent || "");
  const target = String(descriptor.target || "");
  const missing = policy.requiredDescriptorFields.filter((field) => isMissingDescriptorField(descriptor, field));
  const denials = [];
  const warnings = [];

  if (policy.circuitBreaker) addDenial(denials, "WARDEN_CIRCUIT_BREAKER_OPEN", "Warden circuit breaker is open; all execution descriptors denied.");

  if (!type) addDenial(denials, "DESCRIPTOR_TYPE_MISSING", "Descriptor type missing.");
  else if (policy.blockedDescriptorTypes.includes(type)) addDenial(denials, "DESCRIPTOR_TYPE_BLOCKED", `Descriptor type blocked: ${type}.`);
  else if (!policy.allowedDescriptorTypes.includes(type)) addDenial(denials, "DESCRIPTOR_TYPE_NOT_ALLOWED", `Descriptor type not allowed: ${type}.`);

  if (!descriptor.id || typeof descriptor.id !== "string") addDenial(denials, "DESCRIPTOR_ID_MISSING", "Descriptor id missing or not a string.");
  if (missing.length) addDenial(denials, "REQUIRED_FIELDS_MISSING", `Missing required fields: ${missing.join(", ")}.`);
  validateTraceIdentity(descriptor.trace, policy, denials);
  validateBudget(descriptor.budget, denials);

  if (intent && policy.blockedIntents.includes(intent)) addDenial(denials, "INTENT_BLOCKED", `Intent blocked: ${intent}.`);
  if (target && !policy.allowedTargets.includes(target)) addDenial(denials, "TARGET_NOT_ALLOWED", `Target not allowed: ${target}.`);
  if (tool && policy.blockedTools.includes(tool)) addDenial(denials, "TOOL_BLOCKED", `Tool blocked: ${tool}.`);
  if (target === "tool" && tool && Array.isArray(descriptor.allowedTools) && !descriptor.allowedTools.includes(tool)) {
    addDenial(denials, "TOOL_NOT_IN_ALLOWED_TOOLS", `Tool ${tool} is not listed in allowedTools.`);
  }
  if (target === "model" && !descriptor.modelRoute && !descriptor.modelProfile) {
    addDenial(denials, "MODEL_ROUTE_MISSING", "Model target requires modelRoute or modelProfile.");
  }
  const blockedFlags = (descriptor.responseFlags || []).filter((flag) => policy.blockedResponseFlags.includes(flag));
  if (blockedFlags.length) addDenial(denials, "BLOCKED_RESPONSE_FLAG", `Blocked response flags present: ${blockedFlags.join(", ")}.`);

  if (type === "prompt_block") {
    const validation = validatePromptBlock(descriptor);
    addDenial(denials, "PROMPT_BLOCK_EXECUTION_DENIED", "prompt_block is context-only and cannot execute.");
    if (!validation.valid) warnings.push(...validation.warnings);
  }

  if (type === "task_descriptor" && hasPromptBlockLeakage(descriptor)) {
    addDenial(denials, "PROMPT_BLOCK_FIELDS_IN_TASK_DESCRIPTOR", "Task descriptor contains prompt-block-only fields or header.");
  }

  validateExecutionPolicy(descriptor, denials);
  validatePathSandbox(descriptor, policy, denials);
  validateFreshness(descriptor.trace, policy, denials);

  const modeTransition = descriptor.modeTransition || null;
  if (modeTransition) {
    const modeResult = validateModeTransition(modeTransition, policy);
    if (!modeResult.allowed) addDenial(denials, "MODE_TRANSITION_BLOCKED", modeResult.reason);
    if (modeResult.requiresConfirmation && !modeTransition.confirmed) {
      addDenial(denials, "MODE_TRANSITION_REQUIRES_CONFIRMATION", "Mode transition requires operator confirmation.");
    }
  }

  return {
    type: "warden_precheck",
    allowed: denials.length === 0,
    decision: denials.length ? "deny" : "allow",
    terminalState: denials.length ? "DENIED_BEFORE_MUNCH" : "WARDEN_PASS",
    descriptorType: type || "unknown",
    policyVersion: policy.version,
    missing,
    denialReasons: denials.map((denial) => denial.code),
    denialDetails: denials,
    blocking: denials.map((denial) => denial.message),
    warnings,
    executionAllowed: denials.length === 0,
    checkedAt: new Date().toISOString(),
  };
}

function addDenial(denials, code, message) {
  if (!denials.some((denial) => denial.code === code && denial.message === message)) {
    denials.push({ code, message });
  }
}

function isMissingDescriptorField(descriptor, field) {
  if (!(field in descriptor)) return true;
  const value = descriptor[field];
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && !value.trim()) return true;
  return false;
}

function validateTraceIdentity(trace = {}, policy, denials) {
  if (!trace || typeof trace !== "object") {
    addDenial(denials, "TRACE_MISSING", "Trace object missing.");
    return;
  }
  if (!trace.source || !policy.approvedTraceSources.includes(trace.source)) {
    addDenial(denials, "TRACE_SOURCE_NOT_APPROVED", "Trace source missing or not approved.");
  }
  if (!trace.owner && !trace.ownerId) {
    addDenial(denials, "TRACE_OWNER_MISSING", "Trace owner or ownerId missing.");
  }
}

function validateBudget(budget = {}, denials) {
  if (!budget || typeof budget !== "object" || !Number.isInteger(budget.maxTokens) || budget.maxTokens < 1) {
    addDenial(denials, "BUDGET_INVALID", "Budget maxTokens must be an integer >= 1.");
  }
}

function validateExecutionPolicy(descriptor, denials) {
  const operatorMode = String(descriptor.operatorMode || "").toUpperCase();
  const target = String(descriptor.target || "");
  const executionAllowed = descriptor.executionAllowed === true;
  const contextOnly = descriptor.contextOnly === true;

  if (operatorMode === "AUDIT" && (executionAllowed || target === "tool")) {
    addDenial(denials, "AUDIT_MODE_TOOL_EXECUTION_BLOCKED", "Audit mode cannot execute tools.");
  }
  if (operatorMode === "BUILD" && descriptor.requiresConfirmation === false && (target === "tool" || target === "data")) {
    addDenial(denials, "BUILD_MODE_CONFIRMATION_REQUIRED", "Build mode tool/data descriptors require confirmation.");
  }
  if (executionAllowed && (target === "data" || contextOnly)) {
    addDenial(denials, "EXECUTION_FLAG_INCONSISTENT", "executionAllowed conflicts with target/contextOnly semantics.");
  }
}

function hasPromptBlockLeakage(descriptor) {
  const body = String(descriptor.body || descriptor.task || descriptor.prompt || "");
  return Boolean(
    "pinnedWorkspaceRoot" in descriptor ||
      "contextSnapshotId" in descriptor ||
      body.trimStart().startsWith("---pb:v1---"),
  );
}

function validatePathSandbox(descriptor, policy, denials) {
  const workspaceRoot = String(descriptor.workspaceRoot || "");
  const paths = collectDescriptorPaths(descriptor);
  if (!paths.length && !workspaceRoot) return;
  if (!isAbsoluteWindowsPath(workspaceRoot)) {
    addDenial(denials, "WORKSPACE_ROOT_INVALID", "workspaceRoot missing or not absolute.");
    return;
  }

  const allowedPaths = Array.isArray(descriptor.constraints?.allowedPaths) ? descriptor.constraints.allowedPaths : [];
  paths.forEach((candidate) => {
    const checked = checkDescriptorPath(candidate, workspaceRoot, allowedPaths, policy);
    if (!checked.ok) {
      addDenial(denials, checked.code, checked.message);
    }
  });
}

function checkDescriptorPath(candidate, workspaceRoot, allowedPaths, policy) {
  const raw = String(candidate || "").trim();
  const normalizedPath = normalize(raw.replaceAll("\\", "/")).replaceAll("\\", "/");
  if (!raw || normalizedPath.includes("../") || normalizedPath.startsWith("..")) {
    return { ok: false, code: "PATH_SANDBOX_ESCAPE", message: `Path escapes workspace sandbox: ${candidate}` };
  }

  const workspaceAbsolute = resolve(workspaceRoot);
  const absolute = /^[a-zA-Z]:[\\/]/.test(raw) ? resolve(raw) : resolve(workspaceAbsolute, normalizedPath);
  if (absolute !== workspaceAbsolute && !absolute.startsWith(workspaceAbsolute + sep)) {
    return { ok: false, code: "PATH_SANDBOX_ESCAPE", message: `Path escapes workspace sandbox: ${candidate}` };
  }

  const relative = absolute === workspaceAbsolute ? "" : normalize(absolute.slice(workspaceAbsolute.length + 1)).replaceAll("\\", "/");
  const relativeOrRaw = relative || normalizedPath;
  if (policy.forbiddenPaths.some((prefix) => relativeOrRaw.startsWith(prefix))) {
    return { ok: false, code: "FORBIDDEN_PATH", message: `Path hits forbidden prefix: ${candidate}` };
  }
  if (allowedPaths.length && !allowedPaths.some((prefix) => pathMatchesAllowedPrefix(relativeOrRaw, prefix))) {
    return { ok: false, code: "PATH_NOT_IN_ALLOWED_PATHS", message: `Path is outside allowedPaths: ${candidate}` };
  }
  return { ok: true, relative: relativeOrRaw, absolute };
}

function pathMatchesAllowedPrefix(pathValue, prefix) {
  const normalizedPrefix = String(prefix || "").replaceAll("\\", "/").replace(/\/+$/g, "");
  const normalizedPath = String(pathValue || "").replaceAll("\\", "/");
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function collectDescriptorPaths(descriptor) {
  const paths = [];
  if (Array.isArray(descriptor.files)) paths.push(...descriptor.files);
  if (Array.isArray(descriptor.constraints?.files)) paths.push(...descriptor.constraints.files);
  if (typeof descriptor.file === "string") paths.push(descriptor.file);
  if (typeof descriptor.args?.path === "string") paths.push(descriptor.args.path);
  if (typeof descriptor.args?.file === "string") paths.push(descriptor.args.file);
  if (typeof descriptor.args?.cwd === "string") paths.push(descriptor.args.cwd);
  const shellPath = descriptor.target === "tool" && normalizeGooseTool(descriptor.targetTool || descriptor.tool || descriptor.args?.tool) === "Developer.shell"
    ? parseReadonlyShell(descriptor.args?.command || "").path
    : null;
  if (shellPath) paths.push(shellPath);
  return paths;
}

function isAbsoluteWindowsPath(value) {
  return /^[a-zA-Z]:[\\/]/.test(String(value || ""));
}

function validateFreshness(trace = {}, policy, denials) {
  if (!trace?.timestamp) return;
  const timestamp = Date.parse(trace.timestamp);
  if (Number.isNaN(timestamp) || Date.now() - timestamp > policy.freshnessMs) {
    addDenial(denials, "TRACE_STALE", "Trace timestamp is stale or invalid.");
  }
}

function validateModeTransition(modeTransition, policy) {
  const from = String(modeTransition.from || "").toUpperCase();
  const to = String(modeTransition.to || "").toUpperCase();
  const rule = policy.modeTransitionPolicy[from];

  if (!rule) {
    return { allowed: false, requiresConfirmation: false, reason: `unknown mode transition source: ${from || "missing"}` };
  }

  if (!rule.allowed.includes(to)) {
    return { allowed: false, requiresConfirmation: false, reason: `mode transition blocked: ${from} -> ${to}` };
  }

  return { allowed: true, requiresConfirmation: Boolean(rule.requiresConfirmation), reason: "mode transition allowed" };
}

function readCodingModes() {
  return {
    defaultMode: "goose",
    modes: [
      {
        id: "goose",
        label: "Goose-style",
        description: "General autonomous chat plus supervised tool work.",
      },
      {
        id: "cline",
        label: "Cline-style",
        description: "Coding-heavy flow with explicit file targets, patch previews, and task breakdown.",
      },
      {
        id: "augment",
        label: "Augment-style",
        description: "Assisted engineering flow that favors context, suggestions, and low-friction iteration.",
      },
    ],
  };
}

function readWorkspaceTree() {
  return {
    root: "tripp-goose-prototype",
    path: "",
    files: listWorkspaceChildren(root, ""),
  };
}

function readWorkspaceFile(relativePath) {
  const target = resolveWorkspacePath(relativePath);
  if (!target.ok) {
    return { error: target.error };
  }

  if (!existsSync(target.absolute) || !statSync(target.absolute).isFile()) {
    return { error: "Workspace file not found." };
  }

  const stat = statSync(target.absolute);
  if (stat.size > 256_000) {
    return { error: "Workspace file is too large for inline viewing.", path: target.relative, size: stat.size };
  }

  return {
    path: target.relative,
    name: target.relative.split("/").at(-1),
    language: languageForFile(target.relative),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    previewable: target.relative.toLowerCase().endsWith(".html"),
    readonly: true,
    content: readFileSync(target.absolute, "utf8"),
  };
}

function listWorkspaceChildren(absoluteDir, relativeDir, depth = 0) {
  if (depth > 6) return [];

  return readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => !shouldIgnoreWorkspaceEntry(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 200)
    .map((entry) => {
      const relative = join(relativeDir, entry.name).replaceAll("\\", "/");
      const absolute = join(absoluteDir, entry.name);
      const stat = statSync(absolute);

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relative,
          type: "directory",
          children: listWorkspaceChildren(absolute, relative, depth + 1),
        };
      }

      return {
        name: entry.name,
        path: relative,
        type: "file",
        language: languageForFile(relative),
        size: stat.size,
        modified: stat.mtime.toISOString(),
        previewable: relative.toLowerCase().endsWith(".html"),
      };
    });
}

function resolveWorkspacePath(relativePath) {
  const normalized = normalize(String(relativePath || "").replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized.startsWith("..") || normalize(normalized).includes(`..${sep}`)) {
    return { ok: false, error: "Invalid workspace path." };
  }

  const parts = normalized.split(/[\\/]+/);
  if (parts.some((part) => shouldIgnoreWorkspaceEntry(part))) {
    return { ok: false, error: "Workspace path is ignored." };
  }

  const absolute = resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    return { ok: false, error: "Workspace path is outside the repo." };
  }

  return { ok: true, absolute, relative: normalized.replaceAll("\\", "/") };
}

function shouldIgnoreWorkspaceEntry(name) {
  return [
    ".git",
    ".tripp-runtime",
    "node_modules",
    "dist",
    "build",
    ".vite",
    ".cache",
    "server.out.log",
    "server.err.log",
  ].includes(name);
}

function languageForFile(file) {
  const ext = extname(file).toLowerCase();
  const languages = {
    ".css": "css",
    ".html": "html",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".mjs": "javascript",
    ".ps1": "powershell",
    ".svg": "svg",
    ".ts": "typescript",
    ".tsx": "tsx",
  };
  return languages[ext] || "text";
}

function readSwarmManifest() {
  try {
    return JSON.parse(readFileSync(swarmManifestFile, "utf8"));
  } catch {
    return {
      version: "0.0.0",
      face: "tripp",
      supervisor: "tripp.supervisor",
      agents: [],
    };
  }
}

async function readBackendStatus() {
  if (!backendUrl) {
    return {
      configured: false,
      reachable: false,
      replyEnabled: false,
      contract: backendContract(),
    };
  }

  const started = Date.now();
  const response = await backendFetch(backendHealthPath);
  return {
    configured: true,
    reachable: response.ok,
    status: response.status || 0,
    latency: `${Date.now() - started}ms`,
    replyEnabled: backendReplyEnabled,
    contract: backendContract(),
  };
}

function backendContract() {
  return {
    health: `GET ${backendHealthPath}`,
    reply: "POST /sessions/:sessionId/reply",
    replyRequest: {
      message: "string",
      mode: "CHAT | AUTO",
      sessionId: "string",
    },
    replyResponse: {
      message: "string",
      content: "string",
      messages: [{ kind: "agent|tool|system", speaker: "string", body: "string" }],
      usage: { inputTokens: "number", outputTokens: "number" },
    },
  };
}

async function createReply(payload) {
  const prompt = String(payload?.prompt || "").trim();
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const tool = chooseTool(prompt);
  const kind = chooseTaskKind(prompt, tool);

  if (backendUrl && backendReplyEnabled && !shouldKeepLocalAdapterTask(mode, kind, tool)) {
    const backendReply = await tryCreateBackendReply(payload);
    if (backendReply) return backendReply;
  }

  const promptBlock = createPromptBlock(prompt);
  const task = !promptBlock && mode === "AUTO" ? createTask({ prompt, tool, kind, sessionId: payload?.sessionId }) : null;

  const messages =
    promptBlock
      ? [
          {
            kind: "agent",
            speaker: "tripp.prompt>",
            body: "Copy-ready prompt block prepared.",
            promptBlock,
          },
        ]
      : mode === "AUTO"
      ? [
          {
            kind: "tool",
            speaker: "tripp.auto>",
            tool,
            result: `task ${task.id} ${task.status}`,
          },
          {
            kind: "agent",
            speaker: "tripp.supervisor>",
            body: supervisorMessage(task),
          },
        ]
      : [
          {
            kind: "agent",
            speaker: "tripp>",
            body:
              "I have the prompt. Chat mode stays conversational for now; switch to AUTO when you want tool-backed coding behavior.",
          },
        ];
  const session = recordSessionExchange(payload?.sessionId, prompt, messages);

  return {
    id: `reply-${Date.now()}`,
    mode,
    status: {
      connection: "CONNECTED",
      model: "tripp-adapter/mock",
      latency: `${380 + Math.floor(Math.random() * 160)}ms`,
      tokensIn: prompt.length,
      tokensOut: mode === "AUTO" ? 74 : 42,
    },
    task,
    trace: task?.trace || [],
    messages,
    session,
  };
}

function shouldKeepLocalAdapterTask(mode, kind, tool) {
  if (mode !== "AUTO") return false;
  if (kind === "inspect" || kind === "shell") return true;
  return kind === "git" && tool === "git_status";
}

function createTask({ prompt, tool, kind, sessionId }) {
  const target = detectTargetFile(prompt) || detectKnownEditTarget(prompt, kind);
  const routeInfo = routePrompt(prompt, tool, kind);
  const routingDecision = createSupervisorRoutingDecision(prompt, tool, kind, target);
  const task = {
    id: `task-${Date.now()}`,
    title: summarizeTask(prompt),
    prompt,
    kind,
    tool,
    target: target?.relative || null,
    sessionId: sessionId || null,
    status: initialTaskStatus(kind, tool),
    agentId: routeInfo.agentId,
    routingDecision,
    trace: createSwarmTrace(routeInfo, tool),
    lifecycle: createTaskLifecycle("proposed", "tripp.supervisor", "task descriptor created from operator prompt", null),
    createdAt: new Date().toISOString(),
  };
  task.lifecycle.events[0].taskId = task.id;

  if (kind === "inspect") {
    const adapter = target ? runTaskAdapterCall(task, "Developer.read", { tool: "read", path: target.relative }) : null;
    task.adapter = createTaskAdapterEvidence(adapter);
    task.excerpt = adapter?.result?.shaped?.content || "";
    task.result = adapter?.status === "ok"
      ? `Read-only excerpt prepared from ${target.relative} through goose.adapter.`
      : "Inspection blocked. No approved repo-local target file was detected.";
    task.permission = permissionDecision(tool, adapter?.status === "ok" ? "allow" : "gated", adapter?.error?.code || "repo-local read-only inspection");
  }

  if (kind === "git" && tool === "git_status") {
    const adapter = runTaskAdapterCall(task, "Developer.shell", { tool: "shell", command: "git status" });
    task.adapter = createTaskAdapterEvidence(adapter);
    task.excerpt = adapter?.result?.shaped?.stdout || "";
    task.result = adapter?.status === "ok"
      ? "Safe git status snapshot captured through goose.adapter. No repository mutation was performed."
      : "Git status blocked by the read-only adapter.";
    task.permission = permissionDecision(tool, adapter?.status === "ok" ? "allow" : "gated", adapter?.error?.code || "git status is read-only");
  }

  if (kind === "git" && tool !== "git_status") {
    task.result = "Mutating git actions are gated until the command approval bridge is implemented.";
    task.permission = permissionDecision(tool, "blocked", "mutating git actions are not executable in this prototype");
  }

  if (kind === "shell") {
    const command = detectSafeShellCommand(prompt);
    const adapter = command ? runTaskAdapterCall(task, "Developer.shell", { tool: "shell", command: command.label }) : null;
    task.adapter = createTaskAdapterEvidence(adapter);
    task.status = adapter?.status === "ok" ? "completed" : "gated";
    task.excerpt = adapter?.result?.shaped?.stdout || "";
    task.result = adapter?.status === "ok"
      ? `Safe shell command completed through goose.adapter: ${command.label}`
      : "Shell request gated. Only read-only allowlisted commands can auto-run.";
    task.permission = permissionDecision(tool, adapter?.status === "ok" ? "allow" : "gated", adapter?.error?.code || "command is outside the read-only shell allowlist");
  }

  if (kind === "analysis") {
    const analysis = createAnalysisSnapshot(target);
    task.status = analysis.ok ? "completed" : "gated";
    task.excerpt = analysis.excerpt;
    task.findings = analysis.findings;
    task.result = analysis.message;
    task.permission = permissionDecision(tool, analysis.ok ? "allow" : "gated", analysis.reason);
  }

  if (routingDecision.lane === "munch") {
    task.status = "retrieval_ready";
    task.permission = permissionDecision(tool, "allow", "retrieval-only Munch lane; no execution or mutation");
    task.traceMap = createTraceDroneMap({ task: prompt, traceId: `trace_${task.id}` });
    task.retrieval = createMunchRetrieval({
      id: `rr_${task.id}`,
      kind: routingDecision.retrievalKind,
      workspace: root,
      paths: target?.relative ? [target.relative] : [],
      query: prompt,
      intent: {
        task_type: routingDecision.taskType,
        reason: routingDecision.reason,
      },
      policy: {
        retrieval_mode: routingDecision.retrievalMode,
        max_results: 8,
        allow_full_read: false,
        compress_output: true,
        include_evidence: true,
        dedupe_key: routingDecision.dedupeKey,
      },
    });
    task.result = "Supervisor routed this through the Munch retrieval lane before native reads or edits.";
  }

  if (routingDecision.lane === "hybrid") {
    task.traceMap = createTraceDroneMap({ task: prompt, traceId: `trace_${task.id}` });
    task.result = `${task.result || "Task staged."} Hybrid lane selected: collect native runtime evidence, then use Munch for supporting docs/config retrieval.`;
  }

  if (kind === "edit") {
    task.permission = permissionDecision(tool, "gated", "filesystem writes require patch preview and guarded apply");
    task.patchPlan = createPatchPlan(task);
  }

  task.codingMode = chooseCodingMode(prompt, kind, tool);
  task.evidenceGate = createEvidenceGate(task);
  advanceTaskLifecycle(task, "routed", "tripp.supervisor", "task routed through supervisor lane selection");
  const initialLifecycleState = lifecycleStateFromTask(task);
  if (initialLifecycleState !== "routed") {
    advanceTaskLifecycle(task, initialLifecycleState, "tripp.supervisor", "initial evidence and permission gates evaluated");
  }

  taskQueue.unshift(task);
  saveTaskQueue();
  return task;
}

function supervisorMessage(task) {
  if (task.routingDecision?.lane === "munch") {
    return "I routed that through the Munch retrieval lane. Native reads/edits wait until retrieval evidence narrows the target.";
  }

  if (task.routingDecision?.lane === "hybrid") {
    return "I marked that as a hybrid investigation: native runtime evidence first, then Munch-backed policy/context support.";
  }

  if (task.kind === "inspect") {
    return task.target
      ? `I inspected ${task.target} and prepared a read-only excerpt in TASKS. No file mutation was performed.`
      : "I could not find an approved repo-local file to inspect. Name a target like README.md or server.mjs.";
  }

  if (task.kind === "edit") {
    return "I staged that edit as a supervised task. Review the patch before anything writes.";
  }

  if (task.kind === "git") {
    return task.tool === "git_status"
      ? "I checked git status and put the read-only snapshot in TASKS."
      : "That git action is gated for now. I recorded it in TASKS without asking you to click through a disabled flow.";
  }

  if (task.kind === "shell") {
    return task.status === "completed"
      ? "I ran the safe read-only shell check and put the output in TASKS."
      : "That shell request is outside the safe read-only allowlist, so I gated it without a click-through.";
  }

  if (task.kind === "analysis") {
    return task.status === "completed"
      ? `I analyzed ${task.target} and put the read-only findings in TASKS.`
      : "I need an approved repo-local file target before I can analyze anything.";
  }

  return "I recorded that task in TASKS.";
}

function runTaskAdapterCall(task, targetTool, args) {
  const descriptor = createTaskAdapterDescriptor(task, targetTool, args);
  const warden = wardenPrecheck(descriptor);
  descriptor.trace.wardenDecision = warden.terminalState;
  if (!warden.allowed) {
    const cystEvent = recordWardenDenialEvent(descriptor, warden);
    return {
      status: "denied",
      tool: targetTool,
      invoked: false,
      error: {
        code: warden.denialReasons?.[0] || "WARDEN_DENIED",
        message: warden.blocking?.[0] || "Warden denied this descriptor.",
      },
      warden,
      trace: { cysToken: cystEvent?.cysToken || null },
      cystEvent,
    };
  }

  const route = {
    id: `route-${task.id}`,
    destination: "goose.adapter",
    tool: targetTool,
  };
  return { ...gooseAdapterCall(route, descriptor), warden, route };
}

function createTaskAdapterDescriptor(task, targetTool, args) {
  return {
    id: `desc-${task.id}`,
    type: "task_descriptor",
    intent: "inspect",
    target: "tool",
    targetTool,
    workspaceRoot: root,
    constraints: { allowedPaths: ["README.md", "server.mjs", "scripts", "docs", "contracts", "agents", "tripp-terminal-data.json"] },
    budget: { maxTokens: 1200 },
    allowedTools: ["Developer.read", "Developer.tree", "Developer.shell"],
    trace: {
      traceId: `trace-${task.id}`,
      source: "supervisor",
      ownerId: "tripp.supervisor",
      munch: { decision: "allow", budgetDecision: "allow", cap: 2000, capSource: "read-only-task" },
    },
    args,
  };
}

function createTaskAdapterEvidence(adapter) {
  if (!adapter) return null;
  return {
    status: adapter.status,
    tool: adapter.tool,
    invoked: adapter.invoked,
    errorCode: adapter.error?.code || null,
    resultType: adapter.result?.shaped?.type || null,
    summary: adapter.result?.shaped?.summary || adapter.error?.message || "",
    wardenState: adapter.warden?.terminalState || adapter.error?.wardenDecision || "unknown",
    route: adapter.route?.destination || "goose.adapter",
    cysToken: adapter.cystEvent?.cysToken || adapter.trace?.cysToken || null,
    redactionLog: adapter.redactionLog || [],
  };
}

function createEvidenceGate(task) {
  const lane = task.routingDecision?.lane || "native";
  const missing = [];
  const satisfied = [];

  if (lane === "native") {
    if (task.permission?.decision) satisfied.push(`permission:${task.permission.decision}`);
    else missing.push("permission decision");

    if (task.target || task.tool === "shell_execute" || task.tool?.startsWith("git_")) {
      satisfied.push(task.target ? `target:${task.target}` : `tool:${task.tool}`);
    } else if (task.kind === "edit") {
      missing.push("explicit target file");
    }

    return {
      status: missing.length ? "blocked" : "ready",
      lane,
      summary: missing.length ? "Native action needs more exact evidence." : "Native lane has enough local evidence for current state.",
      satisfied,
      missing,
      next: missing.length ? ["narrow target or request retrieval first"] : ["continue with guarded native flow"],
    };
  }

  if (lane === "munch") {
    const terminalState = task.traceMap?.traceVerification?.terminalState;
    const mockEvidence = task.retrieval?.editAuthoritative === false || task.traceMap?.editAuthoritative === false;
    if (terminalState) satisfied.push(`trace:${terminalState}`);
    else missing.push("trace map");
    if (terminalState === "TRACE_ESCALATE" || terminalState === "TRACE_UNRESOLVED") {
      missing.push("trace pass state");
    }

    if (task.retrieval?.backend) satisfied.push(`backend:${task.retrieval.backend}`);
    else missing.push("retrieval backend");

    if (task.retrieval?.fallback_chain?.length) satisfied.push(`fallback:${task.retrieval.fallback_chain.join("->")}`);
    else missing.push("fallback chain");

    if (task.retrieval?.confidence && task.retrieval.confidence !== "low") satisfied.push(`confidence:${task.retrieval.confidence}`);
    else missing.push("confidence >= medium");

    if (task.retrieval?.results?.length) satisfied.push("narrowed results");
    else missing.push("narrowed result path/symbol/section");

    if (task.retrieval?.evidence?.length) satisfied.push("provenance evidence");
    else missing.push("evidence provenance");

    if (mockEvidence) {
      satisfied.push("mock evidence labeled");
      missing.push("live edit-authoritative evidence");
    }

    return {
      status: missing.length ? "blocked" : "ready",
      lane,
      summary: missing.length
        ? mockEvidence
          ? "Mock retrieval can support planning only. It cannot authorize edits."
          : "Retrieval evidence is not strong enough for edits yet."
        : "Retrieval evidence is sufficient to escalate to exact native reads.",
      satisfied,
      missing,
      next: missing.length
        ? ["wire real Munch backend", "retry retrieval with scoped query", "keep edits blocked until evidence is live"]
        : ["read exact target files natively", "prepare guarded edit plan if requested"],
      evidenceAuthority: mockEvidence ? "mock" : "live",
      editAuthoritative: !mockEvidence,
    };
  }

  missing.push("native runtime observation");
  missing.push("supporting Munch context map");
  if (task.traceMap?.traceVerification?.terminalState) satisfied.push(`trace:${task.traceMap.traceVerification.terminalState}`);
  else missing.push("trace map");
  return {
    status: "blocked",
    lane,
    summary: "Hybrid investigations need live runtime evidence and supporting retrieval before action.",
    satisfied: task.excerpt ? ["runtime excerpt captured"] : [],
    missing,
    next: ["collect native runtime/process evidence", "run Munch context-map for supporting docs/config"],
  };
}

function createSupervisorRoutingDecision(prompt, tool, kind, target) {
  const lower = `${prompt} ${tool} ${kind}`.toLowerCase();
  const isRuntime =
    lower.includes("runtime") ||
    lower.includes("contract") ||
    lower.includes("process") ||
    lower.includes("endpoint health") ||
    lower.includes("live health") ||
    lower.includes("goosed");
  const isMutation =
    kind === "edit" ||
    tool === "filesystem_write" ||
    tool === "shell_execute" ||
    tool?.startsWith("git_") ||
    lower.includes("apply") ||
    lower.includes("run ");
  const isRetrieval =
    lower.includes("where") ||
    lower.includes("find") ||
    lower.includes("trace") ||
    lower.includes("search") ||
    lower.includes("map") ||
    lower.includes("docs") ||
    lower.includes("policy") ||
    lower.includes("config") ||
    lower.includes("source of truth") ||
    lower.includes("owner") ||
    lower.includes("which file");

  if (isRuntime && !isMutation) {
    return routingDecision("hybrid", "runtime evidence must be observed natively, then supported with Munch retrieval", {
      retrievalKind: "context_map",
      retrievalMode: "deep_analysis",
      taskType: "mixed",
      requiresExactRead: true,
      confidenceRequired: "medium",
      dedupeKey: slugForDedupe(prompt, "runtime-contract"),
    });
  }

  if (isRetrieval && !isMutation && !target) {
    const retrievalKind = lower.includes("doc") || lower.includes("policy") || lower.includes("rule")
      ? "doc_search"
      : lower.includes("config") || lower.includes("data") || lower.includes("json") || lower.includes("yaml")
        ? "data_search"
        : lower.includes("map") || lower.includes("trace") || lower.includes("source of truth")
          ? "context_map"
          : "code_search";

    return routingDecision("munch", "discovery/narrowing request should use retrieval before native reads", {
      retrievalKind,
      retrievalMode: retrievalKind === "context_map" ? "deep_analysis" : "retrieval_first",
      taskType: retrievalKind === "doc_search" ? "doc" : retrievalKind === "data_search" ? "data" : "code",
      requiresExactRead: true,
      confidenceRequired: "medium",
      dedupeKey: slugForDedupe(prompt, retrievalKind),
    });
  }

  return routingDecision("native", "exact execution or target is already known; native Tripp.g lane is appropriate", {
    retrievalKind: null,
    retrievalMode: "fast_exec",
    taskType: kind || "mixed",
    requiresExactRead: false,
    confidenceRequired: "medium",
    dedupeKey: null,
  });
}

function routingDecision(lane, reason, options) {
  return {
    lane,
    reason,
    retrievalKind: options.retrievalKind,
    retrievalMode: options.retrievalMode,
    taskType: options.taskType,
    confidenceRequired: options.confidenceRequired,
    requiresExactRead: options.requiresExactRead,
    evidenceRequired:
      lane === "native"
        ? ["target file or command known", "permission decision"]
        : [
            "backend",
            "fallback_chain",
            "confidence >= medium before edit",
            "result path/symbol/section reason",
            "evidence provenance",
          ],
    dedupeKey: options.dedupeKey,
  };
}

function slugForDedupe(prompt, fallback) {
  const slug = String(prompt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function updateTask(taskId, action) {
  const task = taskQueue.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { error: "Task not found." };
  }

  if (action === "approve") {
    if (task.kind === "inspect") {
      task.status = "inspected";
      task.result = "Inspection acknowledged. No file mutation was performed.";
      advanceTaskLifecycle(task, "completed", "operator", "read-only inspection acknowledged");
      saveTaskQueue();
      return { task };
    }

    task.status = "patch_ready";
    task.patchPlan = materializePatchPlan(task, task.patchPlan || createPatchPlan(task));
    task.patch = createPatchPreview(task);
    if (task.patchPlan) approvePatchPlan(task);
    task.result = task.patchPlan
      ? "Patch reviewed and approved for this exact preview. Apply still requires a separate action."
      : "No guarded patch is available for this task yet.";
    recordPatchEvent(task, "patch_preview", task.patchPlan ? "ok" : "blocked", task.patchPlan ? null : "PATCH_PLAN_MISSING");
    if (task.patchPlan) recordPatchEvent(task, "patch_approval", "ok", null);
    advanceTaskLifecycle(task, "approved", "operator", "operator approved guarded patch preview");
    saveTaskQueue();
    return { task };
  }

  if (action === "apply") {
    recordPatchEvent(task, "apply_requested", "active", null);
    const applied = applyTaskPatch(task);
    task.status = applied.ok ? "applied" : "apply_blocked";
    task.result = applied.message;
    recordPatchEvent(task, "apply_result", applied.ok ? "ok" : "blocked", applied.ok ? null : applied.code || "APPLY_BLOCKED");
    advanceTaskLifecycle(task, applied.ok ? "completed" : "failed", "tripp.executor", applied.message);
    saveTaskQueue();
    return { task };
  }

  if (action === "dismiss") {
    task.status = "dismissed";
    task.result = "Dismissed by operator.";
    advanceTaskLifecycle(task, "dismissed", "operator", "operator dismissed task");
    saveTaskQueue();
    return { task };
  }

  return { error: "Unknown task action.", task };
}

function loadTaskQueue() {
  try {
    if (!existsSync(taskStoreFile)) return [];
    const parsed = JSON.parse(readFileSync(taskStoreFile, "utf8"));
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}

function loadSessionStore() {
  try {
    if (!existsSync(sessionStoreFile)) return { sessions: [] };
    const parsed = JSON.parse(readFileSync(sessionStoreFile, "utf8"));
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

function loadCystEventStore() {
  try {
    if (!existsSync(cystStoreFile)) return { events: [] };
    const parsed = JSON.parse(readFileSync(cystStoreFile, "utf8"));
    return { events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch {
    return { events: [] };
  }
}

function defaultSettings() {
  return {
    compact: {
      contextLimit: 128000,
      autoCompactAt: 96000,
      enabled: true,
      updatedAt: null,
    },
  };
}

function loadSettingsStore() {
  try {
    if (!existsSync(settingsStoreFile)) return defaultSettings();
    const parsed = JSON.parse(readFileSync(settingsStoreFile, "utf8"));
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings();
  }
}

function normalizeSettings(value = {}) {
  const defaults = defaultSettings();
  const contextLimit = clampNumber(value.compact?.contextLimit, 16000, 512000, defaults.compact.contextLimit);
  const autoCompactAt = clampNumber(value.compact?.autoCompactAt, 8000, contextLimit, defaults.compact.autoCompactAt);
  return {
    compact: {
      contextLimit,
      autoCompactAt,
      enabled: value.compact?.enabled !== false,
      updatedAt: value.compact?.updatedAt || null,
    },
  };
}

function updateSettings(payload = {}) {
  const next = normalizeSettings({
    compact: {
      ...settingsStore.compact,
      ...(payload.compact || payload),
      updatedAt: new Date().toISOString(),
    },
  });
  settingsStore.compact = next.compact;
  saveSettingsStore();
  return settingsStore;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function saveTaskQueue() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(taskStoreFile, `${JSON.stringify({ tasks: taskQueue.slice(0, 50) }, null, 2)}\n`, "utf8");
}

function saveSessionStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(sessionStoreFile, `${JSON.stringify({ sessions: sessionStore.sessions.slice(0, 50) }, null, 2)}\n`, "utf8");
}

function saveCystEventStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(cystStoreFile, `${JSON.stringify({ events: cystEventStore.events.slice(0, 100) }, null, 2)}\n`, "utf8");
}

function saveSettingsStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(settingsStoreFile, `${JSON.stringify(settingsStore, null, 2)}\n`, "utf8");
}

function recordCystEvent(event) {
  const normalized = normalizeCystEvent(event);
  if (!normalized) return null;
  cystEventStore.events.unshift(normalized);
  saveCystEventStore();
  return normalized;
}

function normalizeCystEvent(event) {
  if (!event?.descriptorId || !event?.traceId || !event?.ownerId) return null;
  const normalized = {
    ...event,
    cysToken: event.cysToken || createCystToken(event),
    timestamp: event.timestamp || new Date().toISOString(),
  };
  if (normalized.eventType === "lifecycle_transition" && !isValidLifecycleTransition(normalized)) return null;
  return normalized;
}

function createCystToken(event) {
  if (!event?.descriptorId || !event?.traceId || !event?.ownerId) return null;
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return `cyst_${event.traceId}_${suffix}`;
}

function isValidLifecycleTransition(event) {
  const contract = readTaskLifecycleContract();
  if (!event.lifecycleState) return false;
  if (!event.previousLifecycleState) return event.lifecycleState === "proposed";
  return Boolean(contract.transitions[event.previousLifecycleState]?.includes(event.lifecycleState));
}

function recordWardenDenialEvent(descriptor = {}, warden = {}) {
  if (warden.allowed) return null;
  return recordCystEvent({
    eventType: "warden_denial",
    descriptorId: descriptor.id || warden.traceId || `warden_${Date.now()}`,
    traceId: descriptor.trace?.traceId || descriptor.id || `warden_${Date.now()}`,
    ownerId: descriptor.trace?.ownerId || descriptor.trace?.owner || "tripp.warden",
    adapter: null,
    tool: descriptor.targetTool || descriptor.tool || descriptor.args?.tool || null,
    resultStatus: "denied",
    errorCode: warden.denialReasons?.[0] || "WARDEN_DENIED",
    wardenDecision: warden.terminalState || "DENIED_BEFORE_MUNCH",
    denialReasons: warden.denialReasons || [],
    denialDetails: warden.denialDetails || [],
    lifecycleState: "denied_before_munch",
    previousLifecycleState: "proposed",
    timestamp: new Date().toISOString(),
  });
}

function recordRetrievalEvent(descriptorId, traceId, retrieval = {}) {
  return recordCystEvent({
    eventType: "retrieval_event",
    descriptorId,
    traceId,
    ownerId: "tripp.supervisor",
    adapter: "munch.mock",
    tool: retrieval.kind || "retrieval",
    resultStatus: retrieval.status || "warn",
    errorCode: retrieval.status === "fail" ? "MUNCH_MOCK_FAILED" : null,
    backend: retrieval.backend,
    confidence: retrieval.confidence,
    evidenceAuthority: retrieval.evidenceAuthority || "mock",
    editAuthoritative: retrieval.editAuthoritative === true,
    mode: retrieval.mode || "passive_assist",
    warnings: retrieval.warnings || [],
    lifecycleState: "evidence_ready",
    previousLifecycleState: "routed",
    timestamp: new Date().toISOString(),
  });
}

function recordTrialRunEvent(result = {}) {
  return recordCystEvent({
    eventType: "trial_run",
    descriptorId: result.id,
    traceId: result.id,
    ownerId: "tripp.inspector",
    adapter: null,
    tool: "read_only_harness_trials",
    resultStatus: result.status === "pass" ? "ok" : "error",
    errorCode: result.status === "pass" ? null : "TRIAL_RUN_FAILED",
    lifecycleState: result.status === "pass" ? "completed" : "failed",
    previousLifecycleState: "running",
    trialCount: result.trials?.length || 0,
    summary: result.summary,
    timestamp: result.finishedAt || new Date().toISOString(),
  });
}

function recordLifecycleEvent(task = {}, event = {}) {
  return recordCystEvent({
    eventType: "lifecycle_transition",
    descriptorId: task.id,
    traceId: task.id,
    ownerId: event.actor || "tripp.supervisor",
    adapter: null,
    tool: task.tool || task.kind || null,
    resultStatus: event.state === "failed" ? "error" : "ok",
    errorCode: event.state === "failed" ? "LIFECYCLE_FAILED" : null,
    lifecycleState: event.state,
    previousLifecycleState: event.previousState,
    reason: event.reason,
    timestamp: event.timestamp,
  });
}

function recordPatchEvent(task = {}, stage, status, errorCode) {
  return recordCystEvent({
    eventType: "patch_event",
    descriptorId: task.id,
    traceId: task.id,
    ownerId: "tripp.executor",
    adapter: null,
    tool: task.tool || "filesystem_write",
    resultStatus: status,
    errorCode,
    stage,
    targetFile: task.patchPlan?.targetFile || task.patchPlan?.file || null,
    previewFingerprint: task.patchPlan?.previewFingerprint || null,
    lifecycleState: stage === "apply_result" && status === "ok" ? "completed" : stage === "apply_result" ? "failed" : "evidence_ready",
    previousLifecycleState: stage === "patch_preview" ? "routed" : "evidence_ready",
    invoked: stage === "apply_result" && status === "ok",
    timestamp: new Date().toISOString(),
  });
}

function ensureSessionStore(bootstrap) {
  if (sessionStore.sessions.length) {
    if (!sessionStore.sessions.some((session) => session.active)) {
      sessionStore.sessions[0].active = true;
      saveSessionStore();
    }
    return sessionStore.sessions;
  }

  sessionStore.sessions = bootstrap.sessions.map((session, index) => ({
    ...session,
    id: `session-${index}`,
    active: Boolean(session.active || index === 0),
    messages: index === 0 ? bootstrap.messages.length : Number(session.messages) || 0,
    transcript: index === 0 ? normalizeTranscript(bootstrap.messages) : [],
  }));
  saveSessionStore();
  return sessionStore.sessions;
}

function createSession() {
  const session = {
    id: `session-${Date.now()}`,
    title: "New Tripp session",
    age: "now",
    messages: 0,
    active: true,
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  sessionStore.sessions.forEach((candidate) => {
    candidate.active = false;
  });
  sessionStore.sessions.unshift(session);
  saveSessionStore();
  return { session };
}

function updateSession(sessionId, action) {
  const session = sessionStore.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return { error: "Session not found." };

  if (action === "select") {
    sessionStore.sessions.forEach((candidate) => {
      candidate.active = candidate.id === sessionId;
    });
    saveSessionStore();
    return { session };
  }

  return { error: "Unknown session action.", session };
}

function recordSessionExchange(sessionId, prompt, messages) {
  const session = findOrCreateSession(sessionId);
  const time = timeLabel();
  session.transcript ||= [];
  session.transcript.push({ kind: "user", speaker: "you>", time, body: prompt });
  messages.forEach((message) => {
    session.transcript.push({ ...message, time });
  });
  session.messages = session.transcript.length;
  session.age = "now";
  session.updatedAt = new Date().toISOString();

  if (session.title === "New Tripp session" || session.title === "Untitled session") {
    session.title = summarizeTask(prompt);
  }

  sessionStore.sessions.forEach((candidate) => {
    candidate.active = candidate.id === session.id;
  });
  saveSessionStore();
  return session;
}

function findOrCreateSession(sessionId) {
  const existing = sessionStore.sessions.find((candidate) => candidate.id === sessionId);
  if (existing) return existing;

  const created = {
    id: sessionId || `session-${Date.now()}`,
    title: "Untitled session",
    age: "now",
    messages: 0,
    active: true,
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessionStore.sessions.unshift(created);
  return created;
}

function normalizeTranscript(messages) {
  return messages.map((message) => ({ kind: "agent", ...message }));
}

function timeLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function summarizeTask(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled task";
  return cleaned.length > 46 ? `${cleaned.slice(0, 43)}...` : cleaned;
}

function initialTaskStatus(kind, tool) {
  if (kind === "inspect") return "inspected";
  if (kind === "git" && tool === "git_status") return "completed";
  if (kind === "git") return "gated";
  if (kind === "shell") return "gated";
  if (kind === "analysis") return "gated";
  return "pending";
}

function createPatchPreview(task) {
  if (task.tool !== "filesystem_write" || !task.patchPlan) {
    return `# ${task.tool}\n\nNo file mutation preview is available for this tool yet.`;
  }

  const plan = task.patchPlan;
  const file = plan.targetFile || plan.file;
  const expected = plan.expectedText || plan.expected;
  const replacement = plan.replacementText || plan.replacement;
  return [`--- a/${file}`, `+++ b/${file}`, "@@", `-${expected}`, `+${replacement}`].join("\n");
}

function createPatchPlan(task) {
  if (task.tool !== "filesystem_write") return null;

  const lower = String(task.prompt || "").toLowerCase();
  if (lower.includes("welcome message")) {
    return {
      file: "tripp-terminal-data.json",
      targetFile: "tripp-terminal-data.json",
      operation: "replace",
      expected:
        '      "body": "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin."',
      expectedText:
        '      "body": "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin."',
      replacement:
        '      "body": "Tripp.g is online. The supervised harness is ready for chat, AUTO tasks, and operator-approved edits."',
      replacementText:
        '      "body": "Tripp.g is online. The supervised harness is ready for chat, AUTO tasks, and operator-approved edits."',
    };
  }

  if (lower.includes("readme") && lower.includes("runtime")) {
    return {
      file: "README.md",
      targetFile: "README.md",
      operation: "append-once",
      expected: "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.",
      expectedText: "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.",
      replacement:
        "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.\nScoped patch tasks use preview-first plans with exact file guards.",
      replacementText:
        "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.\nScoped patch tasks use preview-first plans with exact file guards.",
    };
  }

  return null;
}

function materializePatchPlan(task, plan) {
  if (!plan) return null;
  const file = plan.targetFile || plan.file;
  const expectedText = plan.expectedText || plan.expected;
  const replacementText = plan.replacementText || plan.replacement;
  const target = resolvePatchTarget(file);
  if (!target.ok) return null;
  const current = readFileSync(target.absolute, "utf8");
  const next = {
    ...plan,
    taskId: task.id,
    operation: plan.operation || "replace",
    file,
    targetFile: file,
    absolutePathForValidation: target.absolute,
    intentSummary: task.prompt || task.title || "supervised patch",
    expected: expectedText,
    expectedText,
    replacement: replacementText,
    replacementText,
    fileFingerprint: contentHash(current),
    createdAt: new Date().toISOString(),
    approvalStatus: "reviewed",
    approval: null,
    stale: false,
    policy: {
      wardenDecision: "preview_only",
      toolInvocationPermitted: false,
      reason: "Apply requires separate operator action and freshness checks.",
    },
  };
  next.previewFingerprint = contentHash(createPatchPreview({ ...task, patchPlan: next }));
  return next;
}

function approvePatchPlan(task) {
  if (!task.patchPlan) return;
  task.patchPlan.approvalStatus = "approved_not_applied";
  task.patchPlan.approval = {
    actor: "operator",
    approvedAt: new Date().toISOString(),
    previewFingerprint: task.patchPlan.previewFingerprint,
  };
}

function createFileExcerpt(target) {
  if (!target) return "";

  const text = readFileSync(target.absolute, "utf8");
  return text.split(/\r?\n/).slice(0, 28).join("\n");
}

function createGitStatusExcerpt() {
  try {
    const output = execFileSync("git", ["status", "--short", "--branch"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    }).trim();

    return output || "## main\nworking tree clean";
  } catch (error) {
    return `git status unavailable: ${error.message}`;
  }
}

function createShellSnapshot(prompt) {
  const command = detectSafeShellCommand(prompt);
  if (!command) {
    return {
      ok: false,
      output: "",
      message: "Shell request gated. Only read-only allowlisted commands can auto-run.",
      reason: "command is outside the read-only shell allowlist",
    };
  }

  try {
    const output = execFileSync(command.file, command.args, {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    }).trim();

    return {
      ok: true,
      output: output || "(no output)",
      message: `Safe shell command completed: ${command.label}`,
      reason: `${command.label} is in the read-only shell allowlist`,
    };
  } catch (error) {
    return {
      ok: false,
      output: error.stdout || error.stderr || error.message,
      message: `Safe shell command failed: ${command.label}`,
      reason: `${command.label} is allowlisted but failed locally`,
    };
  }
}

function createAnalysisSnapshot(target) {
  if (!target) {
    return {
      ok: false,
      excerpt: "",
      findings: "",
      message: "Analysis gated. Name an approved repo-local file such as server.mjs or script.js.",
      reason: "analysis needs an approved repo-local file target",
    };
  }

  const text = readFileSync(target.absolute, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [
    `File: ${target.relative}`,
    `Lines: ${lines.length}`,
    `Bytes: ${Buffer.byteLength(text, "utf8")}`,
    `Likely role: ${describeFileRole(target.relative)}`,
    `Risk note: ${describeFileRisk(target.relative)}`,
  ].join("\n");

  return {
    ok: true,
    excerpt: lines.slice(0, 28).join("\n"),
    findings,
    message: `Read-only analysis prepared for ${target.relative}.`,
    reason: "repo-local read-only code analysis",
  };
}

function permissionDecision(tool, decision, reason) {
  return {
    tool,
    decision,
    reason,
    policyVersion: readPermissionPolicy().version,
  };
}

function createTaskLifecycle(state, actor, reason, previousState) {
  const event = {
    taskId: null,
    descriptorStatus: descriptorStatusForLifecycle(state),
    state,
    previousState,
    actor,
    reason,
    timestamp: new Date().toISOString(),
    rollback: null,
  };

  return {
    version: readTaskLifecycleContract().version,
    state,
    descriptorStatus: event.descriptorStatus,
    events: [event],
  };
}

function advanceTaskLifecycle(task, nextState, actor, reason) {
  task.lifecycle ||= createTaskLifecycle("proposed", "tripp.supervisor", "legacy task adopted into lifecycle", null);
  if (task.lifecycle.state === nextState) return;

  const contract = readTaskLifecycleContract();
  const allowed = contract.transitions[task.lifecycle.state]?.includes(nextState);
  const safeNextState = allowed ? nextState : "failed";
  const event = {
    taskId: task.id,
    descriptorStatus: descriptorStatusForLifecycle(safeNextState),
    state: safeNextState,
    previousState: task.lifecycle.state,
    actor,
    reason: allowed ? reason : `blocked invalid lifecycle transition ${task.lifecycle.state} -> ${nextState}`,
    timestamp: new Date().toISOString(),
    rollback: createRollbackPointer(task, safeNextState),
  };

  task.lifecycle.state = safeNextState;
  task.lifecycle.descriptorStatus = event.descriptorStatus;
  task.lifecycle.events.push(event);
  recordLifecycleEvent(task, event);
}

function lifecycleStateFromTask(task) {
  if (["completed", "inspected", "applied"].includes(task.status)) return "completed";
  if (["gated", "apply_blocked"].includes(task.status)) return "gated";
  if (["retrieval_ready", "inspection_ready"].includes(task.status)) return "evidence_ready";
  if (["patch_ready"].includes(task.status)) return "approved";
  if (["dismissed"].includes(task.status)) return "dismissed";
  if (["failed"].includes(task.status)) return "failed";
  return "routed";
}

function descriptorStatusForLifecycle(state) {
  if (state === "proposed") return "proposed";
  if (state === "routed" || state === "evidence_ready" || state === "gated") return "review";
  if (state === "approved" || state === "running") return "approved";
  if (state === "completed") return "verified";
  if (state === "dismissed") return "dismissed";
  return "failed";
}

function createRollbackPointer(task, state) {
  if (!readTaskLifecycleContract().rollbackRequiredFrom.includes(state)) return null;
  const files = task.traceMap?.rollback_surface?.files || (task.patchPlan?.file ? [task.patchPlan.file] : []);
  const tests = task.traceMap?.rollback_surface?.tests || [];
  return {
    files,
    tests,
    note: files.length ? "Rollback scope is bounded to these files." : "No rollback files identified.",
  };
}

function chooseCodingMode(prompt, kind, tool) {
  const lower = `${prompt} ${kind} ${tool}`.toLowerCase();
  if (lower.includes("cline") || lower.includes("patch") || lower.includes("edit") || lower.includes("write")) {
    return "cline";
  }
  if (lower.includes("augment") || lower.includes("suggest") || lower.includes("assist")) {
    return "augment";
  }
  return "goose";
}

function describeFileRole(file) {
  if (file === "server.mjs") return "local HTTP server, Tripp adapter API, and task execution guard";
  if (file === "script.js") return "browser UI state, rendering, and Tripp runtime client";
  if (file === "styles.css") return "terminal shell layout, Tripp theme, and task panel styling";
  if (file === "index.html") return "static app structure and panel mount points";
  if (file.endsWith(".json")) return "seed data for terminal messages, tools, sessions, and status";
  if (file.endsWith(".md")) return "project documentation or agent doctrine";
  return "repo-local project file";
}

function describeFileRisk(file) {
  if (file === "server.mjs") return "high leverage; mistakes can break API routes or weaken task guards";
  if (file === "script.js") return "high UI impact; mistakes can break prompt/task rendering";
  if (file === "styles.css") return "visual impact; mistakes can hide controls or harm layout";
  if (file === "tripp-terminal-data.json") return "low-medium; malformed JSON breaks bootstrap data";
  return "read-only analysis only; no mutation performed";
}

function applyTaskPatch(task) {
  if (task.status !== "patch_ready") {
    return { ok: false, code: "TASK_NOT_APPROVED", message: "Apply blocked. Task must be approved, not applied." };
  }

  if (task.tool !== "filesystem_write") {
    return { ok: false, code: "TOOL_NOT_WRITE_CAPABLE", message: "Apply blocked. Only filesystem_write tasks can mutate files." };
  }

  if (task.patch !== createPatchPreview(task)) {
    return { ok: false, code: "PATCH_PREVIEW_MISMATCH", message: "Apply blocked. Patch preview does not match the approved guarded patch." };
  }

  const plan = task.patchPlan || createPatchPlan(task);
  if (!plan) {
    return { ok: false, code: "PATCH_PLAN_MISSING", message: "Apply blocked. No guarded patch plan is available for this task." };
  }

  if (plan.approvalStatus !== "approved_not_applied" || plan.approval?.previewFingerprint !== plan.previewFingerprint) {
    return { ok: false, code: "PATCH_NOT_APPROVED", message: "Apply blocked. This exact preview has not been approved." };
  }

  const target = resolvePatchTarget(plan.targetFile || plan.file);
  if (!target.ok) {
    return { ok: false, code: target.code, message: target.message };
  }

  const current = readFileSync(target.absolute, "utf8");
  const expectedText = plan.expectedText || plan.expected;
  const replacementText = plan.replacementText || plan.replacement;
  if (current.includes(replacementText)) {
    return { ok: true, message: `Applied patch already present in ${target.relative}.` };
  }

  if (contentHash(current) !== plan.fileFingerprint) {
    plan.stale = true;
    return { ok: false, code: "PATCH_APPROVAL_STALE", message: "Apply blocked. Approval stale - file changed since review." };
  }

  const matches = countOccurrences(current, expectedText);
  if (matches !== 1) {
    return { ok: false, code: matches ? "PATCH_AMBIGUOUS_MATCH" : "PATCH_EXPECTED_TEXT_MISSING", message: "Apply blocked. Expected text is missing or ambiguous." };
  }

  const updated = current.replace(expectedText, replacementText);
  writeFileSync(target.absolute, updated, "utf8");
  plan.approvalStatus = "applied";
  return { ok: true, message: `Applied approved patch to ${target.relative}.` };
}

function resolvePatchTarget(file) {
  const relative = String(file || "").replaceAll("\\", "/");
  const resolved = resolveWorkspacePath(relative);
  if (!resolved.ok) return { ok: false, code: "PATCH_PATH_BLOCKED", message: `Apply blocked. ${resolved.error}` };
  if (!["tripp-terminal-data.json", "README.md"].includes(resolved.relative)) {
    return { ok: false, code: "PATCH_TARGET_NOT_ALLOWED", message: "Apply blocked. Target file is outside the approved workspace guard." };
  }
  return resolved;
}

function contentHash(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

async function tryCreateBackendReply(payload) {
  const sessionId = String(payload?.sessionId || "");
  const prompt = String(payload?.prompt || "").trim();
  if (!sessionId || !prompt) {
    return null;
  }

  const started = Date.now();
  const backendResponse = await backendFetch(`/sessions/${encodeURIComponent(sessionId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ message: prompt, mode: payload.mode, sessionId }),
  });

  if (!backendResponse.ok) {
    return null;
  }

  const body = await backendResponse.json();
  const messages = mapBackendMessages(body);
  const tasks = mapBackendTasks(body, sessionId, prompt);
  const usage = mapBackendUsage(body);
  const session = recordSessionExchange(sessionId, prompt, messages);

  return {
    id: `backend-reply-${Date.now()}`,
    mode: String(payload?.mode || "CHAT").toUpperCase(),
    status: {
      connection: "CONNECTED",
      model: "tripp-adapter/backend",
      latency: `${Date.now() - started}ms`,
      tokensIn: usage.inputTokens ?? prompt.length,
      tokensOut: usage.outputTokens ?? messages.reduce((sum, message) => sum + String(message.body || "").length, 0),
    },
    task: tasks[0] || null,
    tasks,
    messages,
    session,
  };
}

function mapBackendMessages(value) {
  if (Array.isArray(value?.messages)) {
    return value.messages.map((message) => ({
      kind: message.kind || "agent",
      speaker: message.speaker || "tripp>",
      body: mapBackendReply(message),
      promptBlock: message.promptBlock,
      tool: message.tool,
      result: message.result,
    }));
  }

  return [
    {
      kind: "agent",
      speaker: "tripp>",
      body: mapBackendReply(value),
    },
  ];
}

function mapBackendReply(value) {
  if (typeof value === "string") return value;
  if (value?.body) return String(value.body);
  if (value?.message) return String(value.message);
  if (value?.content) return String(value.content);
  if (value?.text) return String(value.text);
  return "Backend reply received. Event streaming mapper is the next integration step.";
}

function createPromptBlock(prompt) {
  const lower = String(prompt || "").toLowerCase();
  const wantsPrompt =
    lower.includes("goose.prompt") ||
    (lower.includes("goose") && lower.includes("prompt")) ||
    lower.includes("copy ready prompt") ||
    lower.includes("copy-ready prompt");

  if (!wantsPrompt) return null;

  const contextSnapshotId = `ctx_${Date.now()}`;
  const body = [
    "---pb:v1---",
    "Goose.Prompt",
    "",
    `pinnedWorkspaceRoot: ${root}`,
    `contextSnapshotId: ${contextSnapshotId}`,
    "executionAllowed: false",
    "contextOnly: true",
    "descriptorStatus: proposed",
    "",
    "Context:",
    "- Tripp.g is the user-facing harness shell.",
    "- Keep all findings evidence-backed and avoid changing files unless explicitly asked.",
    "- Treat TripCore.Munch.g as retrieval/narrowing support and native Goose tools as execution support.",
    "",
    "Task:",
    "- Review the current Tripp.g direction and produce one concise, implementation-ready recommendation.",
    "- Focus on schema, routing, runtime contract, or workspace UI only if it helps the next build chunk.",
    "",
    "Output:",
    "- Lead with the recommendation.",
    "- Include any risks or missing evidence.",
    "- End with a small next-step checklist.",
  ].join("\n");

  return normalizePromptBlock({
    type: "prompt_block",
    label: "Goose.Prompt",
    body,
    header: "---pb:v1---",
    executionAllowed: false,
    contextOnly: true,
    descriptorStatus: "proposed",
    requiresReview: true,
    pinnedWorkspaceRoot: root,
    contextSnapshotId,
    validation: validatePromptBlock({ body, pinnedWorkspaceRoot: root, contextSnapshotId }),
  });
}

function normalizePromptBlock(block) {
  return {
    type: "prompt_block",
    label: block.label || "PromptBlock",
    header: block.header || "---pb:v1---",
    body: String(block.body || ""),
    executionAllowed: false,
    contextOnly: true,
    descriptorStatus: "proposed",
    requiresReview: true,
    pinnedWorkspaceRoot: block.pinnedWorkspaceRoot || root,
    contextSnapshotId: block.contextSnapshotId || null,
    validation: block.validation || validatePromptBlock(block),
  };
}

function validatePromptBlock(block = {}) {
  const body = String(block.body || block.text || "");
  const pinnedWorkspaceRoot = String(block.pinnedWorkspaceRoot || extractPromptBlockField(body, "pinnedWorkspaceRoot") || "");
  const contextSnapshotId = block.contextSnapshotId || extractPromptBlockField(body, "contextSnapshotId") || null;
  const hasHeader = body.trimStart().startsWith("---pb:v1---") || block.header === "---pb:v1---";
  const rootMatches = pinnedWorkspaceRoot === root;
  const hasExecutableIntent = /\bexecutionAllowed:\s*true\b|\btool:\s*(shell_execute|filesystem_write|git_commit)\b/i.test(body);
  const warnings = [];

  if (!hasHeader) warnings.push("missing ---pb:v1--- header");
  if (!pinnedWorkspaceRoot) warnings.push("missing pinnedWorkspaceRoot");
  else if (!rootMatches) warnings.push("pinnedWorkspaceRoot does not match current workspace");
  if (!contextSnapshotId) warnings.push("missing contextSnapshotId");
  if (hasExecutableIntent) warnings.push("prompt block contains executable intent fields");

  const status = !hasHeader || hasExecutableIntent
    ? "malformed"
    : pinnedWorkspaceRoot && !rootMatches
      ? "stale_root"
      : !contextSnapshotId
        ? "stale_context"
        : "valid";

  return {
    type: "prompt_block_validation",
    valid: status === "valid",
    status,
    executionAllowed: false,
    contextOnly: true,
    descriptorStatus: "proposed",
    pinnedWorkspaceRoot,
    currentWorkspaceRoot: root,
    contextSnapshotId,
    warnings,
  };
}

function extractPromptBlockField(body, key) {
  return String(body || "").match(new RegExp(`^${key}:\\s*(.+)$`, "im"))?.[1]?.trim() || "";
}

function mapBackendTasks(value, sessionId, prompt) {
  const rawTasks = [
    ...(Array.isArray(value?.tasks) ? value.tasks : []),
    ...(Array.isArray(value?.messages)
      ? value.messages.filter((message) => message.kind === "tool" || message.tool)
      : []),
  ];
  const tasks = rawTasks.map((item, index) => normalizeBackendTask(item, index, sessionId, prompt));

  [...tasks].reverse().forEach((task) => taskQueue.unshift(task));
  if (tasks.length) saveTaskQueue();
  return tasks;
}

function normalizeBackendTask(value, index, sessionId, prompt) {
  const tool = value.tool || value.name || "backend_event";
  const routeInfo = routePrompt(prompt, tool, value.kind || "backend");
  const routingDecision = createSupervisorRoutingDecision(prompt, tool, value.kind || "backend", null);
  const retrieval =
    routingDecision.lane === "munch"
      ? createMunchRetrieval({
          id: `rr_${value.id || `backend-task-${Date.now()}-${index}`}`,
          kind: routingDecision.retrievalKind,
          workspace: root,
          paths: [],
          query: prompt,
          intent: {
            task_type: routingDecision.taskType,
            reason: routingDecision.reason,
          },
          policy: {
            retrieval_mode: routingDecision.retrievalMode,
            max_results: 8,
            allow_full_read: false,
            compress_output: true,
            include_evidence: true,
            dedupe_key: routingDecision.dedupeKey,
          },
        })
      : null;
  const traceMap =
    routingDecision.lane === "munch" || routingDecision.lane === "hybrid"
      ? createTraceDroneMap({ task: prompt, traceId: `trace_${value.id || `backend-task-${Date.now()}-${index}`}` })
      : null;
  const task = {
    id: value.id || `backend-task-${Date.now()}-${index}`,
    title: value.title || value.summary || tool || summarizeTask(prompt),
    prompt,
    kind: value.kind === "tool" ? "backend_tool" : value.kind || "backend",
    tool,
    target: value.target || null,
    sessionId,
    status: normalizeBackendTaskStatus(value.status || value.state),
    result: value.result || value.body || value.message || value.content || "Backend event completed.",
    excerpt: value.excerpt || value.output || null,
    origin: "backend",
    agentId: routeInfo.agentId,
    routingDecision,
    retrieval,
    traceMap,
    trace: createSwarmTrace(routeInfo, tool),
    lifecycle: createTaskLifecycle("proposed", "tripp.supervisor", "backend task normalized into Tripp lifecycle", null),
    codingMode: chooseCodingMode(prompt, value.kind || "backend", tool),
    createdAt: new Date().toISOString(),
  };
  task.lifecycle.events[0].taskId = task.id;
  task.evidenceGate = createEvidenceGate(task);
  advanceTaskLifecycle(task, "routed", "tripp.supervisor", "backend task routed through supervisor lane selection");
  const backendLifecycleState = lifecycleStateFromTask(task);
  if (backendLifecycleState !== "routed") {
    advanceTaskLifecycle(task, backendLifecycleState, "tripp.supervisor", "backend task evidence and status normalized");
  }

  return task;
}

function createSwarmTrace(routeInfo, tool) {
  return [
    {
      actor: "tripp",
      event: "intent_received",
      detail: "User intent accepted by the Tripp face.",
    },
    {
      actor: "tripp.supervisor",
      event: "delegated",
      detail: `${routeInfo.reason}; tool lane ${tool || "none"}.`,
    },
    {
      actor: routeInfo.agentId,
      event: "assigned",
      detail: `${routeInfo.label} owns ${routeInfo.toolSet}.`,
    },
  ];
}

function routePrompt(prompt, tool = "", kind = "") {
  const lower = `${prompt} ${tool} ${kind}`.toLowerCase();

  if (lower.includes("audit") || lower.includes("permission") || lower.includes("risk")) {
    return route("tripp.auditor", "risk and permission traceability");
  }

  if (lower.includes("inspect") || lower.includes("quality") || lower.includes("review")) {
    return route("tripp.inspector", "quality and scope review");
  }

  if (lower.includes("shell") || lower.includes("command") || lower.includes("test") || lower.includes("git")) {
    return route("tripp.drone.three", "execution, verification, and git lane");
  }

  if (lower.includes("analyze") || lower.includes("search") || lower.includes("explain") || tool === "code_analyze") {
    return route("tripp.drone.two", "code search and analysis lane");
  }

  if (lower.includes("read") || lower.includes("list") || lower.includes("status") || tool.startsWith("filesystem_")) {
    return route("tripp.drone.one", "workspace context and file lane");
  }

  if (lower.includes("frontend") || lower.includes("ui") || lower.includes("theme")) {
    return route("tripp.picasso", "frontend bridge lane");
  }

  return route("tripp.supervisor", "default coordination lane");
}

function route(agentId, reason) {
  const swarm = readSwarmManifest();
  const agent = swarm.agents.find((candidate) => candidate.id === agentId) || swarm.agents[0];
  return {
    agentId: agent?.id || "tripp.supervisor",
    label: agent?.label || "Tripp.supervisor",
    lane: agent?.lane || "coordination",
    toolSet: agent?.toolSet || "delegation",
    reason,
  };
}

function normalizeBackendTaskStatus(status) {
  const value = String(status || "completed").toLowerCase();
  if (["completed", "pending", "gated", "dismissed", "applied"].includes(value)) return value;
  if (["running", "queued", "started"].includes(value)) return "pending";
  if (["blocked", "denied", "failed"].includes(value)) return "gated";
  return "completed";
}

function mapBackendUsage(value) {
  return {
    inputTokens: Number(value?.usage?.inputTokens ?? value?.usage?.tokensIn ?? value?.tokensIn) || null,
    outputTokens: Number(value?.usage?.outputTokens ?? value?.usage?.tokensOut ?? value?.tokensOut) || null,
  };
}

async function backendFetch(path, options = {}) {
  if (!backendUrl) {
    return { ok: false };
  }

  try {
    return await fetch(`${backendUrl}${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        ...backendAuthHeaders(),
        ...(options.headers || {}),
      },
    });
  } catch {
    return { ok: false };
  }
}

function backendAuthHeaders() {
  if (!backendSecret) return {};

  return {
    Authorization: `Bearer ${backendSecret}`,
    "X-Secret-Key": backendSecret,
    "X-Goose-Secret": backendSecret,
  };
}

function normalizeBackendUrl(value) {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

function chooseTool(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("git") && lower.includes("commit")) return "git_commit";
  if (lower.includes("git")) return "git_status";
  if (lower.includes("shell") || lower.includes("terminal") || lower.includes("command")) return "shell_execute";
  if (lower.includes("node --version") || lower.includes("npm --version")) return "shell_execute";
  if (lower.includes("analyze") || lower.includes("review") || lower.includes("explain")) return "code_analyze";
  if (lower.includes("write") || lower.includes("edit")) return "filesystem_write";
  if (lower.includes("file") || lower.includes("read") || lower.includes("inspect") || lower.includes("show")) {
    return "filesystem_read";
  }
  if (lower.includes("web") || lower.includes("search")) return "web_search";
  return "code_analyze";
}

function chooseTaskKind(prompt, tool) {
  const lower = prompt.toLowerCase();
  if (tool === "filesystem_read" || lower.includes("inspect") || lower.includes("show")) return "inspect";
  if (tool === "filesystem_write") return "edit";
  if (tool.startsWith("git_")) return "git";
  if (tool === "shell_execute") return "shell";
  if (tool === "code_analyze") return "analysis";
  return "analysis";
}

function detectSafeShellCommand(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("node --version") || lower.includes("node version")) {
    return { file: "node", args: ["--version"], label: "node --version" };
  }

  if (lower.includes("npm --version") || lower.includes("npm version")) {
    return { file: "npm", args: ["--version"], label: "npm --version" };
  }

  if (lower.includes("list files") || lower.includes("dir") || lower.includes("ls")) {
    return { file: "git", args: ["ls-files"], label: "git ls-files" };
  }

  return null;
}

function detectTargetFile(prompt) {
  const allowed = [
    "tripp-terminal-data.json",
    "README.md",
    "index.html",
    "script.js",
    "styles.css",
    "server.mjs",
    "TRIPP_AGENT_TREE.md",
    "TRIPP_GOOSE_FRONTEND_AUDIT.md",
  ];
  const lower = prompt.toLowerCase();
  const match = allowed.find((file) => lower.includes(file.toLowerCase()));
  if (!match) return null;

  const absolute = resolve(root, match);
  if (!absolute.startsWith(root + sep) || !existsSync(absolute) || !statSync(absolute).isFile()) {
    return null;
  }

  return { relative: match, absolute };
}

function detectKnownEditTarget(prompt, kind) {
  if (kind !== "edit") return null;

  if (prompt.toLowerCase().includes("welcome message")) {
    return { relative: "tripp-terminal-data.json", absolute: bootstrapFile };
  }

  return null;
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolveJson) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolveJson(body ? JSON.parse(body) : {});
      } catch {
        resolveJson({});
      }
    });
    request.on("error", () => resolveJson({}));
  });
}
