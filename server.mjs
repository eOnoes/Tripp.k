import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const backendUrl = normalizeBackendUrl(process.env.TRIPP_BACKEND_URL);
const backendSecret = process.env.TRIPP_BACKEND_SECRET || process.env.GOOSE_SERVER__SECRET_KEY || "";
const backendReplyEnabled = process.env.TRIPP_ENABLE_BACKEND_REPLY === "true";
const backendHealthPath = process.env.TRIPP_BACKEND_HEALTH_PATH || "/health";
const taskQueue = loadTaskQueue();
const sessionStore = loadSessionStore();

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

  if (request.method === "GET" && url.pathname === "/api/tripp/coding-modes") {
    sendJson(response, readCodingModes());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/backend/status") {
    sendJson(response, await readBackendStatus());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tripp/swarm") {
    sendJson(response, readSwarmManifest());
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
      capabilities: health.capabilities,
    },
    tasks: taskQueue,
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
    },
    contract: backendContract(),
  };
}

function readPermissionPolicy() {
  return {
    version: "0.1.0",
    defaultDecision: "gated",
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
  if (backendUrl && backendReplyEnabled) {
    const backendReply = await tryCreateBackendReply(payload);
    if (backendReply) return backendReply;
  }

  const prompt = String(payload?.prompt || "").trim();
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const tool = chooseTool(prompt);
  const kind = chooseTaskKind(prompt, tool);
  const task = mode === "AUTO" ? createTask({ prompt, tool, kind, sessionId: payload?.sessionId }) : null;

  const messages =
    mode === "AUTO"
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

function createTask({ prompt, tool, kind, sessionId }) {
  const target = detectTargetFile(prompt) || detectKnownEditTarget(prompt, kind);
  const routeInfo = routePrompt(prompt, tool, kind);
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
    trace: createSwarmTrace(routeInfo, tool),
    createdAt: new Date().toISOString(),
  };

  if (kind === "inspect") {
    task.excerpt = createFileExcerpt(target);
    task.result = target
      ? `Read-only excerpt prepared from ${target.relative}. No acknowledgement required.`
      : "Inspection blocked. No approved repo-local target file was detected.";
    task.permission = permissionDecision(tool, target ? "allow" : "gated", "repo-local read-only inspection");
  }

  if (kind === "git" && tool === "git_status") {
    task.excerpt = createGitStatusExcerpt();
    task.result = "Safe git status snapshot captured. No repository mutation was performed.";
    task.permission = permissionDecision(tool, "allow", "git status is read-only");
  }

  if (kind === "git" && tool !== "git_status") {
    task.result = "Mutating git actions are gated until the command approval bridge is implemented.";
    task.permission = permissionDecision(tool, "blocked", "mutating git actions are not executable in this prototype");
  }

  if (kind === "shell") {
    const shell = createShellSnapshot(prompt);
    task.status = shell.ok ? "completed" : "gated";
    task.excerpt = shell.output;
    task.result = shell.message;
    task.permission = permissionDecision(tool, shell.ok ? "allow" : "gated", shell.reason);
  }

  if (kind === "analysis") {
    const analysis = createAnalysisSnapshot(target);
    task.status = analysis.ok ? "completed" : "gated";
    task.excerpt = analysis.excerpt;
    task.findings = analysis.findings;
    task.result = analysis.message;
    task.permission = permissionDecision(tool, analysis.ok ? "allow" : "gated", analysis.reason);
  }

  if (kind === "edit") {
    task.permission = permissionDecision(tool, "gated", "filesystem writes require patch preview and guarded apply");
    task.patchPlan = createPatchPlan(task);
  }

  task.codingMode = chooseCodingMode(prompt, kind, tool);

  taskQueue.unshift(task);
  saveTaskQueue();
  return task;
}

function supervisorMessage(task) {
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

function updateTask(taskId, action) {
  const task = taskQueue.find((candidate) => candidate.id === taskId);
  if (!task) {
    return { error: "Task not found." };
  }

  if (action === "approve") {
    if (task.kind === "inspect") {
      task.status = "inspected";
      task.result = "Inspection acknowledged. No file mutation was performed.";
      return { task };
    }

    task.status = "patch_ready";
    task.patchPlan ||= createPatchPlan(task);
    task.patch = createPatchPreview(task);
    task.result = task.patchPlan
      ? "Patch preview prepared. Apply will run the guarded scoped patch."
      : "No guarded patch is available for this task yet.";
    saveTaskQueue();
    return { task };
  }

  if (action === "apply") {
    const applied = applyTaskPatch(task);
    task.status = applied.ok ? "applied" : "apply_blocked";
    task.result = applied.message;
    saveTaskQueue();
    return { task };
  }

  if (action === "dismiss") {
    task.status = "dismissed";
    task.result = "Dismissed by operator.";
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

function saveTaskQueue() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(taskStoreFile, `${JSON.stringify({ tasks: taskQueue.slice(0, 50) }, null, 2)}\n`, "utf8");
}

function saveSessionStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(sessionStoreFile, `${JSON.stringify({ sessions: sessionStore.sessions.slice(0, 50) }, null, 2)}\n`, "utf8");
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
  return [`--- a/${plan.file}`, `+++ b/${plan.file}`, "@@", `-${plan.expected}`, `+${plan.replacement}`].join("\n");
}

function createPatchPlan(task) {
  if (task.tool !== "filesystem_write") return null;

  const lower = String(task.prompt || "").toLowerCase();
  if (lower.includes("welcome message")) {
    return {
      file: "tripp-terminal-data.json",
      operation: "replace",
      expected:
        '      "body": "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin."',
      replacement:
        '      "body": "Tripp.g is online. The supervised harness is ready for chat, AUTO tasks, and operator-approved edits."',
    };
  }

  if (lower.includes("readme") && lower.includes("runtime")) {
    return {
      file: "README.md",
      operation: "append-once",
      expected: "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.",
      replacement:
        "The UI displays friendly runtime names while the adapter keeps raw backend identifiers internally.\nScoped patch tasks use preview-first plans with exact file guards.",
    };
  }

  return null;
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
    return { ok: false, message: "Apply blocked. Task must be patch_ready first." };
  }

  if (task.tool !== "filesystem_write") {
    return { ok: false, message: "Apply blocked. Only filesystem_write tasks can mutate files." };
  }

  if (task.patch !== createPatchPreview(task)) {
    return { ok: false, message: "Apply blocked. Patch preview does not match the approved guarded patch." };
  }

  const plan = task.patchPlan || createPatchPlan(task);
  if (!plan) {
    return { ok: false, message: "Apply blocked. No guarded patch plan is available for this task." };
  }

  const target = resolve(root, plan.file);
  if (!target.startsWith(root + sep) || !["tripp-terminal-data.json", "README.md"].includes(plan.file)) {
    return { ok: false, message: "Apply blocked. Target file is outside the approved workspace guard." };
  }

  const current = readFileSync(target, "utf8");
  if (current.includes(plan.replacement)) {
    return { ok: true, message: `Patch already applied to ${plan.file}.` };
  }

  if (!current.includes(plan.expected)) {
    return { ok: false, message: "Apply blocked. File content changed since patch preview was prepared." };
  }

  const updated = current.replace(plan.expected, plan.replacement);
  writeFileSync(target, updated, "utf8");
  return { ok: true, message: `Applied guarded patch to ${plan.file}.` };
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
  return {
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
    trace: createSwarmTrace(routeInfo, tool),
    codingMode: chooseCodingMode(prompt, value.kind || "backend", tool),
    createdAt: new Date().toISOString(),
  };
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
