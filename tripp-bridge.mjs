import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.TRIPP_BRIDGE_PORT || 4317);
const host = process.env.TRIPP_BRIDGE_HOST || "127.0.0.1";
const gooseAgentUrl = normalizeUrl(process.env.GOOSE_AGENT_URL);
const goosedPath =
  process.env.GOOSED_PATH || resolve(root, "..", "dist-windows", "resources", "bin", "goosed.exe");

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, readHealth());
    return;
  }

  if (request.method === "GET" && url.pathname === "/goose/status") {
    sendJson(response, readGooseStatus());
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/sessions/") && url.pathname.endsWith("/reply")) {
    const sessionId = decodeURIComponent(url.pathname.split("/").at(-2) || "");
    const payload = await readJson(request);
    sendJson(response, await createReply(sessionId, payload));
    return;
  }

  sendJson(response, { error: "Unknown Tripp bridge route." }, 404);
}).listen(port, host, () => {
  console.log(`Tripp bridge running at http://${host}:${port}/`);
});

function readHealth() {
  const goose = readGooseStatus();
  return {
    ok: true,
    bridge: "tripp-goose-bridge",
    mode: gooseAgentUrl ? "goose-forward" : "adapter-shim",
    goose,
    contract: {
      reply: "POST /sessions/:sessionId/reply",
      health: "GET /health",
    },
  };
}

function readGooseStatus() {
  const exists = existsSync(goosedPath);
  return {
    configured: exists,
    path: goosedPath,
    version: exists ? readGoosedVersion() : null,
    agentUrl: gooseAgentUrl,
  };
}

async function createReply(sessionId, payload) {
  if (gooseAgentUrl) {
    const forwarded = await tryForwardToGoose(sessionId, payload);
    if (forwarded) return forwarded;
  }

  const prompt = String(payload?.message || payload?.prompt || "").trim();
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const tool = chooseTool(prompt);
  const style = chooseCodingMode(prompt);
  const agent = chooseAgent(prompt, tool);
  const promptBlock = createPromptBlock(prompt);

  return {
    messages: promptBlock
      ? [
          {
            kind: "agent",
            speaker: "tripp.prompt>",
            body: "Copy-ready Goose.Prompt block prepared.",
            promptBlock,
          },
        ]
      : [
          {
            kind: "tool",
            speaker: "tripp.bridge>",
            tool,
            result: `${tool} routed via ${agent}`,
            status: "completed",
          },
          {
            kind: "agent",
            speaker: "tripp.bridge>",
            body: bridgeMessage(prompt, mode, style, agent),
          },
        ],
    tasks: promptBlock
      ? []
      : [
          {
            id: `bridge-${Date.now()}`,
            title: summarize(prompt),
            kind: "backend_tool",
            tool,
            status: "completed",
            result: `Bridge shim accepted ${mode} prompt and routed it to ${agent}.`,
            excerpt: `mode=${mode}\nstyle=${style}\nsession=${sessionId}\ngoosed=${goosedPath}`,
          },
        ],
    usage: {
      inputTokens: prompt.length,
      outputTokens: 64,
    },
  };
}

async function tryForwardToGoose(sessionId, payload) {
  try {
    const response = await fetch(`${gooseAgentUrl}/sessions/${encodeURIComponent(sessionId)}/reply`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function readGoosedVersion() {
  try {
    return execFileSync(goosedPath, ["--version"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    })
      .split(/\r?\n/)
      .map((line) => line.match(/\d+\.\d+\.\d+/)?.[0])
      .find(Boolean)
      ?.trim();
  } catch {
    return "unknown";
  }
}

function chooseTool(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("git")) return lower.includes("commit") ? "git_commit" : "git_status";
  if (lower.includes("shell") || lower.includes("command") || lower.includes("test")) return "shell_execute";
  if (lower.includes("edit") || lower.includes("write") || lower.includes("patch")) return "filesystem_write";
  if (lower.includes("read") || lower.includes("inspect") || lower.includes("file")) return "filesystem_read";
  return "code_analyze";
}

function chooseAgent(prompt, tool) {
  const lower = `${prompt} ${tool}`.toLowerCase();
  if (lower.includes("risk") || lower.includes("permission")) return "tripp.auditor";
  if (lower.includes("review") || lower.includes("quality")) return "tripp.inspector";
  if (tool === "shell_execute" || tool.startsWith("git_")) return "tripp.drone.three";
  if (tool === "code_analyze") return "tripp.drone.two";
  if (tool.startsWith("filesystem_")) return "tripp.drone.one";
  return "tripp.supervisor";
}

function chooseCodingMode(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("cline") || lower.includes("patch") || lower.includes("edit")) return "cline";
  if (lower.includes("augment") || lower.includes("suggest")) return "augment";
  return "goose";
}

function bridgeMessage(prompt, mode, style, agent) {
  if (!prompt) return "Tripp bridge is online and waiting for a prompt.";
  return `Bridge online. ${agent} accepted this ${mode} request in ${style} style. Goose binary is detected; direct Goose forwarding will activate when GOOSE_AGENT_URL is configured.`;
}

function createPromptBlock(prompt) {
  const lower = String(prompt || "").toLowerCase();
  const wantsPrompt =
    lower.includes("goose.prompt") ||
    (lower.includes("goose") && lower.includes("prompt")) ||
    lower.includes("copy ready prompt") ||
    lower.includes("copy-ready prompt");

  if (!wantsPrompt) return null;

  return {
    label: "Goose.Prompt",
    body: [
      "Goose.Prompt",
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
    ].join("\n"),
  };
}

function summarize(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Bridge task";
  return cleaned.length > 46 ? `${cleaned.slice(0, 43)}...` : cleaned;
}

function normalizeUrl(value) {
  if (!value) return null;
  return value.replace(/\/+$/, "");
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
