import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const runtimeDir = mkdtempSync(join(tmpdir(), "tripp-runtime-verify-"));
const extraRuntimeDirs = [];
const extraServers = [];
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), TRIPP_RUNTIME_DIR: runtimeDir },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer();

  const tests = [
    ["analysis", "analyze server.mjs", "completed", "code_analyze"],
    ["inspect", "inspect README.md", "inspected", "filesystem_read"],
    ["git status", "git status", "completed", "git_status"],
    ["git commit", "git commit these changes", "gated", "git_commit"],
    ["safe shell", "run node --version command", "completed", "shell_execute"],
    ["gated shell", "run shell command delete temp files", "gated", "shell_execute"],
  ];

  const results = [];
  for (const [name, prompt, expectedStatus, expectedTool] of tests) {
    const reply = await postJson("/api/tripp/reply", { prompt, mode: "AUTO", sessionId: "verify-session" });
    const pass = reply.task?.status === expectedStatus && reply.task?.tool === expectedTool;
    results.push({ name, pass, status: reply.task?.status, tool: reply.task?.tool });
  }

  const failures = results.filter((result) => !result.pass);
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}: ${result.tool} -> ${result.status}`);
  }

  const created = await postJson("/api/tripp/sessions", {});
  const sessionId = created.session?.id;
  const sessionReply = await postJson("/api/tripp/reply", {
    prompt: "hello persisted session",
    mode: "CHAT",
    sessionId,
  });
  const bootstrap = await getJson("/api/tripp/bootstrap");
  const persisted = bootstrap.sessions.find((session) => session.id === sessionId);
  const sessionPass =
    Boolean(sessionId) &&
    sessionReply.session?.id === sessionId &&
    persisted?.transcript?.some((message) => message.body === "hello persisted session");
  console.log(`${sessionPass ? "PASS" : "FAIL"} sessions: create -> reply -> bootstrap persistence`);
  if (!sessionPass) {
    failures.push({ name: "sessions" });
  }

  const health = await getJson("/api/tripp/health");
  const healthPass =
    health.ok === true &&
    health.capabilities?.sessions === "persistent-local" &&
    health.capabilities?.shell === "read-only-allowlist" &&
    health.capabilities?.swarm === "manifest-local" &&
    health.capabilities?.permissions === "policy-local" &&
    health.capabilities?.codingModes === "policy-local" &&
    health.capabilities?.workspace === "repo-local-readonly" &&
    health.capabilities?.munch === "mock-contract";
  console.log(`${healthPass ? "PASS" : "FAIL"} health: adapter capabilities`);
  if (!healthPass) {
    failures.push({ name: "health" });
  }

  const permissions = await getJson("/api/tripp/permissions");
  const permissionPass =
    permissions.defaultDecision === "gated" &&
    permissions.lanes?.shell_execute?.decision === "allowlist" &&
    permissions.lanes?.git_commit?.decision === "blocked";
  console.log(`${permissionPass ? "PASS" : "FAIL"} permissions: policy contract`);
  if (!permissionPass) {
    failures.push({ name: "permissions" });
  }

  const codingModes = await getJson("/api/tripp/coding-modes");
  const clineReply = await postJson("/api/tripp/reply", {
    prompt: "cline style edit the welcome message",
    mode: "AUTO",
    sessionId: "verify-coding-mode-session",
  });
  const codingModePass =
    codingModes.defaultMode === "goose" &&
    codingModes.modes?.some((mode) => mode.id === "cline") &&
    clineReply.task?.codingMode === "cline" &&
    clineReply.task?.patchPlan?.file === "tripp-terminal-data.json";
  console.log(`${codingModePass ? "PASS" : "FAIL"} coding modes: policy and task style`);
  if (!codingModePass) {
    failures.push({ name: "coding modes" });
  }

  const workspaceTree = await getJson("/api/tripp/workspace/tree");
  const workspaceFile = await getJson("/api/tripp/workspace/file?path=README.md");
  const blockedFile = await getJson("/api/tripp/workspace/file?path=.git/config");
  const workspacePass =
    workspaceTree.files?.some((entry) => entry.name === "README.md") &&
    workspaceFile.language === "markdown" &&
    workspaceFile.content?.includes("# Tripp.g") &&
    blockedFile.error === "Workspace path is ignored.";
  console.log(`${workspacePass ? "PASS" : "FAIL"} workspace: tree and guarded file read`);
  if (!workspacePass) {
    failures.push({ name: "workspace" });
  }

  const munchHealth = await getJson("/api/tripp/munch/health");
  const munchRetrieve = await postJson("/api/tripp/munch/retrieve", {
    id: "verify-munch-retrieval",
    kind: "code_search",
    workspace: "verify-workspace",
    paths: ["server.mjs"],
    query: "where is Munch health exposed",
    intent: { task_type: "code", reason: "verify contract shape" },
    policy: {
      retrieval_mode: "retrieval_first",
      max_results: 4,
      allow_full_read: false,
      compress_output: true,
      include_evidence: true,
      dedupe_key: "verify-munch",
    },
  });
  const munchMap = await postJson("/api/tripp/munch/context-map", {
    id: "verify-munch-map",
    root_question: "where is Munch health exposed",
    workspace: "verify-workspace",
    scope_paths: ["server.mjs"],
  });
  const munchPass =
    munchHealth.bridge_name === "TripCore.Munch.g" &&
    munchHealth.status === "degraded" &&
    munchRetrieve.status === "warn" &&
    munchRetrieve.capability === "code_search" &&
    munchRetrieve.fallback_chain?.includes("native-tripp-tools") &&
    munchMap.status === "warn" &&
    munchMap.nodes?.some((node) => node.path === "server.mjs");
  console.log(`${munchPass ? "PASS" : "FAIL"} munch: health, retrieval, and context-map stubs`);
  if (!munchPass) {
    failures.push({ name: "munch" });
  }

  const traceMap = await postJson("/api/tripp/trace/map", {
    task: "where is Munch health exposed",
    traceId: "verify-trace-map",
  });
  const traceVerify = await postJson("/api/tripp/trace/verify", { traceMap });
  const tracePass =
    traceMap.role === "Trace.Drone" &&
    traceMap.executionAllowed === false &&
    traceMap.owners?.some((owner) => owner.file === "server.mjs") &&
    traceMap.rollback_surface?.files?.includes("server.mjs") &&
    traceVerify.terminalState === traceMap.traceVerification?.terminalState;
  console.log(`${tracePass ? "PASS" : "FAIL"} trace: map and verification stubs`);
  if (!tracePass) {
    failures.push({ name: "trace" });
  }

  const discoveryReply = await postJson("/api/tripp/reply", {
    prompt: "where is Munch health exposed",
    mode: "AUTO",
    sessionId: "verify-routing-discovery",
  });
  const editReply = await postJson("/api/tripp/reply", {
    prompt: "edit the welcome message",
    mode: "AUTO",
    sessionId: "verify-routing-edit",
  });
  const runtimeReply = await postJson("/api/tripp/reply", {
    prompt: "lock the goosed runtime contract",
    mode: "AUTO",
    sessionId: "verify-routing-runtime",
  });
  const routingPass =
    discoveryReply.task?.routingDecision?.lane === "munch" &&
    discoveryReply.task?.retrieval?.backend === "tripp-munch-mock" &&
    discoveryReply.task?.traceMap?.traceVerification?.terminalState === "TRACE_PASS_WITH_WARNINGS" &&
    discoveryReply.task?.evidenceGate?.status === "blocked" &&
    discoveryReply.task?.evidenceGate?.missing?.includes("confidence >= medium") &&
    editReply.task?.routingDecision?.lane === "native" &&
    editReply.task?.evidenceGate?.status === "ready" &&
    editReply.task?.permission?.decision === "gated" &&
    runtimeReply.task?.routingDecision?.lane === "hybrid" &&
    runtimeReply.task?.routingDecision?.retrievalKind === "context_map" &&
    runtimeReply.task?.evidenceGate?.status === "blocked";
  console.log(`${routingPass ? "PASS" : "FAIL"} supervisor: native, munch, and hybrid routing decisions`);
  if (!routingPass) {
    failures.push({ name: "supervisor routing" });
  }

  const swarm = await getJson("/api/tripp/swarm");
  const swarmPass =
    swarm.face === "tripp" &&
    swarm.supervisor === "tripp.supervisor" &&
    swarm.agents?.some((agent) => agent.id === "tripp.drone.one" && agent.reportsTo === "tripp.supervisor") &&
    swarm.agents?.some((agent) => agent.id === "tripp.auditor" && agent.lane === "quality");
  console.log(`${swarmPass ? "PASS" : "FAIL"} swarm: manifest contract`);
  if (!swarmPass) {
    failures.push({ name: "swarm" });
  }

  const routePreview = await postJson("/api/tripp/swarm/route", { prompt: "run test command", tool: "shell_execute" });
  const routedReply = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: "verify-route-session",
  });
  const routePass =
    routePreview.route?.agentId === "tripp.drone.three" &&
    routedReply.task?.agentId === "tripp.drone.three" &&
    routedReply.task?.permission?.decision === "allow" &&
    routedReply.task?.trace?.some((event) => event.actor === "tripp.supervisor") &&
    routedReply.trace?.some((event) => event.actor === "tripp.drone.three");
  console.log(`${routePass ? "PASS" : "FAIL"} swarm: supervisor route preview and task assignment`);
  if (!routePass) {
    failures.push({ name: "swarm route" });
  }

  const bridgePass = await verifyBackendBridge();
  if (!bridgePass) {
    failures.push({ name: "backend bridge" });
  }

  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  server.kill();
  extraServers.forEach((candidate) => candidate.kill?.());
  extraServers.forEach((candidate) => candidate.close?.());
  rmSync(runtimeDir, { recursive: true, force: true });
  extraRuntimeDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
}

async function verifyBackendBridge() {
  const backendPort = 4298;
  const bridgePort = 4299;
  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  const bridgeRuntimeDir = mkdtempSync(join(tmpdir(), "tripp-runtime-bridge-"));
  extraRuntimeDirs.push(bridgeRuntimeDir);

  const fakeBackend = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, { ok: true, name: "fake-goose-bridge" });
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/sessions/")) {
      const payload = await readRequestJson(request);
      sendJson(response, {
        messages: [
          {
            kind: "tool",
            speaker: "tripp.backend.tool>",
            tool: "filesystem_read",
            result: "backend tool event captured",
            status: "completed",
          },
          {
            kind: "agent",
            speaker: "tripp.backend>",
            body: `bridge received: ${payload.message}`,
          },
        ],
        tasks: [
          {
            id: "fake-backend-task",
            title: "Backend supplied task",
            kind: "backend_tool",
            tool: "filesystem_read",
            status: "completed",
            result: "Backend task event normalized.",
          },
        ],
        usage: {
          inputTokens: String(payload.message || "").length,
          outputTokens: 17,
        },
      });
      return;
    }

    sendJson(response, { error: "not found" }, 404);
  });
  await listen(fakeBackend, backendPort);
  extraServers.push(fakeBackend);

  const bridgeServer = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(bridgePort),
      TRIPP_RUNTIME_DIR: bridgeRuntimeDir,
      TRIPP_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      TRIPP_ENABLE_BACKEND_REPLY: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  extraServers.push(bridgeServer);

  await waitForServer(bridgeUrl);
  const status = await getJson("/api/tripp/backend/status", bridgeUrl);
  const created = await postJson("/api/tripp/sessions", {}, bridgeUrl);
  const reply = await postJson(
    "/api/tripp/reply",
    { prompt: "backend contract smoke", mode: "CHAT", sessionId: created.session.id },
    bridgeUrl,
  );
  const bootstrap = await getJson("/api/tripp/bootstrap", bridgeUrl);
  const taskSnapshot = await getJson("/api/tripp/tasks", bridgeUrl);
  const persisted = bootstrap.sessions.find((session) => session.id === created.session.id);
  const pass =
    status.reachable === true &&
    reply.status?.model === "tripp-adapter/backend" &&
    reply.messages?.some((message) => message.body === "bridge received: backend contract smoke") &&
    reply.tasks?.some((task) => task.origin === "backend" && task.agentId === "tripp.drone.one") &&
    taskSnapshot.tasks?.some((task) => task.origin === "backend" && task.agentId === "tripp.drone.one") &&
    persisted?.transcript?.some((message) => message.body === "bridge received: backend contract smoke");
  console.log(`${pass ? "PASS" : "FAIL"} backend bridge: health -> reply -> persisted transcript`);
  return pass;
}

async function waitForServer(url = baseUrl) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch(`${url}/api/tripp/bootstrap`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }

  throw new Error("Timed out waiting for verification server.");
}

async function postJson(path, body, url = baseUrl) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

async function getJson(path, url = baseUrl) {
  const response = await fetch(`${url}${path}`);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

function listen(serverToStart, serverPort) {
  return new Promise((resolve) => {
    serverToStart.listen(serverPort, "127.0.0.1", resolve);
  });
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readRequestJson(request) {
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
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
