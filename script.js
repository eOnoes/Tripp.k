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
    returnChat: document.querySelector(".return-chat"),
    modeButtons: [...document.querySelectorAll(".mode")],
    railButtons: [...document.querySelectorAll(".command-rail button")],
    opsTabs: [...document.querySelectorAll(".ops-tab")],
    collapse: document.querySelector(".collapse"),
    toolRoot: document.querySelector("#toolRoot"),
    toolCount: document.querySelector("#toolCount"),
    taskRoot: document.querySelector("#taskRoot"),
    taskCount: document.querySelector("#taskCount"),
    workspaceRoot: document.querySelector("#workspaceRoot"),
    filePreview: document.querySelector("#filePreview"),
    workspaceRefresh: document.querySelector(".workspace-refresh"),
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
    opsExpanded: false,
    opsTab: "workspace",
    panelFocus: "tasks",
    tools: data.tools.map((tool, index) => ({ ...tool, id: `tool-${index}`, expanded: false })),
    toolGroups: { online: false, offline: false },
    tasks: data.tasks || [],
    snapTasksToTop: false,
    sessions: data.sessions.map((session, index) => ({
      ...session,
      id: session.id || `session-${index}`,
      messages: Number(session.messages) || Number(session.transcript?.length) || 0,
      transcript:
        "transcript" in session
          ? normalizeMessages(session.transcript)
          : index === 0
            ? normalizeMessages(data.messages)
            : seedSession(session, now()),
    })),
    status: { ...data.status },
    runtime: data.runtime || { mode: "static", bridge: "json-fallback" },
    munch: data.munch || null,
    swarm: data.swarm || { agents: [] },
    workspace: { tree: [], selectedFile: null, file: null, loading: false, error: "" },
    busy: false,
    followChat: true,
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

    elements.opsTabs.forEach((button) => {
      button.addEventListener("click", () => {
        state.opsTab = button.dataset.opsTab;
        state.opsExpanded = true;
        renderShell();
      });
    });

    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCommand();
    });

    elements.newSession.addEventListener("click", createSession);
    elements.newSessionIcon.addEventListener("click", createSession);
    elements.workspaceRefresh.addEventListener("click", () => loadWorkspaceTree({ force: true }));
    elements.returnChat.addEventListener("click", scrollToCurrentChat);
    elements.feed.addEventListener("scroll", updateChatFollowState);
    elements.messageRoot.addEventListener("click", handleMessageClick);

    elements.collapse.addEventListener("click", () => {
      state.opsExpanded = !state.opsExpanded;
      renderShell();
    });
  }

  function render() {
    renderShell();
    renderModes();
    renderRail();
    renderMessages();
    renderTools();
    renderWorkspace();
    renderTasks();
    renderSessions();
    renderStatus();
  }

  function renderShell() {
    elements.app.classList.toggle("ops-expanded", state.opsExpanded);
    elements.app.dataset.panelFocus = state.panelFocus;
    elements.app.dataset.opsTab = state.opsTab;
    elements.opsTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.opsTab === state.opsTab);
    });
    elements.collapse.textContent = state.opsExpanded ? "»" : "«";
    elements.collapse.title = state.opsExpanded ? "Shrink workspace panel" : "Expand workspace panel";

    if (state.opsExpanded && state.opsTab === "workspace" && !state.workspace.tree.length && !state.workspace.loading) {
      loadWorkspaceTree();
    }
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
    const wasFollowing = state.followChat || isFeedNearBottom();
    const previousBottomOffset = elements.feed.scrollHeight - elements.feed.scrollTop;

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
      updateReturnChatButton();
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

    if (wasFollowing) {
      scrollToCurrentChat({ silent: true });
    } else {
      elements.feed.scrollTop = Math.max(0, elements.feed.scrollHeight - previousBottomOffset);
      updateReturnChatButton();
    }
  }

  function renderMessageBody(message) {
    if (message.promptBlock) {
      return renderPromptBlock(message.promptBlock);
    }

    if (message.kind === "tool") {
      return `
        <div class="tool-card">
          <span>${escapeHtml(message.tool)}</span>
          <strong>${escapeHtml(message.result)}</strong>
        </div>
      `;
    }

    return renderRichText(message.body);
  }

  function renderRichText(body = "") {
    const text = String(body || "");
    const fencePattern = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let cursor = 0;
    let match;
    const parts = [];

    while ((match = fencePattern.exec(text))) {
      const before = text.slice(cursor, match.index).trim();
      if (before) parts.push(`<p>${escapeHtml(before)}</p>`);
      parts.push(renderPromptBlock({ label: match[1] || "text", body: match[2].trim() }));
      cursor = fencePattern.lastIndex;
    }

    const after = text.slice(cursor).trim();
    if (after) parts.push(`<p>${escapeHtml(after)}</p>`);
    return parts.length ? parts.join("") : `<p>${escapeHtml(text)}</p>`;
  }

  function renderPromptBlock(block) {
    const label = typeof block === "string" ? "Prompt" : block.label || block.title || "Prompt";
    const body = typeof block === "string" ? block : block.body || block.text || "";
    return `
      <div class="prompt-block">
        <header>
          <strong>${escapeHtml(label)}</strong>
          <button type="button" data-copy-block title="Copy prompt block">COPY</button>
        </header>
        <pre>${escapeHtml(body)}</pre>
      </div>
    `;
  }

  async function handleMessageClick(event) {
    const button = event.target.closest("[data-copy-block]");
    if (!button) return;
    const value = button.closest(".prompt-block")?.querySelector("pre")?.innerText || "";

    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "COPIED";
      setTimeout(() => {
        button.textContent = "COPY";
      }, 1200);
    } catch {
      elements.command.value = value;
      elements.command.focus();
    }
  }

  function isFeedNearBottom() {
    return elements.feed.scrollHeight - elements.feed.scrollTop - elements.feed.clientHeight < 80;
  }

  function updateChatFollowState() {
    state.followChat = isFeedNearBottom();
    updateReturnChatButton();
  }

  function updateReturnChatButton() {
    elements.returnChat.classList.toggle("hidden", state.followChat || isFeedNearBottom());
  }

  function scrollToCurrentChat(options = {}) {
    elements.feed.scrollTop = elements.feed.scrollHeight;
    state.followChat = true;
    if (!options.silent) elements.command.focus();
    updateReturnChatButton();
  }

  function renderTools() {
    const online = state.tools.filter((tool) => tool.enabled);
    const offline = state.tools.filter((tool) => !tool.enabled);
    elements.toolCount.textContent = `(${online.length})`;
    elements.toolRoot.innerHTML = [renderToolGroup("online", online, true), renderToolGroup("offline", offline, false)].join("");

    elements.toolRoot.querySelectorAll("[data-tool-group]").forEach((button) => {
      button.addEventListener("click", () => {
        state.toolGroups[button.dataset.toolGroup] = !state.toolGroups[button.dataset.toolGroup];
        focusPanel(Object.values(state.toolGroups).some(Boolean) ? "tools" : "tasks");
        renderTools();
      });
    });
  }

  function renderToolGroup(group, tools, enabled) {
    const expanded = state.toolGroups[group];
    const light = enabled ? "online" : "offline";
    const label = enabled ? `${tools.length} tools online` : `${tools.length} tools offline`;

    return `
      <li class="tool-group ${expanded ? "expanded" : ""}">
        <button type="button" data-tool-group="${group}">
          <span>${expanded ? "-" : "+"} ${escapeHtml(label)}</span>
          <i class="${light}"></i>
        </button>
        ${
          expanded
            ? `<p>${tools.length ? tools.map((tool) => escapeHtml(tool.name)).join(" / ") : "No tools in this state."}</p>`
            : ""
        }
      </li>
    `;
  }

  function renderTasks() {
    elements.taskCount.textContent = `(${state.tasks.length})`;

    if (!state.tasks.length) {
      elements.taskRoot.innerHTML = `<div class="empty-tasks">No supervised tasks.</div>`;
      elements.taskRoot.scrollTop = 0;
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
                      <div><dt>KIND</dt><dd>${escapeHtml(task.kind || "task")}</dd></div>
                      <div><dt>SOURCE</dt><dd>${escapeHtml(task.origin || "local")}</dd></div>
                      <div><dt>AGENT</dt><dd>${escapeHtml(task.agentId || "tripp.supervisor")}</dd></div>
                      <div><dt>LANE</dt><dd>${escapeHtml(task.routingDecision?.lane || "native")}</dd></div>
                      <div><dt>ROUTE</dt><dd>${escapeHtml(task.routingDecision?.reason || "native task flow")}</dd></div>
                      <div><dt>RETRIEVE</dt><dd>${escapeHtml(task.routingDecision?.retrievalKind || "none")}</dd></div>
                      <div><dt>CONF</dt><dd>${escapeHtml(task.routingDecision?.confidenceRequired || "medium")}</dd></div>
                      <div><dt>PERMIT</dt><dd>${escapeHtml(task.permission?.decision || "unknown")}</dd></div>
                      <div><dt>STYLE</dt><dd>${escapeHtml(task.codingMode || "goose")}</dd></div>
                      <div><dt>SESSION</dt><dd>${escapeHtml(task.sessionId || "none")}</dd></div>
                      <div><dt>TARGET</dt><dd>${escapeHtml(task.target || "none")}</dd></div>
                      <div><dt>PATCH</dt><dd>${escapeHtml(task.patchPlan?.file || "none")}</dd></div>
                      <div><dt>PROMPT</dt><dd>${escapeHtml(task.prompt || "")}</dd></div>
                    </dl>
                    ${renderEvidenceGate(task.evidenceGate)}
                    ${renderTraceMap(task.traceMap)}
                    ${task.excerpt ? `<pre>${escapeHtml(task.excerpt)}</pre>` : ""}
                    ${task.findings ? `<pre>${escapeHtml(task.findings)}</pre>` : ""}
                    ${renderRetrieval(task.retrieval)}
                    ${renderTrace(task.trace)}
                    ${task.permission?.reason ? `<pre>${escapeHtml(task.permission.reason)}</pre>` : ""}
                    ${task.patch ? `<pre>${escapeHtml(task.patch)}</pre>` : ""}
                  </section>`
                : ""
            }
            ${
              task.status === "pending" && task.origin !== "backend"
                ? `<div>
                    <button type="button" data-task-action="approve" data-task="${escapeHtml(task.id)}">Approve</button>
                    <button type="button" data-task-action="dismiss" data-task="${escapeHtml(task.id)}">Dismiss</button>
                  </div>`
                : task.status === "patch_ready" && task.origin !== "backend"
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
        focusPanel("tasks");
        renderTasks();
      });
    });

    elements.taskRoot.querySelectorAll("[data-task-action]").forEach((button) => {
      button.addEventListener("click", () => updateTask(button.dataset.task, button.dataset.taskAction));
    });

    if (state.snapTasksToTop) {
      elements.taskRoot.scrollTop = 0;
      state.snapTasksToTop = false;
    }
  }

  function renderWorkspace() {
    if (!state.workspace.tree.length && !state.workspace.loading && !state.workspace.error) {
      elements.workspaceRoot.innerHTML = `<div class="workspace-empty">Workspace tree not loaded.</div>`;
    } else if (state.workspace.loading) {
      elements.workspaceRoot.innerHTML = `<div class="workspace-empty">Reading workspace...</div>`;
    } else if (state.workspace.error) {
      elements.workspaceRoot.innerHTML = `<div class="workspace-empty">${escapeHtml(state.workspace.error)}</div>`;
    } else {
      elements.workspaceRoot.innerHTML = renderWorkspaceNodes(state.workspace.tree);
    }

    elements.workspaceRoot.querySelectorAll("[data-workspace-file]").forEach((button) => {
      button.addEventListener("click", () => loadWorkspaceFile(button.dataset.workspaceFile));
    });

    renderFilePreview();
  }

  function renderWorkspaceNodes(nodes) {
    return `
      <ol class="workspace-tree">
        ${nodes
          .map((node) => {
            if (node.type === "directory") {
              return `
                <li class="workspace-dir">
                  <span>⌁ ${escapeHtml(node.name)}</span>
                  ${renderWorkspaceNodes(node.children || [])}
                </li>
              `;
            }

            return `
              <li>
                <button class="${state.workspace.selectedFile === node.path ? "active" : ""}" type="button" data-workspace-file="${escapeHtml(
                  node.path,
                )}">
                  <span>▧ ${escapeHtml(node.name)}</span>
                  <small>${escapeHtml(node.language || "text")}</small>
                </button>
              </li>
            `;
          })
          .join("")}
      </ol>
    `;
  }

  function renderFilePreview() {
    const file = state.workspace.file;
    if (!file) {
      elements.filePreview.innerHTML = `
        <header>
          <strong>No file selected</strong>
          <span>readonly</span>
        </header>
        <pre>Select a workspace file to inspect it here.</pre>
      `;
      return;
    }

    if (file.error) {
      elements.filePreview.innerHTML = `
        <header>
          <strong>${escapeHtml(state.workspace.selectedFile || "Workspace file")}</strong>
          <span>error</span>
        </header>
        <pre>${escapeHtml(file.error)}</pre>
      `;
      return;
    }

    elements.filePreview.innerHTML = `
      <header>
        <strong>${escapeHtml(file.path)}</strong>
        <span>${escapeHtml(file.language)} · ${formatBytes(file.size)}</span>
      </header>
      <pre>${escapeHtml(file.content)}</pre>
    `;
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
        runtime.selectSession(button.dataset.session).catch((apiError) => {
          console.warn("Tripp session select unavailable; keeping local selection.", apiError);
        });
      });
    });
  }

  function renderStatus() {
    const rows = [
      ["CONNECTION", `<i></i>${escapeHtml(state.status.connection)}`],
      ["RUNTIME", escapeHtml(displayRuntime(state.status.model))],
      ["MUNCH", escapeHtml(displayMunchStatus(state.munch))],
      ["SESSIONS", escapeHtml(displayCapability(state.runtime.capabilities?.sessions))],
      ["SWARM", `${escapeHtml(state.swarm.agents?.length || 0)} agents`],
      ["SHELL", escapeHtml(displayCapability(state.runtime.capabilities?.shell))],
      ["WRITE", escapeHtml(displayCapability(state.runtime.capabilities?.filesystemWrite))],
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

  function renderTrace(trace) {
    if (!Array.isArray(trace) || !trace.length) return "";

    return `
      <ol class="task-trace">
        ${trace
          .map(
            (event) => `
              <li>
                <strong>${escapeHtml(event.actor || "tripp.supervisor")}</strong>
                <span>${escapeHtml(event.event || "trace")}</span>
                <small>${escapeHtml(event.detail || "")}</small>
              </li>
            `,
          )
          .join("")}
      </ol>
    `;
  }

  function renderRetrieval(retrieval) {
    if (!retrieval) return "";

    return `
      <section class="retrieval-detail">
        <strong>${escapeHtml(retrieval.backend || "munch")} · ${escapeHtml(retrieval.confidence || "low")}</strong>
        <p>${escapeHtml((retrieval.summary || []).join(" "))}</p>
        <small>${escapeHtml((retrieval.fallback_chain || []).join(" -> "))}</small>
      </section>
    `;
  }

  function renderEvidenceGate(gate) {
    if (!gate) return "";

    return `
      <section class="evidence-gate ${escapeHtml(gate.status || "blocked")}">
        <header>
          <strong>Evidence Gate</strong>
          <span>${escapeHtml(gate.status || "blocked")}</span>
        </header>
        <p>${escapeHtml(gate.summary || "")}</p>
        <dl>
          <div><dt>OK</dt><dd>${escapeHtml((gate.satisfied || []).join(" / ") || "none")}</dd></div>
          <div><dt>MISS</dt><dd>${escapeHtml((gate.missing || []).join(" / ") || "none")}</dd></div>
          <div><dt>NEXT</dt><dd>${escapeHtml((gate.next || []).join(" / ") || "none")}</dd></div>
        </dl>
      </section>
    `;
  }

  function renderTraceMap(traceMap) {
    if (!traceMap) return "";

    const verification = traceMap.traceVerification || {};
    const checks = verification.checks || {};
    const owners = traceMap.owners || [];
    const rollbackFiles = traceMap.rollback_surface?.files || [];
    const tests = traceMap.rollback_surface?.tests || traceMap.tests || [];
    const warnings = uniqueStrings([...(traceMap.warnings || []), ...(verification.warnings || [])]);
    const blockers = verification.blocking || [];
    const auditorNote =
      checks.docsOnly && isTraceEditIntent(traceMap.task)
        ? "Docs-only owner surface blocks edit approval."
        : checks.docsOnly
          ? "Docs-only surface is acceptable for retrieval, not edits."
          : "Implementation owner surface is present.";

    return `
      <section class="trace-map-detail ${escapeHtml(verification.terminalState || "TRACE_UNRESOLVED")}">
        <header>
          <strong>TraceDroneMap</strong>
          <span>${escapeHtml(verification.terminalState || "TRACE_UNRESOLVED")}</span>
        </header>
        <div class="trace-map-badges">
          <b>${escapeHtml(traceMap.confidenceLabel || "none")} · ${escapeHtml(traceMap.confidence || 0)}</b>
          <b>${escapeHtml(traceMap.rollback_surface?.scope || "unresolved")}</b>
          <b>${escapeHtml(traceMap.trace?.traceId || traceMap.traceId || "trace")}</b>
        </div>
        <dl>
          <div><dt>SRC</dt><dd>${escapeHtml(traceMap.trace?.source || "trace-drone")}</dd></div>
          <div><dt>AUDIT</dt><dd>${escapeHtml(auditorNote)}</dd></div>
          <div><dt>CHECK</dt><dd>${escapeHtml(renderTraceChecks(checks))}</dd></div>
        </dl>
        ${renderTraceOwners(owners)}
        ${renderTraceList("Rollback", rollbackFiles)}
        ${renderTraceList("Tests", tests)}
        ${renderTraceList("Warnings", warnings)}
        ${renderTraceList("Blocking", blockers)}
      </section>
    `;
  }

  function renderTraceOwners(owners) {
    if (!owners.length) return renderTraceList("Owners", []);

    return `
      <div class="trace-owner-list">
        <strong>Owners</strong>
        ${owners
          .map(
            (owner) => `
              <article>
                <span>${escapeHtml(owner.file)}</span>
                <small>${escapeHtml(owner.role || "unknown")} · ${escapeHtml(owner.confidence || 0)}</small>
                <em>${escapeHtml(owner.reason || "")}</em>
                <i>${escapeHtml((owner.signals || []).join(" / ") || "no signals")}</i>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderTraceList(label, values) {
    const items = Array.isArray(values) ? values : [];
    return `
      <div class="trace-list">
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(items.length ? items.join(" / ") : "none")}</p>
      </div>
    `;
  }

  function renderTraceChecks(checks) {
    if (!checks) return "none";
    return [
      `owners:${checks.ownerCount ?? 0}`,
      `tests:${checks.testsPresent ? "yes" : "no"}`,
      `docs:${checks.docsOnly ? "only" : "mixed"}`,
      `forbidden:${checks.forbiddenHit ? "hit" : "clear"}`,
      `broad:${checks.broadSurface ? "yes" : "no"}`,
    ].join(" / ");
  }

  function isTraceEditIntent(task) {
    return /\b(edit|modify|patch|write|change|fix|implement|refactor|delete|remove|create|add)\b/.test(String(task || ""));
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).filter(Boolean))];
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
      state.opsExpanded = true;
      state.opsTab = "tools";
      state.tools[0].expanded = true;
      renderShell();
      renderTools();
    }

    if (rail === "tripp" || rail === "settings") {
      state.opsExpanded = true;
      state.opsTab = "status";
      renderShell();
    }

    if (rail === "sessions") {
      state.opsExpanded = true;
      renderShell();
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
    state.followChat = true;
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

    if (Array.isArray(reply.tasks)) {
      reply.tasks.forEach((task) => upsertTask(task));
    } else if (reply.task) {
      upsertTask(reply.task);
    }

    if (reply.session) {
      upsertSession(reply.session);
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

    if (task.status === "applied") {
      return `${task.id} applied. ${task.result || ""}`.trim();
    }

    if (task.status === "inspection_ready") {
      return `${task.id} inspection ready. Expand the task card to review the excerpt.`;
    }

    if (task.status === "inspected") {
      return `${task.id} inspection acknowledged.`;
    }

    return `${task.id} ${task.status}. ${task.result || ""}`.trim();
  }

  function upsertTask(task) {
    const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
    if (index === -1) {
      state.tasks.unshift(task);
      state.snapTasksToTop = true;
      focusPanel("tasks");
      return;
    }

    state.tasks[index] = task;
  }

  function focusPanel(panel) {
    state.panelFocus = panel;

    if (panel === "tasks") {
      state.toolGroups.online = false;
      state.toolGroups.offline = false;
    }

    renderShell();
  }

  async function createSession() {
    const session = await runtime.createSession();
    upsertSession(session);
    renderSessions();
    renderMessages();
  }

  async function loadWorkspaceTree(options = {}) {
    if (state.workspace.loading) return;
    if (state.workspace.tree.length && !options.force) return;

    state.workspace.loading = true;
    state.workspace.error = "";
    renderWorkspace();

    try {
      const result = await runtime.workspaceTree();
      state.workspace.tree = result.files || result.children || [];
      state.workspace.error = result.error || "";
    } catch (error) {
      state.workspace.error = "Workspace API unavailable.";
      console.warn("Tripp workspace tree unavailable.", error);
    } finally {
      state.workspace.loading = false;
      renderWorkspace();
    }
  }

  async function loadWorkspaceFile(path) {
    if (!path) return;
    state.workspace.selectedFile = path;
    state.workspace.file = { path, language: "text", size: 0, content: "Reading file..." };
    renderWorkspace();

    try {
      state.workspace.file = await runtime.workspaceFile(path);
    } catch (error) {
      state.workspace.file = { path, error: "Workspace file API unavailable." };
      console.warn("Tripp workspace file unavailable.", error);
    }

    renderWorkspace();
  }

  function pushMessage(message) {
    const session = activeSession();
    session.transcript.push(message);
    session.messages = session.transcript.length;
  }

  function activeSession() {
    return state.sessions.find((session) => session.active) || state.sessions[0];
  }

  function upsertSession(session) {
    const nextSession = {
      ...session,
      transcript: Array.isArray(session.transcript) ? normalizeMessages(session.transcript) : [],
      messages: Number(session.messages) || Number(session.transcript?.length) || 0,
      active: true,
    };
    const index = state.sessions.findIndex((candidate) => candidate.id === session.id);

    state.sessions.forEach((candidate) => {
      candidate.active = false;
    });

    if (index === -1) {
      state.sessions.unshift(nextSession);
      return;
    }

    state.sessions.splice(index, 1);
    state.sessions.unshift(nextSession);
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

  function displayRuntime(model) {
    const value = String(model || "");
    if (value === "tripp-adapter/mock") return "Mock Runtime";
    if (value === "tripp-adapter/local") return "Local Fallback";
    if (value === "tripp-adapter/backend") return "Backend Bridge";
    if (value === "gpt-4") return "Seed Runtime";
    return value || "Unknown";
  }

  function displayCapability(value) {
    const labels = {
      "persistent-local": "Persistent Local",
      "repo-local-readonly": "Repo Read-only",
      "guarded-single-patch": "Guarded Patch",
      "read-only-allowlist": "Read-only Allowlist",
      "status-only": "Status Only",
      "mock-contract": "Mock Contract",
      disabled: "Disabled",
      enabled: "Enabled",
    };
    return labels[value] || value || "Unknown";
  }

  function displayMunchStatus(munch) {
    if (!munch) return "Not Loaded";
    return `${munch.status || "unknown"} / ${munch.mode || "unknown"}`;
  }

  function totalTokens() {
    const input = Number(String(state.status.tokensIn).replaceAll(",", ""));
    const output = Number(String(state.status.tokensOut).replaceAll(",", ""));
    return (input + output).toLocaleString("en-US");
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes}b`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}kb`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
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

    async createSession() {
      try {
        const result = await fetchJson("./api/tripp/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        return result.session;
      } catch (apiError) {
        console.warn("Tripp session create unavailable; using local session fallback.", apiError);
        return {
          id: `local-session-${Date.now()}`,
          title: "New Tripp session",
          age: "now",
          messages: 0,
          active: true,
          transcript: [],
        };
      }
    },

    async selectSession(sessionId) {
      return fetchJson(`./api/tripp/sessions/${encodeURIComponent(sessionId)}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },

    async workspaceTree() {
      return fetchJson("./api/tripp/workspace/tree");
    },

    async workspaceFile(path) {
      return fetchJson(`./api/tripp/workspace/file?path=${encodeURIComponent(path)}`);
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
      munch: {
        bridge_name: "TripCore.Munch.g",
        status: "unavailable",
        mode: "passive_assist",
        summary: ["Static fallback has no Munch bridge."],
        warnings: ["api unavailable"],
      },
      swarm: {
        version: "0.0.0",
        face: "tripp",
        supervisor: "tripp.supervisor",
        agents: [],
      },
      tasks: [],
    };
  }
}

function createLocalReply(payload) {
  const mode = String(payload?.mode || "CHAT").toUpperCase();
  const prompt = String(payload?.prompt || "");
  const promptBlock = createLocalPromptBlock(prompt);
  const task =
    !promptBlock && mode === "AUTO"
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

function createLocalPromptBlock(prompt) {
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
