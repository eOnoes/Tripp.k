import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "127.0.0.1";

const bootstrapFile = join(root, "tripp-terminal-data.json");
const backendUrl = normalizeBackendUrl(process.env.TRIPP_BACKEND_URL);
const backendSecret = process.env.TRIPP_BACKEND_SECRET || process.env.GOOSE_SERVER__SECRET_KEY || "";
const backendReplyEnabled = process.env.TRIPP_ENABLE_BACKEND_REPLY === "true";
const taskQueue = [];

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

  if (request.method === "POST" && url.pathname === "/api/tripp/reply") {
    const payload = await readJson(request);
    sendJson(response, await createReply(payload));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/tasks") {
    sendJson(response, { tasks: taskQueue });
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

  return {
    ...bootstrap,
    status: {
      ...bootstrap.status,
      connection: backendUrl ? "BRIDGE READY" : bootstrap.status.connection,
      model: backendUrl ? "tripp-adapter/backend" : bootstrap.status.model,
    },
    runtime: {
      mode: backendUrl ? "backend-ready" : process.env.TRIPP_RUNTIME || "mock",
      bridge: "tripp-adapter",
      backend: backendUrl,
      backendReplyEnabled,
    },
    tasks: taskQueue,
  };
}

async function createReply(payload) {
  if (backendUrl && backendReplyEnabled) {
    const backendReply = await tryCreateBackendReply(payload);
    if (backendReply) return backendReply;
  }

  const prompt = String(payload?.prompt || "").trim();
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const tool = chooseTool(prompt);
  const task = mode === "AUTO" ? createTask({ prompt, tool, sessionId: payload?.sessionId }) : null;

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
    messages:
      mode === "AUTO"
        ? [
            {
              kind: "tool",
              speaker: "tripp.auto>",
              tool,
              result: `task ${task.id} pending approval`,
            },
            {
              kind: "agent",
              speaker: "tripp.supervisor>",
              body:
                "I staged that as a supervised task. Review it in TASKS before anything writes or executes.",
            },
          ]
        : [
            {
              kind: "agent",
              speaker: "tripp>",
              body:
                "I have the prompt. Chat mode stays conversational for now; switch to AUTO when you want tool-backed coding behavior.",
            },
          ],
  };
}

function createTask({ prompt, tool, sessionId }) {
  const task = {
    id: `task-${Date.now()}`,
    title: summarizeTask(prompt),
    prompt,
    tool,
    sessionId: sessionId || null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  taskQueue.unshift(task);
  return task;
}

function updateTask(taskId, action) {
  const task = taskQueue.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { error: "Task not found." };
  }

  if (action === "approve") {
    task.status = "patch_ready";
    task.patch = createPatchPreview(task);
    task.result = "Patch preview prepared. Real execution remains disabled until the filesystem bridge is implemented.";
    return { task };
  }

  if (action === "apply") {
    const applied = applyTaskPatch(task);
    task.status = applied.ok ? "applied" : "apply_blocked";
    task.result = applied.message;
    return { task };
  }

  if (action === "dismiss") {
    task.status = "dismissed";
    task.result = "Dismissed by operator.";
    return { task };
  }

  return { error: "Unknown task action.", task };
}

function summarizeTask(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled task";
  return cleaned.length > 46 ? `${cleaned.slice(0, 43)}...` : cleaned;
}

function createPatchPreview(task) {
  if (task.tool !== "filesystem_write") {
    return `# ${task.tool}\n\nNo file mutation preview is available for this tool yet.`;
  }

  return [
    "--- a/tripp-terminal-data.json",
    "+++ b/tripp-terminal-data.json",
    "@@",
    '-      "body": "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin."',
    '+      "body": "Tripp.g is online. The supervised harness is ready for chat, AUTO tasks, and operator-approved edits."',
  ].join("\n");
}

function applyTaskPatch(task) {
  if (task.status !== "patch_ready") {
    return { ok: false, message: "Apply blocked. Task must be patch_ready first." };
  }

  if (task.tool !== "filesystem_write") {
    return { ok: false, message: "Apply blocked. Only filesystem_write tasks can mutate files." };
  }

  if (task.patch !== createPatchPreview(task)) {
    return { ok: false, message: "Apply blocked. Patch preview does not match the approved guarded patch." };
  }

  const target = resolve(root, "tripp-terminal-data.json");
  if (target !== bootstrapFile || !target.startsWith(root + sep)) {
    return { ok: false, message: "Apply blocked. Target file is outside the approved workspace guard." };
  }

  const data = JSON.parse(readFileSync(target, "utf8"));
  const current = data?.messages?.[0]?.body;
  const expected = "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin.";
  const next = "Tripp.g is online. The supervised harness is ready for chat, AUTO tasks, and operator-approved edits.";

  if (current === next) {
    return { ok: true, message: "Patch already applied to tripp-terminal-data.json." };
  }

  if (current !== expected) {
    return { ok: false, message: "Apply blocked. File content changed since patch preview was prepared." };
  }

  const updated = readFileSync(target, "utf8").replace(JSON.stringify(expected), JSON.stringify(next));
  writeFileSync(target, updated, "utf8");
  return { ok: true, message: "Applied guarded patch to tripp-terminal-data.json." };
}

async function tryCreateBackendReply(payload) {
  const sessionId = String(payload?.sessionId || "");
  if (!sessionId || sessionId.startsWith("session-")) {
    return null;
  }

  const started = Date.now();
  const backendResponse = await backendFetch(`/sessions/${encodeURIComponent(sessionId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ message: payload.prompt, mode: payload.mode }),
  });

  if (!backendResponse.ok) {
    return null;
  }

  return {
    id: `backend-reply-${Date.now()}`,
    mode: String(payload?.mode || "CHAT").toUpperCase(),
    status: {
      connection: "CONNECTED",
      model: "tripp-adapter/backend",
      latency: `${Date.now() - started}ms`,
      tokensIn: String(payload?.prompt || "").length,
      tokensOut: 0,
    },
    messages: [
      {
        kind: "agent",
        speaker: "tripp>",
        body: mapBackendReply(await backendResponse.json()),
      },
    ],
  };
}

function mapBackendReply(value) {
  if (typeof value === "string") return value;
  if (value?.message) return String(value.message);
  if (value?.content) return String(value.content);
  return "Backend reply received. Event streaming mapper is the next integration step.";
}

async function backendFetch(path, options = {}) {
  if (!backendUrl) {
    return { ok: false };
  }

  try {
    return await fetch(`${backendUrl}${path}`, {
      ...options,
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
  if (lower.includes("git")) return "git_status";
  if (lower.includes("write") || lower.includes("edit")) return "filesystem_write";
  if (lower.includes("file") || lower.includes("read")) return "filesystem_read";
  if (lower.includes("web") || lower.includes("search")) return "web_search";
  return "code_analyze";
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
