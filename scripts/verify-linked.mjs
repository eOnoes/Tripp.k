import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appPort = 4397;
const bridgePort = 4398;
const runtimeDir = mkdtempSync(join(tmpdir(), "tripp-linked-verify-"));
const appUrl = `http://127.0.0.1:${appPort}`;
const bridgeUrl = `http://127.0.0.1:${bridgePort}`;

const bridge = spawn(process.execPath, ["tripp-bridge.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, TRIPP_BRIDGE_PORT: String(bridgePort) },
  stdio: ["ignore", "pipe", "pipe"],
});

const app = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(appPort),
    TRIPP_RUNTIME_DIR: runtimeDir,
    TRIPP_BACKEND_URL: bridgeUrl,
    TRIPP_ENABLE_BACKEND_REPLY: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitFor(`${bridgeUrl}/health`);
  await waitFor(`${appUrl}/api/tripp/bootstrap`);

  const bridgeHealth = await getJson(`${bridgeUrl}/health`);
  const appHealth = await getJson(`${appUrl}/api/tripp/health`);
  const session = await postJson(`${appUrl}/api/tripp/sessions`, {});
  const reply = await postJson(`${appUrl}/api/tripp/reply`, {
    prompt: "cline style inspect server.mjs through the bridge",
    mode: "AUTO",
    sessionId: session.session.id,
  });

  const checks = [
    ["bridge health", bridgeHealth.ok === true && bridgeHealth.goose?.configured === true],
    ["app backend ready", appHealth.backend?.configured === true],
    ["backend reply", reply.status?.model === "tripp-adapter/backend"],
    ["bridge task", reply.tasks?.some((task) => task.origin === "backend")],
    ["session persisted", reply.session?.transcript?.some((message) => message.speaker === "tripp.bridge>")],
  ];

  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"} linked ${name}`);
  }

  if (checks.some(([, pass]) => !pass)) {
    process.exitCode = 1;
  }
} finally {
  bridge.kill();
  app.kill();
  rmSync(runtimeDir, { recursive: true, force: true });
}

async function waitFor(url) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
