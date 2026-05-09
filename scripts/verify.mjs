import { spawn } from "node:child_process";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
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

  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  server.kill();
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch(`${baseUrl}/api/tripp/bootstrap`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }

  throw new Error("Timed out waiting for verification server.");
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
