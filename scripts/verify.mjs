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
    health.capabilities?.shell === "read-only-allowlist";
  console.log(`${healthPass ? "PASS" : "FAIL"} health: adapter capabilities`);
  if (!healthPass) {
    failures.push({ name: "health" });
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
    reply.tasks?.some((task) => task.origin === "backend" && task.tool === "filesystem_read") &&
    taskSnapshot.tasks?.some((task) => task.origin === "backend" && task.tool === "filesystem_read") &&
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
