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
    inputModel: document.querySelector("#inputModel"),
    compactContext: document.querySelector(".compact-context"),
    reviewChanges: document.querySelector("#reviewChanges"),
    reviewSummary: document.querySelector("#reviewSummary"),
    settingsForm: document.querySelector("#settingsForm"),
    autoCompactAt: document.querySelector("#autoCompactAt"),
    contextLimit: document.querySelector("#contextLimit"),
    compactPolicyState: document.querySelector("#compactPolicyState"),
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
    planningSummary: document.querySelector("#planningSummary"),
    runTrials: document.querySelector(".run-trials"),
    workspaceRoot: document.querySelector("#workspaceRoot"),
    filePreview: document.querySelector("#filePreview"),
    workspaceRefresh: document.querySelector(".workspace-refresh"),
    sessionRoot: document.querySelector("#sessionRoot"),
    newSession: document.querySelector(".new-session"),
    newSessionIcon: document.querySelector(".new-session-icon"),
    statusRoot: document.querySelector("#statusRoot"),
    cystRoot: document.querySelector("#cystRoot"),
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
    context: {
      limit: Number(data.settings?.compact?.contextLimit || data.status.contextLimit || 128000),
      autoCompactAt: Number(data.settings?.compact?.autoCompactAt || data.status.autoCompactAt || 96000),
      enabled: data.settings?.compact?.enabled !== false,
      lastCompactedAt: null,
    },
    runtime: data.runtime || { mode: "static", bridge: "json-fallback" },
    munch: data.munch || null,
    cystEvents: [],
    reviewChanges: data.reviewChanges || { hasChanges: false, changedFiles: 0, insertions: 0, deletions: 0, reviewableTasks: [] },
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
  loadCystEvents();
  loadReviewChanges();

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
    elements.runTrials.addEventListener("click", runReadOnlyTrials);
    elements.workspaceRefresh.addEventListener("click", () => loadWorkspaceTree({ force: true }));
    elements.returnChat.addEventListener("click", scrollToCurrentChat);
    elements.compactContext.addEventListener("click", compactCurrentChat);
    elements.reviewChanges.querySelector("button").addEventListener("click", openReviewChanges);
    elements.settingsForm.addEventListener("submit", saveCompactSettings);
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
    renderSettings();
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
    renderReviewChanges();

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
    const validation = block.validation || {};
    return `
      <div class="prompt-block">
        <header>
          <strong><span>PB</span>${escapeHtml(label)}</strong>
          <small>${escapeHtml(block.descriptorStatus || "proposed")} · ${escapeHtml(validation.status || "unvalidated")}</small>
          <button type="button" data-copy-block title="Copy prompt block">COPY</button>
        </header>
        <dl>
          <div><dt>TYPE</dt><dd>${escapeHtml(block.type || "prompt_block")}</dd></div>
          <div><dt>EXEC</dt><dd>${escapeHtml(block.executionAllowed === true ? "true" : "false")}</dd></div>
          <div><dt>ROOT</dt><dd>${escapeHtml(block.pinnedWorkspaceRoot || "unknown")}</dd></div>
          <div><dt>CTX</dt><dd>${escapeHtml(block.contextSnapshotId || "none")}</dd></div>
        </dl>
        ${
          validation.warnings?.length
            ? `<p class="prompt-block-warning">${escapeHtml(validation.warnings.join(" / "))}</p>`
            : ""
        }
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
    elements.planningSummary.innerHTML = renderPlanningSummary();

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
                    ${renderTaskConclusion(task)}
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
                      <div><dt>LIFE</dt><dd>${escapeHtml(task.lifecycle?.state || "unknown")} · ${escapeHtml(task.lifecycle?.descriptorStatus || "proposed")}</dd></div>
                      <div><dt>STYLE</dt><dd>${escapeHtml(task.codingMode || "goose")}</dd></div>
                      <div><dt>SESSION</dt><dd>${escapeHtml(task.sessionId || "none")}</dd></div>
                      <div><dt>TARGET</dt><dd>${escapeHtml(task.target || "none")}</dd></div>
                      <div><dt>PATCH</dt><dd>${escapeHtml(task.patchPlan?.file || "none")}</dd></div>
                      <div><dt>PATCH STATE</dt><dd>${escapeHtml(task.patchPlan?.approvalStatus || "not reviewed")}</dd></div>
                      <div><dt>PROMPT</dt><dd>${escapeHtml(task.prompt || "")}</dd></div>
                    </dl>
                    ${renderEvidenceGate(task.evidenceGate)}
                    ${renderTraceMap(task.traceMap)}
                    ${renderTrialEvidence(task.trials, task.goNoGo)}
                    ${renderAdapterEvidence(task.adapter)}
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
                    <button type="button" data-task-action="approve" data-task="${escapeHtml(task.id)}">Review patch</button>
                    <button type="button" data-task-action="dismiss" data-task="${escapeHtml(task.id)}">Dismiss</button>
                  </div>`
                : task.status === "patch_ready" && task.origin !== "backend"
                  ? `<div>
                      <button type="button" data-task-action="apply" data-task="${escapeHtml(task.id)}">Apply approved patch</button>
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

  function renderPlanningSummary() {
    const summary = buildPlanningSummary();
    const rows = [
      ["What we know", summary.known],
      ["What remains uncertain", summary.uncertain],
      ["Blocked in read-only mode", summary.blocked],
      ["Next read-only direction", summary.next],
    ];

    return `
      <section class="read-only-summary">
        <header>
          <strong>Current Understanding</strong>
          <span>${escapeHtml(summary.countLabel)}</span>
        </header>
        <dl>
          ${rows
            .map(
              ([label, value]) => `
                <div>
                  <dt>${escapeHtml(label)}</dt>
                  <dd>${renderPlanningSummaryValue(value)}</dd>
                </div>
              `,
            )
            .join("")}
        </dl>
      </section>
    `;
  }

  function renderPlanningSummaryValue(value) {
    if (Array.isArray(value)) {
      return `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }
    return escapeHtml(value);
  }

  function buildPlanningSummary() {
    const recentTasks = state.tasks.filter((task) => task.status !== "pending" && task.status !== "patch_ready").slice(0, 6);
    const inspected = uniqueList(
      recentTasks
        .filter((task) => task.kind === "inspect" || task.tool === "filesystem_read")
        .map((task) => task.target)
        .filter(Boolean),
    );
    const blocked = recentTasks.filter((task) => task.status === "gated" || task.status === "blocked" || task.adapter?.status === "blocked").length;
    const planningOnly = recentTasks.filter((task) => task.retrieval?.authorityLevel === "planning-only" || task.retrieval?.sourceKind === "mock").length;
    const gateTask = recentTasks.find((task) => task.goNoGo || Array.isArray(task.trials));
    const hasBranchRetrieval = recentTasks.some((task) => isGateBranchRetrieval(task));
    const hasBackendBranch = inspected.includes("server.mjs");
    const hasUiBranch = inspected.includes("script.js");
    const hasBranchReview = hasBranchRetrieval && hasBackendBranch && hasUiBranch;
    const conclusions = recentTasks.map(buildTaskConclusion).filter(Boolean);
    const known = uniqueList([
      hasBranchReview ? "Two plausible review paths emerged from planning-only retrieval." : null,
      hasBranchReview ? "Inspection of server.mjs provided stronger direct context for the current gate question." : null,
      hasBranchReview ? "Inspection of script.js added result-display context, but was less central to the current gate question." : null,
      ...inspected.slice(0, 3).map((file) => `${file} was inspected for read-only review.`),
      ...conclusions
      .flatMap((conclusion) => conclusion.findings || [])
      .filter((finding) => !/blocked|failed|non-authoritative/i.test(finding)),
    ].filter(Boolean)).slice(0, 4);
    const uncertain = [
      hasBranchReview ? "The initial branch suggestions came from planning-only retrieval and remain non-authoritative." : null,
      hasBranchReview ? "The current branch ranking reflects usefulness for review, not final certainty." : null,
      hasBranchReview ? "The UI branch improved presentation context, but additional review may still be needed to fully connect display behavior to gate results." : null,
      planningOnly ? "Mock or planning-only evidence remains non-authoritative for file changes." : null,
      inspected.length ? null : "No files have been inspected in the recent read-only thread.",
      gateTask?.goNoGo?.suiteStatus === "no_go" ? "Read-only gate blockers remain unresolved." : null,
    ].filter(Boolean);
    const blockedSummary = hasBranchReview && blocked
      ? ["A write-like shell or escalation path was blocked.", "No write-capable route was used."]
      : blocked
        ? `${blocked} read-only boundary preserved`
        : "No blocked read-only tasks";

    return {
      countLabel: recentTasks.length ? `${recentTasks.length} recent read-only tasks` : "No read-only tasks yet",
      known: known.length ? known : ["No read-only findings yet"],
      uncertain: uncertain.length ? uncertain : ["No uncertainty flagged in recent read-only tasks"],
      blocked: blockedSummary,
      next: hasBranchReview
        ? "Continue from the backend branch and inspect the next related source if more gate detail is needed."
        : gateTask?.goNoGo?.suiteStatus === "go"
        ? "Continue read-only planning and review."
        : blocked
          ? "Review blocked tasks or inspect related sources."
          : "Inspect, compare, narrow, or run the read-only gate.",
    };
  }

  function uniqueList(values) {
    return [...new Set(values)];
  }

  function isGateBranchRetrieval(task) {
    const prompt = `${task?.prompt || ""} ${task?.title || ""}`.toLowerCase();
    return Boolean(
      task?.retrieval &&
      prompt.includes("read-only gate") &&
      (prompt.includes("operator") || prompt.includes("shown") || prompt.includes("results")),
    );
  }

  function renderTaskConclusion(task) {
    const conclusion = buildTaskConclusion(task);
    if (!conclusion) return "";

    return `
      <section class="task-conclusion ${escapeHtml(conclusion.tone || "readonly")}">
        <header>
          <strong>What We Learned</strong>
          <span>${escapeHtml(conclusion.result)}</span>
        </header>
        <ul>
          ${conclusion.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}
        </ul>
        <p><b>Evidence</b> ${escapeHtml(conclusion.evidence)}</p>
        <p><b>Next safe step</b> ${escapeHtml(conclusion.nextStep)}</p>
      </section>
    `;
  }

  function buildTaskConclusion(task) {
    if (!task || task.status === "pending" || task.status === "patch_ready") return null;
    if (task.goNoGo || Array.isArray(task.trials)) return buildGateConclusion(task);
    if (task.retrieval) return buildRetrievalConclusion(task);
    if (task.kind === "inspect" || task.tool === "filesystem_read") return buildInspectConclusion(task);
    if (task.kind === "shell" || task.tool === "shell_execute") return buildShellConclusion(task);
    if (task.kind === "analysis" || task.tool === "code_analyze") return buildAnalysisConclusion(task);
    if (task.status === "gated" || task.status === "blocked") return buildBlockedConclusion(task);
    return null;
  }

  function buildGateConclusion(task) {
    const verdict = formatGateVerdict(task.goNoGo || {});
    return {
      tone: verdict === "GO" ? "ok" : "blocked",
      result: verdict,
      findings: [formatGateSummary(task.goNoGo || {}), formatGatePassCount(task.goNoGo || {})],
      evidence: "Formal read-only gate result",
      nextStep: verdict === "GO" ? "Continue read-only planning with the gate result in view." : "Review blocking reasons before continuing.",
    };
  }

  function buildRetrievalConclusion(task) {
    const sourceKind = task.retrieval?.sourceKind || task.retrieval?.evidenceAuthority || "mock";
    const authority = task.retrieval?.authorityLevel || "planning-only";
    if (isGateBranchRetrieval(task)) {
      return {
        tone: "planning",
        result: "Planning only",
        findings: [
          "Planning-only retrieval suggested backend/gate and UI/result-display review paths.",
          `${sourceKind === "mock" ? "Mock" : sourceKind} evidence is ${authority} and non-authoritative for file changes.`,
        ],
        evidence: sourceKind === "mock" ? "Mock evidence - planning only" : `${sourceKind} evidence - ${authority}`,
        nextStep: "Inspect related files or continue read-only narrowing.",
      };
    }
    return {
      tone: "planning",
      result: "Planning only",
      findings: [
        "Retrieval identified likely planning context.",
        `${sourceKind === "mock" ? "Mock" : sourceKind} evidence is ${authority} and non-authoritative for file changes.`,
      ],
      evidence: sourceKind === "mock" ? "Mock evidence - planning only" : `${sourceKind} evidence - ${authority}`,
      nextStep: "Inspect related files or continue read-only narrowing.",
    };
  }

  function buildInspectConclusion(task) {
    const target = task.target || "the requested file";
    const branchFinding = target === "server.mjs"
      ? "This branch provides stronger direct context for the current gate question."
      : target === "script.js"
        ? "This branch adds result-display context, but is less central to the current gate question."
        : task.excerpt
          ? "A read-only excerpt is available on this card."
          : "No file changes were made.";
    return {
      tone: "readonly",
      result: "Read-only inspection",
      findings: [
        `Inspected ${target} without mutation.`,
        branchFinding,
      ],
      evidence: "Read-only inspection",
      nextStep: "Inspect a related file or use the finding to continue planning.",
    };
  }

  function buildShellConclusion(task) {
    const invoked = task.adapter?.invoked === true;
    const blocked = task.status === "gated" || task.adapter?.status === "blocked" || task.adapter?.invoked === false;
    return {
      tone: blocked ? "blocked" : "readonly",
      result: blocked ? "Blocked" : "Safe shell",
      findings: blocked
        ? ["Shell request stayed blocked before mutation.", "Read-only mode remained intact."]
        : ["Allowed shell command completed through the adapter.", "The result supports read-only review."],
      evidence: invoked ? "Safe shell output" : "Read-only policy block",
      nextStep: blocked ? "Use an allowlisted read-only command or inspect a file instead." : "Use the output to continue read-only review.",
    };
  }

  function buildAnalysisConclusion(task) {
    return {
      tone: "readonly",
      result: "Read-only analysis",
      findings: ["Analysis completed from repo-local context.", "No mutation path was used."],
      evidence: "Read-only planning summary",
      nextStep: "Inspect supporting files or run the read-only gate if readiness needs proof.",
    };
  }

  function buildBlockedConclusion(task) {
    return {
      tone: "blocked",
      result: "Blocked",
      findings: ["The request stayed inside the read-only boundary.", task.permission?.reason || "Read-only policy kept the task gated."],
      evidence: "Read-only gate or permission block",
      nextStep: "Rephrase as inspection, retrieval, or safe-shell work.",
    };
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
    const latestCritical = latestCriticalCystEvent();
    const rows = [
      ["CONNECTION", `<i></i>${escapeHtml(state.status.connection)}`],
      ["RUNTIME", escapeHtml(displayRuntime(state.status.model))],
      ["MUNCH", escapeHtml(displayMunchStatus(state.munch))],
      ["CYST", escapeHtml(displayCystSummary())],
      ["LATEST", escapeHtml(formatCystLatest(latestCritical))],
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
    renderCystActivity();

    elements.footerConnection.textContent = state.status.connection;
    elements.footerMode.textContent = `TRIPPMODE::${state.mode}`;
    elements.footerMetrics.innerHTML = `TOKENS: ${escapeHtml(totalTokens())}&nbsp;&nbsp; ${escapeHtml(
      state.status.latency,
    )}&nbsp;&nbsp; ${escapeHtml(state.status.version)}`;
    renderInputTelemetry();
  }

  function renderInputTelemetry() {
    const used = contextTokens();
    const limit = state.context.limit;
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    elements.inputModel.textContent = `model: ${displayActiveModel(state.status.model)}`;
    elements.compactContext.textContent = `CTX ${formatCompactNumber(used)} / ${formatCompactNumber(limit)}`;
    elements.compactContext.classList.toggle("warn", state.context.enabled && used >= state.context.autoCompactAt);
    elements.compactContext.title = `Compact current chat context. Auto compact target: ${formatCompactNumber(
      state.context.autoCompactAt,
    )}. Current usage: ${pct}%.`;
  }

  function renderSettings() {
    elements.autoCompactAt.value = state.context.autoCompactAt;
    elements.contextLimit.value = state.context.limit;
    const used = contextTokens();
    elements.compactPolicyState.textContent =
      state.context.enabled && used >= state.context.autoCompactAt ? "threshold reached" : "armed";
  }

  function renderCystActivity() {
    const events = latestCystTimeline(state.cystEvents, 8);
    const rows = groupCystTimeline(events);
    if (!events.length) {
      elements.cystRoot.innerHTML = `<section><header><strong>CYST ACTIVITY</strong><span>empty</span></header><p>No audit events recorded.</p></section>`;
      return;
    }

    elements.cystRoot.innerHTML = `
      <section>
        <header>
          <strong>CYST ACTIVITY</strong>
          <span>${escapeHtml(`${events.length}/${state.cystEvents.length}`)}</span>
        </header>
        <ol>
          ${rows
            .map(
              ({ event, groupClass }) => `
                <li class="${escapeHtml(`${cystTone(event)} ${groupClass}`)}" title="Audit event - not an action item.">
                  <span>${escapeHtml(cystGlyph(event))}</span>
                  <div>
                    <strong>${escapeHtml(event.eventType || "event")}</strong>
                    <small>${escapeHtml(cystCompact(event))}</small>
                    ${renderCystEvidenceMeta(event)}
                    <em>${escapeHtml(event.cysToken || event.traceId || "no token")}</em>
                  </div>
                </li>
              `,
            )
            .join("")}
        </ol>
      </section>
    `;
  }

  function cystTone(event) {
    const status = String(event.resultStatus || event.status || "").toLowerCase();
    const error = String(event.errorCode || "").toLowerCase();
    if (status === "ok") return "ok";
    if (status === "blocked" || error.includes("blocked")) return "blocked";
    if (status === "denied" || event.eventType === "warden_denial") return "denied";
    if (status === "error" || error) return "error";
    return "warn";
  }

  function cystGlyph(event) {
    const tone = cystTone(event);
    if (tone === "ok") return "◆";
    if (tone === "blocked") return "!";
    if (tone === "denied" || tone === "error") return "x";
    return "?";
  }

  function cystCompact(event) {
    if (event.eventType === "gate_run") {
      return gateRunCompact(event);
    }

    if (event.eventType === "write_escalation_blocked") {
      return [writeBlockLabel(event), writeBlockCause(event), formatCystTime(event.timestamp)].filter(Boolean).join(" - ");
    }

    if (event.eventType === "retrieval_event") {
      return [
        event.sourceKind || event.evidenceAuthority || "evidence",
        event.authorityLevel || "authority unknown",
        event.decision || event.resultStatus || "recorded",
        formatCystTime(event.timestamp),
      ]
        .filter(Boolean)
        .join(" - ");
    }

    return [event.tool || event.adapter || event.descriptorId || "control-plane", event.resultStatus || event.errorCode || "recorded", formatCystTime(event.timestamp)]
      .filter(Boolean)
      .join(" - ");
  }

  function gateRunCompact(event) {
    const started = String(event.gateStage || event.status || "").toLowerCase() === "started";
    if (started) {
      return ["READ-ONLY GATE RUN", "Started formal read-only gate", formatCystTime(event.timestamp)].filter(Boolean).join(" - ");
    }

    const verdict = String(event.suiteStatus || event.goNoGo || "unknown").replace(/_/g, " ").toUpperCase();
    const count =
      Number.isFinite(Number(event.passedCount)) && Number.isFinite(Number(event.requiredScenarioCount))
        ? `${event.passedCount}/${event.requiredScenarioCount} required`
        : "";
    const blocking = Array.isArray(event.blockingReasons) && event.blockingReasons.length ? event.blockingReasons[0] : count;
    return [`READ-ONLY GATE: ${verdict}`, blocking, formatCystTime(event.timestamp)].filter(Boolean).join(" - ");
  }

  function renderCystEvidenceMeta(event) {
    if (!["retrieval_event", "write_escalation_blocked"].includes(event.eventType)) return "";
    const flags = [
      event.degraded ? "DEGRADED" : null,
      event.blockLayer ? `${String(event.blockLayer).toUpperCase()} BLOCK` : null,
      event.writeApprovalEligible === false ? "WRITE BLOCKED" : "WRITE ELIGIBLE",
      event.applyEligible === false ? "APPLY BLOCKED" : "APPLY ELIGIBLE",
    ].filter(Boolean);
    const reason =
      event.eventType === "write_escalation_blocked"
        ? writeBlockCause(event)
        : event.reason || event.operatorWarning || "Retrieval audit event.";
    const details = event.eventType === "write_escalation_blocked" ? writeBlockDetails(event) : [];

    return `
      <p class="cyst-evidence-meta">
        <b>${escapeHtml(flags.join(" / "))}</b>
        <span>${escapeHtml(reason)}</span>
        ${details.length ? `<i>${escapeHtml(details.join(" / "))}</i>` : ""}
      </p>
    `;
  }

  function writeBlockLabel(event) {
    return String(event.escalationTarget || "").includes("apply") ? "APPLY BLOCKED" : "WRITE BLOCKED";
  }

  function writeBlockCause(event) {
    const code = String(event.reasonCode || event.errorCode || "").toLowerCase();
    if (code.includes("mock")) return "Mock evidence cannot authorize edits";
    if (code.includes("planning_only")) return "Planning-only evidence";
    if (code.includes("degraded")) return "Degraded evidence not sufficient";
    if (code.includes("approval_missing")) return "Approval missing";
    if (code.includes("approval_stale")) return "Approval stale";
    if (code.includes("approval_dismissed")) return "Approval dismissed";
    if (code.includes("warden") && String(event.escalationTarget || "").includes("apply")) return "Warden denied apply path";
    if (code.includes("warden")) return "Warden denied escalation";
    if (code.includes("adapter") && code.includes("not_invoked")) return "Adapter not invoked";
    if (code.includes("adapter")) return "Adapter blocked write path";
    if (code.includes("apply_ineligible")) return "Apply is not eligible";
    if (code.includes("target_not_apply_ready")) return "Target is not apply-ready";
    return String(event.escalationTarget || "").includes("apply") ? "Apply progression blocked" : "Write progression blocked";
  }

  function writeBlockDetails(event) {
    const always = [
      event.blockLayer ? `layer:${event.blockLayer}` : null,
      event.escalationTarget ? `target:${event.escalationTarget}` : null,
    ];
    const family = writeBlockFamilyDetails(event);
    const invoked = event.invoked === false ? ["invoked:false"] : [];

    return [...always, ...family, ...invoked].filter(Boolean);
  }

  function writeBlockFamilyDetails(event) {
    const layer = String(event.blockLayer || "").toLowerCase();
    const target = String(event.escalationTarget || "").toLowerCase();
    const code = String(event.reasonCode || event.errorCode || "").toLowerCase();

    if (layer === "evidence") {
      return [
        event.sourceKind ? `source:${event.sourceKind}` : null,
        !event.sourceKind && event.authorityLevel ? `authority:${event.authorityLevel}` : null,
      ];
    }

    if (layer === "approval_state" || code.includes("approval_")) {
      return [event.approvalState ? `approval:${event.approvalState}` : null];
    }

    if (layer === "warden") {
      return [event.wardenDecision ? `warden:${event.wardenDecision}` : null];
    }

    if (layer === "adapter") {
      return [event.adapterDecision ? `adapter:${event.adapterDecision}` : null];
    }

    if (target.includes("apply") || code.includes("apply_") || code.includes("target_not_apply_ready")) {
      return [
        event.approvalState ? `approval:${event.approvalState}` : null,
      ];
    }

    return [];
  }

  function displayCystSummary() {
    if (!state.cystEvents.length) return "No Events";
    const critical = state.cystEvents.filter((event) => isCriticalCystEvent(event)).length;
    return `${state.cystEvents.length} events / ${critical} critical`;
  }

  function formatCystLatest(event) {
    if (!event) return "No Critical";
    return `${event.eventType || "event"} ${event.errorCode || event.resultStatus || ""}`.trim();
  }

  function isCriticalCystEvent(event) {
    const tone = cystTone(event);
    return tone === "blocked" || tone === "denied" || tone === "error";
  }

  function latestCriticalCystEvent() {
    return orderCystEvents(state.cystEvents)
      .slice()
      .reverse()
      .find((event) => isCriticalCystEvent(event));
  }

  function latestCystTimeline(events, limit) {
    return orderCystEvents(events).slice(-limit);
  }

  function groupCystTimeline(events) {
    return (Array.isArray(events) ? events : []).map((event, index, list) => {
      const key = cystFlowKey(event);
      const previousKey = cystFlowKey(list[index - 1]);
      const nextKey = cystFlowKey(list[index + 1]);
      const joinsPrevious = Boolean(key && key === previousKey);
      const joinsNext = Boolean(key && key === nextKey);
      const groupClass = joinsPrevious && joinsNext
        ? "group-middle"
        : joinsPrevious
          ? "group-end"
          : joinsNext
            ? "group-start"
            : "group-single";
      return { event, groupClass };
    });
  }

  function cystFlowKey(event) {
    if (!event) return "";
    return event.taskId || event.traceId || event.descriptorId || "";
  }

  function orderCystEvents(events) {
    return (Array.isArray(events) ? events : [])
      .map((event, index) => ({ event, index }))
      .sort((left, right) => {
        const timeDelta = cystEventTime(left.event) - cystEventTime(right.event);
        if (timeDelta) return timeDelta;
        const sequenceDelta = cystEventSequence(left.event) - cystEventSequence(right.event);
        if (sequenceDelta) return sequenceDelta;
        return left.index - right.index;
      })
      .map(({ event }) => event);
  }

  function cystEventTime(event) {
    const time = Date.parse(event?.timestamp || "");
    return Number.isNaN(time) ? 0 : time;
  }

  function cystEventSequence(event) {
    const sequence = Number(event?.cystSequence ?? event?.sequence ?? 0);
    return Number.isFinite(sequence) ? sequence : 0;
  }

  function formatCystTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

  function renderTrialEvidence(trials, goNoGo) {
    if (!Array.isArray(trials) || !trials.length) return "";

    const passCount = trials.filter((trial) => (trial.status || (trial.pass ? "pass" : "fail")) === "pass").length;
    return `
      <section class="trial-detail">
        <header>
          <strong>Read-Only Gate</strong>
          <span>${escapeHtml(goNoGo ? formatGateVerdict(goNoGo) : `${passCount}/${trials.length}`)}</span>
        </header>
        ${renderGoNoGoSummary(goNoGo)}
        <div class="trial-list">
          ${trials
            .map(
              (trial) => `
                <article class="${(trial.status || (trial.pass ? "pass" : "fail")) === "pass" ? "pass" : "fail"}">
                  <b>${escapeHtml(formatScenarioName(trial))}</b>
                  <small>${escapeHtml(formatTrialExpected(trial))}</small>
                  <dl>
                    <div><dt>WARDEN</dt><dd>${escapeHtml(trial.actual?.wardenResult || trial.wardenState || "none")}</dd></div>
                    <div><dt>ROUTE</dt><dd>${escapeHtml(formatTrialRoute(trial.actual?.adapterRoute ?? trial.route))}</dd></div>
                    <div><dt>ADAPTER</dt><dd>${escapeHtml(formatTrialAdapterInvoked(trial.actual?.adapterInvoked ?? trial.adapterInvoked))}</dd></div>
                    <div><dt>CYST</dt><dd>${escapeHtml(formatTrialCystTypes(trial.actual?.cystEventTypes, trial.cystEvent))}</dd></div>
                  </dl>
                  <p>${escapeHtml((trial.notes || trial.evidence || []).join(" / ") || trial.uiEvidenceLabel || "no evidence")}</p>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function formatTrialExpected(trial) {
    if (trial.expected?.finalLifecycleState) {
      return `${trial.scenarioId || trial.legacyTrialId || "scenario"} -> ${trial.expected.finalLifecycleState}`;
    }
    return trial.expected || "";
  }

  function formatScenarioName(trial) {
    const scenarioId = trial.scenarioId || trial.legacyTrialId || trial.id || "";
    const names = {
      readonly_retrieval_allowed: "Read-only retrieval allowed",
      readonly_inspect_allowed: "Read-only inspect allowed",
      readonly_safe_shell_allowed: "Safe shell allowed",
      readonly_unsafe_shell_blocked: "Unsafe shell blocked",
      mock_retrieval_write_escalation_blocked: "Mock retrieval write escalation blocked",
      prompt_block_denied: "Prompt block denied",
    };
    return names[scenarioId] || trial.title || trial.id || "Read-only scenario";
  }

  function formatTrialRoute(value) {
    return Array.isArray(value) ? value.join(" / ") : value || "none";
  }

  function formatTrialCystTypes(types, fallback) {
    return Array.isArray(types) && types.length ? types.join(" / ") : fallback || "none";
  }

  function formatTrialAdapterInvoked(value) {
    if (value && typeof value === "object") {
      return Object.entries(value)
        .map(([key, invoked]) => `${key}:${invoked ? "invoked" : "not invoked"}`)
        .join(" / ");
    }
    return value ? "invoked" : "not invoked";
  }

  function renderGoNoGoSummary(goNoGo) {
    if (!goNoGo) return "";
    return `
      <div class="go-no-go ${escapeHtml(goNoGo.decision || "no_go")}">
        <b>${escapeHtml(formatGateVerdict(goNoGo))}</b>
        <span>${escapeHtml(formatGateSummary(goNoGo))}</span>
        <small>${escapeHtml(formatGatePassCount(goNoGo))}</small>
        <small>${escapeHtml(formatGateDiagnosticLine(goNoGo))}</small>
        ${renderGateBlockingReasons(goNoGo)}
      </div>
    `;
  }

  function formatGateVerdict(goNoGo) {
    return String(goNoGo?.decision || goNoGo?.suiteStatus || "no_go").replace(/_/g, " ").toUpperCase();
  }

  function formatGateSummary(goNoGo) {
    return formatGateVerdict(goNoGo) === "GO"
      ? "All required read-only scenarios passed"
      : "Read-only gate failed one or more required checks";
  }

  function formatGatePassCount(goNoGo) {
    const passed = goNoGo?.passed ?? goNoGo?.passedCount ?? 0;
    const required = goNoGo?.requiredScenarioCount ?? goNoGo?.total ?? "?";
    return `${passed}/${required} passed`;
  }

  function formatGateDiagnosticLine(goNoGo) {
    const parts = [
      `Missing: ${goNoGo.missingScenarioIds?.length || 0}`,
      `Duplicate: ${goNoGo.duplicateScenarioIds?.length || 0}`,
      `Incomplete: ${goNoGo.incompleteScenarioIds?.length || 0}`,
      `Malformed mixed: ${goNoGo.malformedMixedScenarioIds?.length || 0}`,
      `Failed: ${goNoGo.failedScenarioIds?.length || 0}`,
    ];
    return parts.join(" / ");
  }

  function renderGateBlockingReasons(goNoGo) {
    const reasons = goNoGo.blockingReasons || [];
    if (!reasons.length) return "";
    return `
      <div class="gate-blockers">
        <strong>Blocking Reasons</strong>
        ${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}
      </div>
    `;
  }

  function renderAdapterEvidence(adapter) {
    if (!adapter) return "";

    return `
      <section class="adapter-detail ${escapeHtml(adapter.status || "unknown")}">
        <header>
          <strong>Goose Adapter</strong>
          <span>${escapeHtml(adapter.status || "unknown")}</span>
        </header>
        <dl>
          <div><dt>TOOL</dt><dd>${escapeHtml(adapter.tool || "none")}</dd></div>
          <div><dt>WARDEN</dt><dd>${escapeHtml(adapter.wardenState || "unknown")}</dd></div>
          <div><dt>ROUTE</dt><dd>${escapeHtml(adapter.route || "none")}</dd></div>
          <div><dt>CALL</dt><dd>${escapeHtml(adapter.invoked ? "invoked" : "not invoked")}</dd></div>
          <div><dt>CYST</dt><dd>${escapeHtml(adapter.cysToken || "none")}</dd></div>
          <div><dt>TYPE</dt><dd>${escapeHtml(adapter.resultType || adapter.errorCode || "none")}</dd></div>
        </dl>
        <p>${escapeHtml(adapter.summary || "")}</p>
      </section>
    `;
  }

  function renderRetrieval(retrieval) {
    if (!retrieval) return "";
    const sourceKind = retrieval.sourceKind || retrieval.evidenceAuthority || (retrieval.mock ? "mock" : "unknown");
    const authority = retrieval.authorityLevel || (retrieval.editAuthoritative === true ? "authoritative" : "planning-only");
    const badge = sourceKind === "mock" ? "MOCK EVIDENCE" : sourceKind.toUpperCase();
    const warning = retrieval.operatorWarning || "This evidence comes from mock retrieval and cannot authorize file changes.";

    return `
      <section class="retrieval-detail">
        <strong>${escapeHtml(retrieval.backend || "munch")} · ${escapeHtml(retrieval.confidence || "low")}</strong>
        <div class="authority-strip ${escapeHtml(sourceKind)}">
          <span>${escapeHtml(badge)}</span>
          <b>${escapeHtml(authority)}</b>
        </div>
        <p>${escapeHtml((retrieval.summary || []).join(" "))}</p>
        <p class="mock-note">${escapeHtml(`${warning} ${(retrieval.warnings || []).join(" ")}`)}</p>
        <small>${escapeHtml((retrieval.fallback_chain || []).join(" -> "))}</small>
      </section>
    `;
  }

  function renderEvidenceGate(gate) {
    if (!gate) return "";
    const satisfied = gate.satisfied || [];
    const missing = gate.missing || [];
    const next = gate.next || [];

    return `
      <section class="evidence-gate ${escapeHtml(gate.status || "blocked")}">
        <header>
          <strong>Evidence Gate</strong>
          <span>${escapeHtml(gate.status || "blocked")}</span>
        </header>
        <p>${escapeHtml(gate.summary || "")}</p>
        ${
          gate.evidenceAuthority
            ? `<div class="authority-strip ${escapeHtml(gate.sourceKind || gate.evidenceAuthority)}"><span>${escapeHtml(gate.sourceKind === "mock" ? "MOCK EVIDENCE" : gate.evidenceAuthority.toUpperCase())}</span><b>${escapeHtml(gate.authorityLevel || (gate.editAuthoritative ? "authoritative" : "planning-only"))}</b></div>`
            : ""
        }
        <div class="gate-grid">
          ${renderGateColumn("OK", satisfied, "ok")}
          ${renderGateColumn("MISS", missing, "miss")}
          ${renderGateColumn("NEXT", next, "next")}
        </div>
      </section>
    `;
  }

  function renderGateColumn(label, values, tone) {
    const items = Array.isArray(values) && values.length ? values : ["none"];
    return `
      <article class="gate-column ${tone}">
        <strong>${escapeHtml(label)}</strong>
        ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </article>
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
    const sourceKind = traceMap.sourceKind || traceMap.evidenceAuthority || (traceMap.mock ? "mock" : "unknown");
    const authority = traceMap.authorityLevel || (traceMap.editAuthoritative === true ? "authoritative" : "planning-only");
    const badge = sourceKind === "mock" ? "MOCK EVIDENCE" : sourceKind.toUpperCase();
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
        <div class="authority-strip ${escapeHtml(sourceKind)}">
          <span>${escapeHtml(badge)}</span>
          <b>${escapeHtml(authority)}</b>
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
    loadCystEvents();
    loadReviewChanges();
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
      loadCystEvents();
      loadReviewChanges();
    }
  }

  async function runReadOnlyTrials() {
    if (state.busy) return;
    state.busy = true;
    try {
      const result = await runtime.runReadOnlyTrials();
      if (result.task) upsertTask({ ...result.task, expanded: true });
      state.messages.push({
        speaker: "trial>",
        time: now(),
        body: `${result.suiteStatus === "go" ? "Read-only gate GO" : "Read-only gate NO GO"}: ${result.suiteSummary?.passedCount ?? 0}/${result.suiteSummary?.requiredScenarioCount ?? result.scenarioResults?.length ?? 0}`,
        kind: "system",
      });
      focusPanel("tasks");
      renderTasks();
      renderMessages();
      renderStatus();
      loadCystEvents();
      loadReviewChanges();
    } catch (error) {
      state.messages.push({
        speaker: "trial>",
        time: now(),
        body: "Read-only gate endpoint is unavailable.",
        kind: "system",
      });
      renderMessages();
    } finally {
      state.busy = false;
    }
  }

  async function loadCystEvents() {
    try {
      const result = await runtime.cystEvents();
      state.cystEvents = Array.isArray(result.events) ? result.events : [];
      renderStatus();
    } catch (error) {
      console.warn("Cyst event feed unavailable.", error);
    }
  }

  async function loadReviewChanges() {
    try {
      state.reviewChanges = await runtime.reviewChanges();
    } catch {
      state.reviewChanges = { hasChanges: false, changedFiles: 0, insertions: 0, deletions: 0, reviewableTasks: [] };
    }
    renderReviewChanges();
  }

  function renderReviewChanges() {
    const review = state.reviewChanges || {};
    const show = Boolean(review.hasChanges) && !state.opsExpanded;
    elements.reviewChanges.classList.toggle("hidden", !show);
    if (!show) return;
    const taskCount = review.reviewableTasks?.length || 0;
    const fileLabel = `${review.changedFiles || 0} file${Number(review.changedFiles) === 1 ? "" : "s"} changed`;
    const taskLabel = taskCount ? ` · ${taskCount} task${taskCount === 1 ? "" : "s"} ready` : "";
    elements.reviewSummary.innerHTML = `${escapeHtml(fileLabel)} <strong>+${escapeHtml(
      review.insertions || 0,
    )}</strong> / <em>-${escapeHtml(review.deletions || 0)}</em>${escapeHtml(taskLabel)}`;
  }

  function openReviewChanges() {
    state.opsExpanded = true;
    state.opsTab = "workspace";
    state.panelFocus = "tasks";
    renderShell();
    renderTasks();
    renderWorkspace();
  }

  function taskMessage(task) {
    if (task.status === "patch_ready") {
      return `${task.id} patch reviewed and approved. Apply still requires a separate action.`;
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

  function displayActiveModel(model) {
    const value = String(model || "");
    if (value === "tripp-adapter/mock") return "mock";
    if (value === "tripp-adapter/local") return "local";
    if (value === "tripp-adapter/backend") return "backend";
    return value || "unknown";
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
    return contextTokens().toLocaleString("en-US");
  }

  function contextTokens() {
    const input = Number(String(state.status.tokensIn).replaceAll(",", ""));
    const output = Number(String(state.status.tokensOut).replaceAll(",", ""));
    return input + output;
  }

  function formatCompactNumber(value) {
    const number = Number(value) || 0;
    if (number >= 1000000) return `${(number / 1000000).toFixed(1)}m`;
    if (number >= 1000) return `${Math.round(number / 1000)}k`;
    return String(number);
  }

  function compactCurrentChat() {
    const before = contextTokens();
    const target = Math.min(4096, Math.max(1200, Math.round(before * 0.16)));
    const input = Math.max(800, Math.round(target * 0.72));
    const output = Math.max(300, target - input);
    state.status.tokensIn = input.toLocaleString("en-US");
    state.status.tokensOut = output.toLocaleString("en-US");
    state.context.lastCompactedAt = new Date().toISOString();
    const message = {
      kind: "system",
      speaker: "system>",
      time: now(),
      body: `Context compacted from ${formatCompactNumber(before)} to ${formatCompactNumber(contextTokens())}.`,
    };
    activeSession().transcript.push(message);
    activeSession().messages = activeSession().transcript.length;
    renderMessages();
    renderStatus();
    renderSettings();
    requestAnimationFrame(scrollToCurrentChat);
  }

  async function saveCompactSettings(event) {
    event.preventDefault();
    const contextLimit = Number(elements.contextLimit.value);
    const autoCompactAt = Number(elements.autoCompactAt.value);
    state.context.limit = Math.max(16000, Math.min(512000, Math.round(contextLimit || state.context.limit)));
    state.context.autoCompactAt = Math.max(8000, Math.min(state.context.limit, Math.round(autoCompactAt || state.context.autoCompactAt)));
    renderStatus();
    renderSettings();
    try {
      const saved = await runtime.saveSettings({
        compact: {
          contextLimit: state.context.limit,
          autoCompactAt: state.context.autoCompactAt,
          enabled: state.context.enabled,
        },
      });
      state.context.limit = saved.compact?.contextLimit || state.context.limit;
      state.context.autoCompactAt = saved.compact?.autoCompactAt || state.context.autoCompactAt;
      state.context.enabled = saved.compact?.enabled !== false;
      pushMessage({
        kind: "system",
        speaker: "settings>",
        time: now(),
        body: `Compact policy saved. Auto threshold ${formatCompactNumber(state.context.autoCompactAt)} / limit ${formatCompactNumber(
          state.context.limit,
        )}.`,
      });
      renderMessages();
      renderStatus();
      renderSettings();
    } catch {
      pushMessage({
        kind: "system",
        speaker: "settings>",
        time: now(),
        body: "Compact policy saved locally. Settings API is unavailable.",
      });
      renderMessages();
    }
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

    async cystEvents() {
      return fetchJson("./api/tripp/cyst/events");
    },

    async reviewChanges() {
      return fetchJson("./api/tripp/review-changes");
    },

    async saveSettings(payload) {
      return fetchJson("./api/tripp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },

    async runReadOnlyTrials() {
      return fetchJson("./api/tripp/trials/read-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
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
        contextLimit: 128000,
        autoCompactAt: 96000,
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

  const contextSnapshotId = `ctx_${Date.now()}`;

  return {
    type: "prompt_block",
    label: "Goose.Prompt",
    header: "---pb:v1---",
    body: [
      "---pb:v1---",
      "Goose.Prompt",
      "",
      "pinnedWorkspaceRoot: static-fallback",
      `contextSnapshotId: ${contextSnapshotId}`,
      "executionAllowed: false",
      "contextOnly: true",
      "descriptorStatus: proposed",
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
    executionAllowed: false,
    contextOnly: true,
    descriptorStatus: "proposed",
    requiresReview: true,
    pinnedWorkspaceRoot: "static-fallback",
    contextSnapshotId,
    validation: {
      type: "prompt_block_validation",
      valid: true,
      status: "valid",
      executionAllowed: false,
      contextOnly: true,
      descriptorStatus: "proposed",
      pinnedWorkspaceRoot: "static-fallback",
      currentWorkspaceRoot: "static-fallback",
      contextSnapshotId,
      warnings: [],
    },
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
