import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "127.0.0.1";

const bootstrapFile = join(root, "tripp-terminal-data.json");

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
    sendJson(response, createReply(payload));
    return;
  }

  sendJson(response, { error: "Unknown Tripp API route." }, 404);
}

function readBootstrap() {
  return {
    ...JSON.parse(readFileSync(bootstrapFile, "utf8")),
    runtime: {
      mode: process.env.TRIPP_RUNTIME || "mock",
      bridge: "tripp-adapter",
      backend: process.env.TRIPP_BACKEND_URL || null,
    },
  };
}

function createReply(payload) {
  const prompt = String(payload?.prompt || "").trim();
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const tool = chooseTool(prompt);

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
    messages:
      mode === "AUTO"
        ? [
            {
              kind: "tool",
              speaker: "tripp.auto>",
              tool,
              result: "mock bridge queued for supervised execution",
            },
            {
              kind: "agent",
              speaker: "tripp.supervisor>",
              body:
                "I can route that through the supervised coding lane. The next backend chunk will replace this mock bridge with live harness session calls.",
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

function chooseTool(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("git")) return "git_status";
  if (lower.includes("file") || lower.includes("read")) return "filesystem_read";
  if (lower.includes("write") || lower.includes("edit")) return "filesystem_write";
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
