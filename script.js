(async function bootTrippTerminal() {
  const runtime = createTrippRuntime();
  const data = await runtime.bootstrap();
  const now = () =>
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

  const elements = {
    app: document.querySelector(".terminal-app"),
    form: document.querySelector("#terminalForm"),
    command: document.querySelector("#command"),
    inputPrompt: document.querySelector("#inputPrompt"),
    messageRoot: document.querySelector("#messageRoot"),
    feed: document.querySelector(".terminal-feed"),
    modeButtons: [...document.querySelectorAll(".mode")],
    railButtons: [...document.querySelectorAll(".command-rail button")],
    collapse: document.querySelector(".collapse"),
    toolRoot: document.querySelector("#toolRoot"),
    toolCount: document.querySelector("#toolCount"),
    taskRoot: document.querySelector("#taskRoot"),
    taskCount: document.querySelector("#taskCount"),
    sessionRoot: document.querySelector("#sessionRoot"),
    newSession: document.querySelector(".new-session"),
    newSessionIcon: document.querySelector(".new-session-icon"),
    statusRoot: document.querySelector("#statusRoot"),
    footerConnection: document.querySelector("#footerConnection"),
    footerMode: document.querySelector("#footerMode"),
    footerMetrics: document.querySelector("#footerMetrics"),
  };

  const state = {
    mode: data.status.mode || "CHAT",
    activeRail: "terminal",
    collapsed: false,
    tools: data.tools.map((tool, index) => ({ ...tool, id: `tool-${index}`, expanded: false })),
    tasks: data.tasks || [],
    sessions: data.sessions.map((session, index) => ({
      ...session,
      id: `session-${index}`,
      messages: Number(session.messages) || 0,
      transcript: index === 0 ? normalizeMessages(data.messages) : seedSession(session, now()),
    })),
    status: { ...data.status },
    runtime: data.runtime || { mode: "static", bridge: "json-fallback" },
    busy: false,
  };

  if (!state.sessions.some((session) => session.active)) {
    state.sessions[0].active = true;
  }

  bindEvents();
  render();

  function bindEvents() {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    elements.railButtons.forEach((button) => {
      button.addEventListener("click", () => setRail(button.dataset.rail));
    });

    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCommand();
    });

    elements.newSession.addEventListener("click", createSession);
    elements.newSessionIcon.addEventListener("click", createSession);

    elements.collapse.addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      renderShell();
    });
  }

  function render() {
    renderShell();
    renderModes();
    renderRail();
    renderMessages();
    renderTools();
    renderTasks();
    renderSessions();
    renderStatus();
  }

  function renderShell() {
    elements.app.classList.toggle("ops-collapsed", state.collapsed);
    elements.collapse.textContent = state.collapsed ? "»" : "«";
    elements.collapse.title = state.collapsed ? "Show ops panel" : "Hide ops panel";
  }

  function renderModes() {
    elements.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
    elements.inputPrompt.textContent = `${state.mode.toLowerCase()}>`;
  }

  function renderRail() {
    elements.railButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.rail === state.activeRail);
    });
  }

  function renderMessages() {
    const session = activeSession();

    if (!session.transcript.length) {
      elements.messageRoot.innerHTML = `
        <div class="empty-state">
          <div>&gt;</div>
          <strong>Tripp. Terminal</strong>
          <span>Agent harness standby</span>
          <i></i>
          <small>Type a command to begin...</small>
        </div>
      `;
      return;
    }

    elements.messageRoot.innerHTML = session.transcript
      .map(
        (message) => `
          <article class="terminal-message ${escapeHtml(message.kind || "agent")}">
            <div class="prompt-line">
              <span class="rail-cursor"></span>
              <strong>${escapeHtml(message.speaker)}</strong>
              <time>${escapeHtml(message.time)}</time>
            </div>
            ${renderMessageBody(message)}
          </article>
        `,
      )
      .join("");

    elements.feed.scrollTop = elements.feed.scrollHeight;
  }

  function renderMessageBody(message) {
    if (message.kind === "tool") {
      return `
        <div class="tool-card">
          <span>${escapeHtml(message.tool)}</span>
          <strong>${escapeHtml(message.result)}</strong>
        </div>
      `;
    }

    return `<p>${escapeHtml(message.body)}</p>`;
  }

  function renderTools() {
    elements.toolCount.textContent = `(${state.tools.length})`;
    elements.toolRoot.innerHTML = state.tools
      .map(
        (tool) => `
          <li class="${tool.expanded ? "expanded" : ""}">
            <button type="button" data-tool="${escapeHtml(tool.id)}">
              <span>+ ${escapeHtml(tool.name)}</span>
              <i class="${tool.enabled ? "online" : ""}"></i>
            </button>
            <p>${escapeHtml(tool.description)}</p>
          </li>
        `,
      )
      .join("");

    elements.toolRoot.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        const tool = state.tools.find((candidate) => candidate.id === button.dataset.tool);
        tool.expanded = !tool.expanded;
        renderTools();
      });
    });
  }

  function renderTasks() {
    elements.taskCount.textContent = `(${state.tasks.length})`;

    if (!state.tasks.length) {
      elements.taskRoot.innerHTML = `<div class="empty-tasks">No supervised tasks.</div>`;
      return;
    }

    elements.taskRoot.innerHTML = state.tasks
      .map(
        (task) => `
          <article class="task ${escapeHtml(task.status)} ${task.expanded ? "expanded" : ""}">
            <header data-task-toggle="${escapeHtml(task.id)}">
              <strong>${escapeHtml(task.title)}</strong>
              <span>${escapeHtml(task.status)}</span>
            </header>
            <p>${escapeHtml(task.tool)}</p>
            ${
              task.expanded
                ? `<section class="task-detail">
                    <dl>
                      <div><dt>ID</dt><dd>${escapeHtml(task.id)}</dd></div>
                      <div><dt>SESSION</dt><dd>${escapeHtml(task.sessionId || "none")}</dd></div>
                      <div><dt>PROMPT</dt><dd>${escapeHtml(task.prompt || "")}</dd></div>
                    </dl>
                    ${task.patch ? `<pre>${escapeHtml(task.patch)}</pre>` : ""}
                  </section>`
                : ""
            }
            ${
              task.status === "pending"
                ? `<div>
                    <button type="button" data-task-action="approve" data-task="${escapeHtml(task.id)}">Approve</button>
                    <button type="button" data-task-action="dismiss" data-task="${escapeHtml(task.id)}">Dismiss</button>
                  </div>`
                : task.status === "patch_ready"
                  ? `<div>
                      <button type="button" data-task-action="apply" data-task="${escapeHtml(task.id)}">Apply</button>
                      <button type="button" data-task-action="dismiss" data-task="${escapeHtml(task.id)}">Dismiss</button>
                    </div>
                    <small>${escapeHtml(task.result || "Patch preview ready.")}</small>`
                : `<small>${escapeHtml(task.result || "Task state updated.")}</small>`
            }
          </article>
        `,
      )
      .join("");

    elements.taskRoot.querySelectorAll("[data-task-toggle]").forEach((header) => {
      header.addEventListener("click", () => {
        const task = state.tasks.find((candidate) => candidate.id === header.dataset.taskToggle);
        task.expanded = !task.expanded;
        renderTasks();
      });
    });

    elements.taskRoot.querySelectorAll("[data-task-action]").forEach((button) => {
      button.addEventListener("click", () => updateTask(button.dataset.task, button.dataset.taskAction));
    });
  }

  function renderSessions() {
    elements.sessionRoot.innerHTML = state.sessions
      .map(
        (session) => `
          <button class="session ${session.active ? "active" : ""}" type="button" data-session="${escapeHtml(
            session.id,
          )}">
            <strong>${escapeHtml(session.title)}</strong>
            <span><em>${escapeHtml(session.age)}</em><b>${session.messages} msgs</b></span>
          </button>
        `,
      )
      .join("");

    elements.sessionRoot.querySelectorAll("[data-session]").forEach((button) => {
      button.addEventListener("click", () => {
        state.sessions.forEach((session) => {
          session.active = session.id === button.dataset.session;
        });
        renderSessions();
        renderMessages();
      });
    });
  }

  function renderStatus() {
    const rows = [
      ["CONNECTION", `<i></i>${escapeHtml(state.status.connection)}`],
      ["MODEL", escapeHtml(state.status.model)],
      ["TOKENS IN", escapeHtml(state.status.tokensIn)],
      ["TOKENS OUT", escapeHtml(state.status.tokensOut)],
      ["LATENCY", escapeHtml(state.status.latency)],
      ["MODE", `<span class="badge">${escapeHtml(state.mode)}</span>`],
    ];

    elements.statusRoot.innerHTML = rows
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");

    elements.footerConnection.textContent = state.status.connection;
    elements.footerMode.textContent = `TRIPPMODE::${state.mode}`;
    elements.footerMetrics.innerHTML = `TOKENS: ${escapeHtml(totalTokens())}&nbsp;&nbsp; ${escapeHtml(
      state.status.latency,
    )}&nbsp;&nbsp; ${escapeHtml(state.status.version)}`;
  }

  function setMode(mode) {
    if (!mode || state.mode === mode) return;
    state.mode = mode;
    pushMessage({
      kind: "system",
      speaker: "system>",
      time: now(),
      body: `Mode switched to TRIPPMODE::${mode}. ${
        mode === "AUTO"
          ? "Tool cards will surface when a task looks executable."
          : "Conversation stays relaxed unless you ask for action."
      }`,
    });
    renderModes();
    renderStatus();
    renderMessages();
  }

  function setRail(rail) {
    state.activeRail = rail;
    renderRail();

    if (rail === "send") {
      elements.command.focus();
      return;
    }

    if (rail === "tools") {
      state.tools[0].expanded = true;
      renderTools();
    }

    pushMessage({
      kind: "system",
      speaker: "rail>",
      time: now(),
      body: railMessage(rail),
    });
    renderMessages();
  }

  async function submitCommand() {
    const value = elements.command.value.trim();
    if (!value || state.busy) return;

    elements.command.value = "";
    pushMessage({ kind: "user", speaker: "you>", time: now(), body: value });
    setBusy(true);
    renderMessages();

    const reply = await runtime.reply({
      prompt: value,
      mode: state.mode,
      sessionId: activeSession().id,
    });

    reply.messages.forEach((message) => {
      pushMessage({ ...message, time: now() });
    });

    if (reply.task) {
      upsertTask(reply.task);
    }

    updateCounters(reply.status, value);
    setBusy(false);
    renderSessions();
    renderTasks();
    renderStatus();
    renderMessages();
  }

  async function updateTask(taskId, action) {
    const result = await runtime.taskAction(taskId, action);
    if (result.task) {
      upsertTask(result.task);
      pushMessage({
        kind: "system",
        speaker: "task>",
        time: now(),
        body: taskMessage(result.task),
      });
      renderTasks();
      renderMessages();
    }
  }

  function taskMessage(task) {
    if (task.status === "patch_ready") {
      return `${task.id} patch preview ready. Review the task card before applying.`;
    }

    if (task.status === "apply_blocked") {
      return `${task.id} apply blocked. Filesystem mutation is still gated.`;
    }

    return `${task.id} ${task.status}. ${task.result || ""}`.trim();
  }

  function upsertTask(task) {
    const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
    if (index === -1) {
      state.tasks.unshift(task);
      return;
    }

    state.tasks[index] = task;
  }

  function createSession() {
    const session = activeSession();
    session.title = "New Tripp session";
    session.age = "now";
    session.messages = 0;
    session.transcript = [];

    renderSessions();
    renderMessages();
  }

  function pushMessage(message) {
    const session = activeSession();
    session.transcript.push(message);
    session.messages = session.transcript.length;
  }

  function activeSession() {
    return state.sessions.find((session) => session.active) || state.sessions[0];
  }

  function normalizeMessages(messages) {
    return messages.map((message) => ({ kind: "agent", ...message }));
  }

  function seedSession(session, time) {
    return [
      {
        kind: "system",
        speaker: "session>",
        time,
        body: `${session.title} is available in history. Wire this to session events when the API bridge is active.`,
      },
    ];
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.command.disabled = busy;
    elements.form.classList.toggle("busy", busy);
  }

  function updateCounters(replyStatus, prompt) {
    const inputDelta = Number(replyStatus?.tokensIn || prompt.length || 0);
    const outputDelta = Number(replyStatus?.tokensOut || 0);
    const inTokens = Number(String(state.status.tokensIn).replaceAll(",", "")) + inputDelta;
    const outTokens = Number(String(state.status.tokensOut).replaceAll(",", "")) + outputDelta;
    state.status.tokensIn = inTokens.toLocaleString("en-US");
    state.status.tokensOut = outTokens.toLocaleString("en-US");
    state.status.latency = replyStatus?.latency || `${420 + Math.floor(Math.random() * 180)}ms`;
    state.status.model = replyStatus?.model || state.status.model;
  }

  function totalTokens() {
    const input = Number(String(state.status.tokensIn).replaceAll(",", ""));
    const output = Number(String(state.status.tokensOut).replaceAll(",", ""));
    return (input + output).toLocaleString("en-US");
  }

  function railMessage(rail) {
    const messages = {
      terminal: "Terminal focus restored.",
      tools: "Tool registry is active on the ops panel.",
      sessions: "Session history lives in the right panel, keeping the narrow Tripp rail untouched.",
      swarm: "Swarm tree placeholder ready: Tripp -> tripp.supervisor -> specialist agents.",
      tripp: "Tripp is the face of the swarm. Supervisor and agent routing comes next.",
      settings: "Settings will map to config, provider, and permission routes once the bridge is live.",
    };

    return messages[rail] || "Rail command acknowledged.";
  }
})();

function createTrippRuntime() {
  return {
    async bootstrap() {
      try {
        return await fetchJson("./api/tripp/bootstrap");
      } catch (apiError) {
        console.warn("Tripp API bootstrap unavailable; using static JSON fallback.", apiError);
        return loadStaticData();
      }
    },

    async reply(payload) {
      try {
        return await fetchJson("./api/tripp/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (apiError) {
        console.warn("Tripp API reply unavailable; using local mock fallback.", apiError);
        return createLocalReply(payload);
      }
    },

    async taskAction(taskId, action) {
      try {
        return await fetchJson(`./api/tripp/tasks/${encodeURIComponent(taskId)}/${encodeURIComponent(action)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch (apiError) {
        console.warn("Tripp task action unavailable; using local task fallback.", apiError);
        return {
          task: {
            id: taskId,
            title: "Local fallback task",
            tool: "local",
            status: action === "approve" ? "approved" : "dismissed",
            result: "Updated locally because the task API was unavailable.",
          },
        };
      }
    },
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadStaticData() {
  try {
    return await fetch("./tripp-terminal-data.json").then((response) => response.json());
  } catch (error) {
    console.warn("Tripp terminal data fetch unavailable; using embedded fallback data.", error);
    return {
      messages: [
        {
          speaker: "tripp>",
          time: "10:59",
          body:
            "Welcome to Tripp. Terminal. I am the Tripp AI Agent, ready to assist you. Type a command or question to begin.",
        },
      ],
      tools: [
        { name: "filesystem_read", enabled: true, description: "Read files from the active workspace." },
        { name: "filesystem_write", enabled: true, description: "Write scoped changes into approved workspace paths." },
        { name: "filesystem_list", enabled: true, description: "List directories and inspect project structure." },
        { name: "shell_execute", enabled: true, description: "Run bounded shell commands with permission awareness." },
        { name: "web_search", enabled: true, description: "Search current web sources when freshness matters." },
        { name: "web_fetch", enabled: true, description: "Open and read specific URLs." },
        { name: "code_analyze", enabled: true, description: "Inspect code paths and summarize architecture." },
        { name: "code_format", enabled: true, description: "Apply formatting to supported source files." },
        { name: "git_status", enabled: true, description: "Review repository state before edits." },
        { name: "git_commit", enabled: true, description: "Create scoped commits when explicitly approved." },
        { name: "memory_store", enabled: true, description: "Persist selected project context." },
        { name: "memory_retrieve", enabled: true, description: "Retrieve stored context for continuity." },
      ],
      sessions: [
        { title: "Implement auth middleware", age: "2h ago", messages: 24, active: true },
        { title: "Database schema review", age: "5h ago", messages: 18 },
        { title: "API endpoint design", age: "Yesterday", messages: 31 },
        { title: "React component refactor", age: "Yesterday", messages: 15 },
        { title: "Docker container setup", age: "2 days ago", messages: 12 },
        { title: "CI/CD pipeline config", age: "3 days ago", messages: 27 },
      ],
      status: {
        connection: "CONNECTED",
        model: "gpt-4",
        tokensIn: "1,240",
        tokensOut: "3,891",
        latency: "679ms",
        mode: "CHAT",
        version: "v1.0.0",
      },
      tasks: [],
    };
  }
}

function createLocalReply(payload) {
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const prompt = String(payload?.prompt || "");
  const task =
    mode === "AUTO"
      ? {
          id: `local-task-${Date.now()}`,
          title: prompt.length > 46 ? `${prompt.slice(0, 43)}...` : prompt || "Untitled task",
          prompt,
          tool: chooseTool(prompt),
          sessionId: payload?.sessionId || null,
          status: "pending",
          result: "",
        }
      : null;

  return {
    status: {
      model: "tripp-adapter/local",
      latency: `${420 + Math.floor(Math.random() * 180)}ms`,
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
              tool: task.tool,
              result: `${task.id} pending approval`,
            },
            {
              kind: "agent",
              speaker: "tripp.supervisor>",
              body: "The local fallback caught that prompt. Backend wiring can swap in without changing this UI path.",
            },
          ]
        : [
            {
              kind: "agent",
              speaker: "tripp>",
              body: "Prompt received through the local fallback. The adapter path is ready for live backend wiring.",
            },
          ],
  };
}

function chooseTool(value) {
  const lower = value.toLowerCase();
  if (lower.includes("git")) return "git_status";
  if (lower.includes("write") || lower.includes("edit")) return "filesystem_write";
  if (lower.includes("file") || lower.includes("read")) return "filesystem_read";
  if (lower.includes("web") || lower.includes("search")) return "web_search";
  return "code_analyze";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
