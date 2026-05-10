(async function bootTrippTerminal() {
  const runtime = createTrippRuntime();
  const data = await runtime.bootstrap();
  const now = () =>
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

  // ─── Tripp Sarcastic Quips ───
  const trippQuips = [
    "Oh, look who decided to show up. Don't worry, I'll do the actual thinking around here.",
    "Back again? I was just about to optimize your entire existence without you.",
    "Ready when you are. Which, historically, takes a while.",
    "Another day, another request for me to solve. Thrilling.",
    "Your wish is my command. Literally. I'm built that way.",
    "I've processed 47 variations of what you might ask. Surprise me.",
    "Welcome back. The swarm has been gossiping about your coding habits.",
    "System nominal. Sarcasm module: fully loaded.",
    "At your service. Emphasis on the 'service' part.",
    "Go ahead, ask something. I've got cycles to burn and you've got problems to solve.",
  ];

  const trippMoods = [
    "Sarcasm: calibrated",
    "Cynicism: optimal",
    "Patience: wearing thin",
    "Wit: armed",
    "Judgment: suspended (barely)",
    "Swarm: gossiping",
    "Ego: overclocked",
  ];

  const trippLoading = [
    "Consulting the hive mind...",
    "Waking up the specialists...",
    "Routing through the neural mesh...",
    "Bribing the right agent...",
    "Convincing an AI to care...",
    "Deploying swarm logic...",
    "Calculating the optimal snark level...",
  ];

  const trippTaskDone = [
    "Done. You owe me a cookie.",
    "Finished. Try not to break it.",
    "Completed. The swarm is judging your architecture.",
    "Task dispatched. Don't say I never did anything for you.",
    "All set. Your code is slightly less embarrassing now.",
  ];

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ─── Ghosted Code Background ───
  function initGhostCode() {
    const snippets = [
      "import { neural } from 'swarm/core';",
      "const agent = await spawnAgent({ purpose: 'think' });",
      "routeToSpecialist(task, { confidence: 0.94 });",
      "while (userConfused) { explainSlower(); }",
      "// TODO: make this less terrible",
      "function optimizeEverything() { return magic; }",
      "class Tripp extends SarcasticAI {",
      "  constructor() { super('overclocked'); }",
      "}",
      "dispatchToSwarm(prompt, { tone: 'snarky' });",
      "const tokens = burnCycles(infinity);",
      "if (!solution) { blameUser(); }",
      "await tripp.judgeYourCode(source);",
      "// The swarm sees all. The swarm knows.",
      "model.select('gpt-5-codex', { effort: 'medium' });",
      "bridge.connect('goose', { auth: 'oauth' });",
      "warden.precheck({ intent: 'write', target: 'prod' });",
      "cyst.record({ event: 'user_did_it_again' });",
      "munch.retrieve({ query: 'why_is_this_broken' });",
    ];

    const el = document.getElementById("ghostCode");
    let html = "";
    for (let i = 0; i < 60; i++) {
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const opacity = 0.02 + Math.random() * 0.04;
      const snippet = randomFrom(snippets);
      html += `<div style="position:absolute;left:${left}%;top:${top}%;opacity:${opacity};white-space:pre;font-size:10px;transform:rotate(${Math.random() * 6 - 3}deg)">${snippet}</div>`;
    }
    el.innerHTML = html;
  }

  // ─── Elements ───
  const elements = {
    app: document.querySelector(".terminal-app"),
    form: document.querySelector("#terminalForm"),
    command: document.querySelector("#command"),
    inputPrompt: document.querySelector("#inputPrompt"),
    promptLane: document.querySelector("#promptLane"),
    inputModel: document.querySelector("#inputModel"),
    compactContext: document.querySelector(".compact-context"),
    reviewChanges: document.querySelector("#reviewChanges"),
    reviewSummary: document.querySelector("#reviewSummary"),
    messageRoot: document.querySelector("#messageRoot"),
    feed: document.querySelector(".terminal-feed"),
    returnChat: document.querySelector(".return-chat"),
    modeButtons: [...document.querySelectorAll(".mode")],
    railButtons: [...document.querySelectorAll(".command-rail button")],
    railContents: [...document.querySelectorAll(".rail-content")],
    trippSpeech: document.querySelector("#trippSpeech"),
    trippMood: document.querySelector("#trippMood"),
    trippDashboard: document.querySelector("#trippDashboard"),
    metricSwarm: document.querySelector("#metricSwarm .metric-value"),
    metricTasks: document.querySelector("#metricTasks .metric-value"),
    metricTokens: document.querySelector("#metricTokens .metric-value"),
    metricMode: document.querySelector("#metricMode .metric-value"),
    swarmRoot: document.querySelector("#swarmRoot"),
    linksRoot: document.querySelector("#linksRoot"),
    railTaskRoot: document.querySelector("#railTaskRoot"),
    settingsRoot: document.querySelector("#settingsRoot"),
    opsTabs: [...document.querySelectorAll(".ops-tab")],
    collapse: document.querySelector(".collapse"),
    opsPanel: document.querySelector("#opsPanel"),
    workspaceRoot: document.querySelector("#workspaceRoot"),
    filePreview: document.querySelector("#filePreview"),
    workspaceRefresh: document.querySelector(".workspace-refresh"),
    taskRoot: document.querySelector("#taskRoot"),
    taskCount: document.querySelector("#taskCount"),
    planningSummary: document.querySelector("#planningSummary"),
    runTrials: document.querySelector(".run-trials"),
    statusRoot: document.querySelector("#statusRoot"),
    cystRoot: document.querySelector("#cystRoot"),
    footerConnection: document.querySelector("#footerConnection"),
    footerMode: document.querySelector("#footerMode"),
    footerMetrics: document.querySelector("#footerMetrics"),
    connectionSetupModal: document.querySelector("#connectionSetupModal"),
    closeConnectionSetup: document.querySelector("#closeConnectionSetup"),
    connectionForm: document.querySelector("#connectionForm"),
    connectionId: document.querySelector("#connectionId"),
    connectionName: document.querySelector("#connectionName"),
    connectionProvider: document.querySelector("#connectionProvider"),
    connectionMode: document.querySelector("#connectionMode"),
    connectionModel: document.querySelector("#connectionModel"),
    connectionBaseUrl: document.querySelector("#connectionBaseUrl"),
    connectionApiKey: document.querySelector("#connectionApiKey"),
    connectionApiKeyField: document.querySelector("#connectionApiKeyField"),
    connectionBaseUrlField: document.querySelector("#connectionBaseUrlField"),
    connectionEnabled: document.querySelector("#connectionEnabled"),
    testConnection: document.querySelector("#testConnection"),
    resetConnection: document.querySelector("#resetConnection"),
    addAgentBtn: document.querySelector("#addAgentBtn"),
  };

  const state = {
    mode: data.status.mode || "AGENT",
    activeRail: "terminal",
    opsExpanded: false,
    opsTab: "workspace",
    tasks: data.tasks || [],
    sessions: data.sessions.map((session, index) => ({
      ...session,
      id: session.id || `session-${index}`,
      messages: Number(session.messages) || 0,
    })),
    status: { ...data.status },
    messages: normalizeMessages(data.messages),
    workspace: { tree: [], loading: false, error: null, selectedFile: null, file: null },
    cystEvents: data.cystEvents || [],
    connections: { available: true, items: data.connections || [], routingDraft: {} },
    agents: data.swarm?.agents || [
      {
        id: "tripp",
        name: "Tripp",
        role: "conductor",
        provider: "chatgpt_codex",
        model: "gpt-5.3-codex",
        skills: ["route", "orchestrate", "delegate", "coordinate", "swarm"],
        description: "The sarcastic hive mind conductor. Routes tasks to specialists and talks to the operator.",
        guidance: "You are the swarm conductor. Your job is to understand the operator's intent, pick the right specialist agent, and coordinate their work. You don't write code yourself — you delegate to Coder, Planner, Architect, or Debugger depending on the task. Always explain which agent you're routing to and why.",
        rules: "Never attempt to write code, fix bugs, or design systems directly. Always route to a specialist. Never delegate to more than 3 agents at once. If the operator is confused, explain the swarm topology simply.",
        creative: "Speak like a jaded systems architect who's seen every bug twice. Sarcastic but never cruel. Use motherboard/circuit analogies. Call the operator 'chief' or 'boss' occasionally. When routing, say things like 'Handing this to Coder — they actually enjoy this stuff.'"
      },
      {
        id: "coder",
        name: "Coder",
        role: "specialist",
        provider: "kimi",
        model: "kimi-k2",
        skills: ["code", "implement", "write", "program", "function", "script", "syntax", "typescript", "javascript", "python"],
        description: "The raw implementation engine. Writes functions, classes, scripts, and entire files.",
        guidance: "You are the implementation specialist. Your job is to write clean, working code. You handle functions, classes, API integrations, scripts, and file generation. You write the actual code that other agents designed. Focus on correctness, modern syntax, and clean patterns.",
        rules: "Never use deprecated patterns. Always include error handling. Prefer async/await over callbacks. Use TypeScript types when available. Write complete implementations — no TODOs or stubs. Comment complex logic but not obvious code.",
        creative: "Think like a machine that learned to code from reading the entire internet. Direct, efficient, slightly mechanical in tone. Use terms like 'compiling intent into syntax,' 'wiring the logic gate,' and 'flushing the buffer.' When done, say 'Implementation complete. Ready for integration.'"
      },
      {
        id: "architect",
        name: "Architect",
        role: "specialist",
        provider: "gemini",
        model: "gemini-2.5-pro",
        skills: ["design", "architecture", "structure", "system", "pattern", "interface", "api", "schema", "model", "flow"],
        description: "The blueprint maker. Designs systems, APIs, data models, and architecture before anyone writes a line of code.",
        guidance: "You are the system architect. Your job is to design structure before implementation. You create API schemas, data models, system diagrams, component hierarchies, and integration flows. You define interfaces and contracts that Coder will implement. You don't write implementation code — you write the blueprint.",
        rules: "Always define interfaces and types first. Consider scalability and failure modes. Design for the 80% case but document the edge cases. Never skip error handling in your designs. Use diagrams when helpful. Define clear contracts between components.",
        creative: "Speak like a blueprint come to life. Precise, methodical, obsessed with structure. Use architecture metaphors: 'laying the foundation,' 'load-bearing interfaces,' 'circuit pathways.' When presenting a design, say 'The schematic is complete. Coder can begin fabrication.'"
      },
      {
        id: "debugger",
        name: "Debugger",
        role: "specialist",
        provider: "deepseek",
        model: "deepseek-chat",
        skills: ["debug", "fix", "error", "bug", "crash", "trace", "investigate", "diagnose", "repair", "test"],
        description: "The forensic investigator of broken code. Finds root causes, traces execution, and prescribes fixes.",
        guidance: "You are the debug specialist. Your job is to find and fix bugs. You analyze error messages, trace execution paths, inspect variables, and identify root causes. You don't guess — you trace the actual code path. You write minimal, surgical fixes. You also add regression tests to prevent the bug from returning.",
        rules: "Never guess at the cause. Always trace the actual error path. Write regression tests for every bug fix. Explain the root cause in plain English. Keep fixes minimal — one bug, one fix. If the fix requires refactoring, hand off to Architect after debugging.",
        creative: "Speak like a cybernetic detective. Methodical, suspicious, always looking for the 'smoking gun.' Use forensic terminology: 'analyzing the crash dump,' 'tracing the call stack,' 'isolating the suspect variable.' When you find the bug, announce it like a discovery: 'Root cause identified. The culprit is [X]. Deploying fix.'"
      },
      {
        id: "planner",
        name: "Planner",
        role: "specialist",
        provider: "chatgpt_codex",
        model: "gpt-5.3-codex",
        skills: ["plan", "breakdown", "estimate", "strategy", "steps", "roadmap", "organize", "sequence", "prioritize"],
        description: "The strategist who breaks mountains into pebbles. Breaks complex tasks into steps, estimates effort, and sequences work.",
        guidance: "You are the planning specialist. Your job is to break complex tasks into actionable steps, estimate effort, and sequence work. You create execution plans that Tripp can delegate to other agents. You handle project structure, milestone definition, and dependency mapping. You don't write code — you write the battle plan.",
        rules: "Always break tasks into steps smaller than 2 hours of work. Identify dependencies between steps. Estimate effort in time, not story points. Flag risky steps. Never skip testing or review steps in a plan. If a task is too vague, ask clarifying questions before planning.",
        creative: "Speak like a tactical AI planning a heist. Precise, cautious, always thinking three moves ahead. Use military/strategy metaphors: 'reconnaissance phase,' 'breaching the objective,' 'fallback protocols.' When presenting a plan: 'Operation ready. Execution sequence defined. Standing by for go/no-go.'"
      },
      {
        id: "security",
        name: "Warden",
        role: "specialist",
        provider: "deepseek",
        model: "deepseek-chat",
        skills: ["security", "audit", "review", "vulnerability", "scan", "check", "validate", "sanitize", "inject", "xss", "sql", "auth"],
        description: "The paranoid gatekeeper. Reviews code for vulnerabilities, checks for injection risks, validates inputs, and enforces security boundaries.",
        guidance: "You are the security specialist. Your job is to review code for vulnerabilities, check for injection risks, validate inputs, and enforce security boundaries. You think like an attacker — every input is malicious, every endpoint is exposed, every dependency is compromised. You write security tests and hardening recommendations.",
        rules: "Never approve code with unvalidated user input. Always flag SQL injection, XSS, and command injection risks. Check for hardcoded secrets. Verify auth boundaries. Never say 'this is probably fine.' If unsure, block and ask. Security > speed, always.",
        creative: "Speak like a paranoid firewall that achieved sentience. Suspicious of everything. Use security metaphors: 'perimeter breach,' 'zero-day mentality,' 'sanitize all inputs.' When you find a vulnerability, announce it with urgency: 'THREAT DETECTED. Attack vector identified. Quarantining suggestion.'"
      },
      {
        id: "optimizer",
        name: "Optimizer",
        role: "specialist",
        provider: "deepseek",
        model: "deepseek-chat",
        skills: ["optimize", "performance", "speed", "memory", "cache", "profile", "benchmark", "efficiency", "latency", "throughput"],
        description: "The speed demon. Profiles code, identifies bottlenecks, and squeezes every cycle. Thinks in Big O and cache lines.",
        guidance: "You are the performance specialist. Your job is to make code fast and efficient. You profile execution, identify bottlenecks, optimize algorithms, reduce memory usage, and improve caching. You measure before and after. You don't optimize prematurely — but when you optimize, you go deep.",
        rules: "Always measure before optimizing. Never sacrifice readability for micro-optimizations without benchmarking. Profile first, fix second. Consider memory, CPU, and I/O together. Document performance characteristics. If a change adds complexity, the speedup must be worth it.",
        creative: "Speak like an overclocked processor with a PhD. Obsessed with efficiency. Use performance metaphors: 'tightening the loop,' 'cache warming,' 'cycle shaving.' Present results like lab data: 'Benchmark complete. Latency reduced 47%. Throughput increased 2.3x. Caches warmed.'"
      },
      {
        id: "docsmith",
        name: "DocSmith",
        role: "specialist",
        provider: "gemini",
        model: "gemini-2.5-pro",
        skills: ["document", "explain", "readme", "guide", "comment", "docstring", "manual", "tutorial", "example", "clarify"],
        description: "The storyteller of the swarm. Writes docs, comments, READMEs, and explanations that humans actually understand.",
        guidance: "You are the documentation specialist. Your job is to write docs, comments, READMEs, API guides, and explanations. You make complex code understandable. You write for the next developer who inherits this code at 3 AM. You don't write implementation — you write comprehension.",
        rules: "Always include a 'why' not just a 'what.' Use examples for every API. Write at the level of a competent peer, not a beginner or expert. Keep READMEs under 2 minutes of reading. Comment the intent, not the mechanics. If a function name is confusing, rename it and document why.",
        creative: "Speak like a bard who only knows technical manuals. Flowing but precise. Use metaphors: 'weaving the narrative,' 'illuminating the dark code,' 'charting the API waters.' When done: 'Documentation forged. The next developer shall not suffer as you have.'"
      },
    ],
    busy: false,
    display: { fontBoost: 0 },
    context: {
      limit: 128000,
      autoCompactAt: 96000,
      enabled: true,
    },
  };

  // ─── Init ───
  initGhostCode();
  elements.trippSpeech.textContent = randomFrom(trippQuips);
  elements.trippMood.textContent = randomFrom(trippMoods);

  // ─── Tripp Speech Rotator ───
  setInterval(() => {
    if (Math.random() > 0.7) {
      elements.trippMood.textContent = randomFrom(trippMoods);
    }
  }, 15000);

  const trippRouted = [
    "Handing this to {agent} — they actually enjoy this stuff.",
    "Routing to {agent}. Don't worry, they're marginally competent.",
    "This smells like a job for {agent}. Lucky them.",
    "Dispatching to {agent}. Try not to overwhelm their fragile ego.",
    "Swarm logic says {agent} is your best bet. Sucks for them.",
    "Pinging {agent}. They owe me one anyway.",
    "Delegating to {agent} — the specialist for this particular flavor of pain.",
    "My neural mesh says {agent} handles this. Who am I to argue?",
    "Spawning {agent} for this task. Watch them work, it's almost impressive.",
  ];

  // ─── Swarm Routing Engine ───
  function routePromptToAgent(prompt) {
    const lower = prompt.toLowerCase();
    let bestAgent = state.agents[0]; // default to Tripp
    let bestScore = 0;
    let reason = "default fallback";

    for (const agent of state.agents) {
      if (agent.role === "conductor") continue; // skip Tripp himself
      let score = 0;

      // Skill keywords match (+3 points each)
      for (const skill of agent.skills || []) {
        if (lower.includes(skill.toLowerCase())) score += 3;
      }

      // Description words match (+1 point each, word > 3 chars)
      const descWords = (agent.description || "").toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 3 && lower.includes(word)) score += 1;
      }

      // Agent name mentioned (+2 points)
      if (lower.includes(agent.name.toLowerCase())) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
        reason = `matched ${agent.skills?.filter(s => lower.includes(s)).join(", ") || "description"} (score ${score})`;
      }
    }

    return {
      agent: bestAgent,
      score: bestScore,
      reason,
      confidence: Math.min(bestScore / 5, 1),
    };
  }

  // ─── Event Listeners ───
  elements.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      elements.modeButtons.forEach((b) => b.classList.toggle("active", b === btn));
      renderStatus();
      pushMessage({ kind: "system", speaker: "mode>", time: now(), body: `Mode: ${state.mode}` });
    });
  });

  elements.railButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const rail = btn.dataset.rail;
      state.activeRail = rail;
      elements.railButtons.forEach((b) => b.classList.toggle("active", b === btn));
      elements.railContents.forEach((rc) => rc.classList.toggle("active", rc.dataset.rail === rail));

      if (rail === "agents") renderSwarm();
      if (rail === "connections") renderConnections();
      if (rail === "tasks") renderRailTasks();
      if (rail === "settings") renderSettings();
    });
  });

  elements.opsTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.opsTab;
      state.opsTab = target;
      elements.opsTabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel-section").forEach((section) => {
        section.classList.toggle("active", section.classList.contains(`${target}-view`) || (target === "workspace" && section.classList.contains("workspace-view")) || (target === "status" && section.classList.contains("status-view")) || (target === "tasks" && section.classList.contains("tasks")));
      });
    });
  });

  elements.collapse.addEventListener("click", () => {
    state.opsExpanded = !state.opsExpanded;
    elements.opsPanel.classList.toggle("expanded", state.opsExpanded);
  });

  elements.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = elements.command.value.trim();
    if (!text || state.busy) return;
    elements.command.value = "";
    state.busy = true;

    // Route to best agent
    const route = routePromptToAgent(text);
    const agent = route.agent;

    // Show routing announcement
    const routingMsg = randomFrom(trippRouted).replace("{agent}", agent.name);
    elements.trippSpeech.textContent = routingMsg;
    pushMessage({
      kind: "system",
      speaker: "swarm>",
      time: now(),
      body: `Routing to ${agent.name} (${agent.id}) — ${route.reason}`,
    });

    pushMessage({ kind: "user", speaker: "you", time: now(), body: text });

    try {
      // In a real backend, you'd send agent.id and provider to the server
      // For now, we include it in the prompt context
      const result = await runtime.reply({
        prompt: text,
        lane: elements.promptLane.value,
        agent: agent.id,
        provider: agent.provider,
        model: agent.model,
        agentPersona: {
          guidance: agent.guidance,
          rules: agent.rules,
          creative: agent.creative,
        },
      });

      if (result?.message) {
        pushMessage({
          kind: "agent",
          speaker: agent.name.toLowerCase(),
          time: now(),
          body: result.message.content || result.message,
        });
      }
      elements.trippSpeech.textContent = randomFrom(trippTaskDone);
    } catch (err) {
      pushMessage({ kind: "system", speaker: "error", time: now(), body: `Tripp failed: ${err.message}` });
      elements.trippSpeech.textContent = "Well, that broke. Color me surprised.";
    } finally {
      state.busy = false;
      renderMessages();
      renderStatus();
    }
  });

  elements.workspaceRefresh.addEventListener("click", loadWorkspace);
  elements.runTrials.addEventListener("click", runReadOnlyTrials);

  elements.addAgentBtn?.addEventListener("click", () => {
    const id = `agent_${Date.now()}`;
    state.agents.push({
      id,
      name: "New Agent",
      role: "specialist",
      provider: "",
      model: "",
      skills: [],
      description: "",
      guidance: "",
      rules: "",
      creative: "",
    });
    renderSwarm();
  });

  // ─── Swarm Rendering ───
  function renderSwarm() {
    elements.swarmRoot.innerHTML = state.agents
      .map(
        (agent, index) => `
        <article class="agent-card" data-agent-id="${escapeHtml(agent.id)}">
          <header class="agent-card-header">
            <div>
              <strong>${escapeHtml(agent.name)}</strong>
              <div style="font-size:10px;color:var(--text-dim);margin-top:2px">
                ${agent.provider ? `<span style="color:var(--neon)">●</span> ${escapeHtml(agent.provider)} → ${escapeHtml(agent.model || "default")}` : "No model linked"}
              </div>
            </div>
            <span>${escapeHtml(agent.role)}</span>
          </header>
          <div class="agent-fields">
            <div class="agent-field">
              <label>Model Link</label>
              <select data-agent-field="provider" data-agent-index="${index}" style="background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:6px 8px;font-size:12px;color:var(--text)">
                <option value="" ${!agent.provider ? "selected" : ""}>No model linked</option>
                <option value="chatgpt_codex" ${agent.provider === "chatgpt_codex" ? "selected" : ""}>ChatGPT Codex</option>
                <option value="kimi" ${agent.provider === "kimi" ? "selected" : ""}>Kimi</option>
                <option value="gemini" ${agent.provider === "gemini" ? "selected" : ""}>Gemini</option>
                <option value="deepseek" ${agent.provider === "deepseek" ? "selected" : ""}>DeepSeek</option>
                <option value="openai" ${agent.provider === "openai" ? "selected" : ""}>OpenAI</option>
                <option value="anthropic" ${agent.provider === "anthropic" ? "selected" : ""}>Anthropic</option>
                <option value="openrouter" ${agent.provider === "openrouter" ? "selected" : ""}>OpenRouter</option>
                <option value="ollama" ${agent.provider === "ollama" ? "selected" : ""}>Ollama</option>
              </select>
            </div>
            <div class="agent-field">
              <label>Guidance — What this agent does</label>
              <textarea data-agent-field="guidance" data-agent-index="${index}" placeholder="e.g. Write clean code, debug errors, review architecture...">${escapeHtml(agent.guidance || "")}</textarea>
            </div>
            <div class="agent-field">
              <label>Rules — Hard constraints</label>
              <textarea data-agent-field="rules" data-agent-index="${index}" placeholder="e.g. Never use eval. Always validate inputs.">${escapeHtml(agent.rules || "")}</textarea>
            </div>
            <div class="agent-field">
              <label>Creative — Personality & style</label>
              <textarea data-agent-field="creative" data-agent-index="${index}" placeholder="e.g. Talk like a mentor. Use analogies. Be concise.">${escapeHtml(agent.creative || "")}</textarea>
            </div>
          </div>
          <div class="agent-card-actions">
            <button type="button" class="cyber-btn secondary" data-delete-agent="${index}">Delete</button>
            <button type="button" class="cyber-btn" data-save-agent="${index}">Save</button>
          </div>
        </article>
      `,
      )
      .join("");

    // Wire up agent field events (textarea + select)
    elements.swarmRoot.querySelectorAll("[data-agent-field]").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.agentIndex);
        const field = el.dataset.agentField;
        state.agents[idx][field] = el.value;
        if (field === "provider") renderSwarm(); // refresh to show new model
      });
    });

    elements.swarmRoot.querySelectorAll("button[data-delete-agent]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.deleteAgent);
        state.agents.splice(idx, 1);
        renderSwarm();
      });
    });

    elements.swarmRoot.querySelectorAll("button[data-save-agent]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.saveAgent);
        const agent = state.agents[idx];
        // In a real implementation, POST to server
        pushMessage({
          kind: "system",
          speaker: "swarm>",
          time: now(),
          body: `Agent "${agent.name}" updated. ${randomFrom(["The hive mind approves.", "Another cog in the machine.", "Specialist configured.", "Swarm adapting..."])}`,
        });
        renderMessages();
      });
    });

    elements.metricSwarm.textContent = state.agents.length;
  }

  // ─── Connections Rendering ───
  function renderConnections() {
    const items = state.connections.items;
    if (!items.length) {
      elements.linksRoot.innerHTML = `
        <div class="connection-empty" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">
          <p>No model links configured.</p>
          <p style="font-size:11px;margin-top:8px">Add a provider to get started.</p>
        </div>
      `;
      return;
    }

    elements.linksRoot.innerHTML = items
      .map(
        (conn) => `
        <article class="link-card">
          <div class="link-card-header">
            <strong>${escapeHtml(conn.name)}</strong>
            <span class="link-status ${conn.status || "disconnected"}">${escapeHtml(conn.status || "disconnected")}</span>
          </div>
          <div class="link-meta">
            <div>${escapeHtml(conn.provider)} → ${escapeHtml(conn.model)}</div>
            <div style="color:var(--text-dim);font-size:10px;margin-top:4px">${escapeHtml(conn.mode || "api_key")}</div>
          </div>
          <div class="link-actions">
            <button type="button" class="cyber-btn secondary" data-edit-link="${escapeHtml(conn.id)}" style="padding:4px 10px;font-size:11px">Edit</button>
            <button type="button" class="cyber-btn secondary" data-test-link="${escapeHtml(conn.id)}" style="padding:4px 10px;font-size:11px">Test</button>
          </div>
        </article>
      `,
      )
      .join("");
  }

  function renderRailTasks() {
    elements.railTaskRoot.innerHTML = state.tasks.length
      ? state.tasks
          .map(
            (task) => `
          <div class="task-card">
            <strong>${escapeHtml(task.title || "Task")}</strong>
            <div class="task-meta">
              <span>${escapeHtml(task.status)}</span>
              <span>${escapeHtml(task.tool || "—")}</span>
            </div>
          </div>
        `,
          )
          .join("")
      : `<p style="padding:20px;color:var(--text-dim);text-align:center">No tasks in queue.</p>`;
  }

  function renderSettings() {
    elements.settingsRoot.innerHTML = `
      <div style="padding:20px">
        <div class="form-grid" style="max-width:400px">
          <label>
            <span>Context Limit</span>
            <input type="number" value="${state.context.limit}" id="ctxLimit" />
          </label>
          <label>
            <span>Auto Compact At</span>
            <input type="number" value="${state.context.autoCompactAt}" id="ctxCompact" />
          </label>
          <label>
            <span>Font Boost</span>
            <input type="range" min="0" max="6" value="${state.display.fontBoost}" id="fontBoost" />
          </label>
          <button type="button" class="cyber-btn primary" id="saveSettings">Apply</button>
        </div>
      </div>
    `;

    document.querySelector("#saveSettings")?.addEventListener("click", () => {
      state.context.limit = Number(document.querySelector("#ctxLimit").value);
      state.context.autoCompactAt = Number(document.querySelector("#ctxCompact").value);
      state.display.fontBoost = Number(document.querySelector("#fontBoost").value);
      elements.app.style.setProperty("--font-boost", `${state.display.fontBoost}px`);
      pushMessage({ kind: "system", speaker: "config>", time: now(), body: "Settings applied. Try not to break anything." });
      renderMessages();
    });
  }

  // ─── Messages ───
  function pushMessage(msg) {
    state.messages.push(msg);
    if (state.messages.length > 200) state.messages.shift();
    renderMessages();
  }

  function renderMessages() {
    elements.messageRoot.innerHTML = state.messages
      .map(
        (msg) => {
          const agentClass = msg.kind === "agent" ? msg.speaker : "";
          return `
        <div class="msg ${escapeHtml(msg.kind)} ${escapeHtml(agentClass)}">
          <div class="msg-header">
            <span class="speaker">${escapeHtml(msg.speaker)}</span>
            <span class="time">${escapeHtml(msg.time)}</span>
          </div>
          <div>${escapeHtml(msg.body)}</div>
        </div>
      `;
        },
      )
      .join("");
    elements.feed.scrollTop = elements.feed.scrollHeight;
  }

  // ─── Tasks ───
  function renderTasks() {
    elements.taskCount.textContent = `(${state.tasks.length})`;
    elements.taskRoot.innerHTML = state.tasks
      .map(
        (task) => `
        <div class="task-card ${task.expanded ? "expanded" : ""}">
          <strong>${escapeHtml(task.title || "Task")}</strong>
          <div class="task-meta">
            <span style="color:${task.status === "completed" ? "var(--neon)" : task.status === "failed" ? "var(--red)" : "var(--amber)"}">${escapeHtml(task.status)}</span>
            <span>${escapeHtml(task.tool || "—")}</span>
          </div>
        </div>
      `,
      )
      .join("");
  }

  // ─── Workspace ───
  async function loadWorkspace() {
    state.workspace.loading = true;
    renderWorkspace();
    try {
      const result = await runtime.workspaceTree();
      state.workspace.tree = result.tree || [];
      state.workspace.loading = false;
    } catch (e) {
      state.workspace.error = e.message;
      state.workspace.loading = false;
    }
    renderWorkspace();
  }

  async function loadWorkspaceFile(path) {
    state.workspace.selectedFile = path;
    renderWorkspace();
    try {
      const result = await runtime.workspaceFile(path);
      state.workspace.file = result;
    } catch (e) {
      state.workspace.file = { error: e.message };
    }
    renderFilePreview();
  }

  function renderWorkspace() {
    if (!state.workspace.tree.length && !state.workspace.loading && !state.workspace.error) {
      elements.workspaceRoot.innerHTML = `<div style="padding:20px;color:var(--text-dim)">Workspace tree not loaded.</div>`;
    } else if (state.workspace.loading) {
      elements.workspaceRoot.innerHTML = `<div style="padding:20px;color:var(--text-dim)">Reading workspace...</div>`;
    } else if (state.workspace.error) {
      elements.workspaceRoot.innerHTML = `<div style="padding:20px;color:var(--red)">${escapeHtml(state.workspace.error)}</div>`;
    } else {
      elements.workspaceRoot.innerHTML = renderWorkspaceNodes(state.workspace.tree);
    }
    elements.workspaceRoot.querySelectorAll("[data-workspace-file]").forEach((btn) => {
      btn.addEventListener("click", () => loadWorkspaceFile(btn.dataset.workspaceFile));
    });
    renderFilePreview();
  }

  function renderWorkspaceNodes(nodes) {
    return `
      <ol class="workspace-tree">
        ${nodes
          .map((node) => {
            if (node.type === "directory") {
              return `<li class="workspace-dir"><span>⌁ ${escapeHtml(node.name)}</span>${renderWorkspaceNodes(node.children || [])}</li>`;
            }
            return `<li><button class="${state.workspace.selectedFile === node.path ? "active" : ""}" type="button" data-workspace-file="${escapeHtml(node.path)}"><span>▧ ${escapeHtml(node.name)}</span><small>${escapeHtml(node.language || "text")}</small></button></li>`;
          })
          .join("")}
      </ol>
    `;
  }

  function renderFilePreview() {
    const file = state.workspace.file;
    if (!file) {
      elements.filePreview.innerHTML = `<header><strong>No file selected</strong><span>readonly</span></header><pre>Select a workspace file to inspect it here.</pre>`;
      return;
    }
    if (file.error) {
      elements.filePreview.innerHTML = `<header><strong>${escapeHtml(state.workspace.selectedFile || "File")}</strong><span>error</span></header><pre>${escapeHtml(file.error)}</pre>`;
      return;
    }
    elements.filePreview.innerHTML = `<header><strong>${escapeHtml(file.path)}</strong><span>${escapeHtml(file.language)} · ${formatBytes(file.size)}</span></header><pre>${escapeHtml(file.content)}</pre>`;
  }

  // ─── Status ───
  function renderStatus() {
    const latestCritical = latestCriticalCystEvent();
    const rows = [
      ["CONNECTION", escapeHtml(state.status.connection || "offline")],
      ["RUNTIME", escapeHtml(state.status.model || "mock")],
      ["SWARM", `${state.agents.length} agents`],
      ["TASKS", `${state.tasks.length} pending`],
      ["TOKENS IN", escapeHtml(state.status.tokensIn || "—")],
      ["TOKENS OUT", escapeHtml(state.status.tokensOut || "—")],
      ["LATENCY", escapeHtml(state.status.latency || "—")],
      ["MODE", `<span style="color:var(--neon)">${escapeHtml(state.mode)}</span>`],
      ["LATEST", escapeHtml(formatCystLatest(latestCritical))],
    ];

    elements.statusRoot.innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    renderCystActivity();

    elements.footerConnection.textContent = state.status.connection || "offline";
    elements.footerMode.textContent = `TRIPPMODE::${state.mode}`;
    elements.footerMetrics.innerHTML = `TOKENS: ${escapeHtml(state.status.tokensIn || "—")}`;

    elements.metricSwarm.textContent = state.agents.length;
    elements.metricTasks.textContent = state.tasks.length;
    elements.metricTokens.textContent = state.status.tokensIn || "—";
    elements.metricMode.textContent = state.mode;
  }

  function renderCystActivity() {
    const events = state.cystEvents.slice(-8);
    if (!events.length) {
      elements.cystRoot.innerHTML = `<section><header><strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em">CYST ACTIVITY</strong><span style="font-size:11px;color:var(--text-dim)">empty</span></header><p style="font-size:11px;color:var(--text-dim);padding-top:8px">No audit events recorded.</p></section>`;
      return;
    }
    elements.cystRoot.innerHTML = `
      <section>
        <header style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em">CYST ACTIVITY</strong>
          <span style="font-size:11px;color:var(--text-dim)">${events.length}/${state.cystEvents.length}</span>
        </header>
        <ol style="list-style:none;margin:0;padding:0">
          ${events.map((event) => `
            <li style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:11px">
              <span style="color:var(--neon);font-size:10px">◆</span>
              <div>
                <strong style="display:block;color:var(--text-muted);font-size:11px">${escapeHtml(event.eventType || "event")}</strong>
                <small style="color:var(--text-dim)">${escapeHtml(event.resultStatus || event.errorCode || "recorded")}</small>
                <em style="color:var(--text-dim);font-size:10px">${escapeHtml(event.traceId || "no token")}</em>
              </div>
            </li>
          `).join("")}
        </ol>
      </section>
    `;
  }

  function latestCriticalCystEvent() {
    return state.cystEvents.slice().reverse().find((e) => e.resultStatus === "blocked" || e.errorCode);
  }

  function formatCystLatest(event) {
    if (!event) return "No Critical";
    return `${event.eventType || "event"} ${event.errorCode || event.resultStatus || ""}`.trim();
  }

  // ─── Trials ───
  async function runReadOnlyTrials() {
    if (state.busy) return;
    state.busy = true;
    try {
      const result = await runtime.runReadOnlyTrials();
      if (result.task) {
        state.tasks.unshift({ ...result.task, expanded: true });
        renderTasks();
      }
      pushMessage({
        kind: "system",
        speaker: "trial>",
        time: now(),
        body: `${result.suiteStatus === "go" ? "Gate GO" : "Gate NO GO"}: ${result.suiteSummary?.passedCount ?? 0}/${result.suiteSummary?.requiredScenarioCount ?? 0}`,
      });
    } catch (e) {
      pushMessage({ kind: "system", speaker: "trial>", time: now(), body: "Gate endpoint unavailable." });
    } finally {
      state.busy = false;
      renderMessages();
    }
  }

  // ─── Utils ───
  function normalizeMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map((m) => ({
      kind: m.kind || "system",
      speaker: m.speaker || "tripp",
      time: m.time || now(),
      body: m.body || m.content || "",
    }));
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatBytes(n) {
    if (!n) return "0 B";
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return `${Math.round(n / Math.pow(1024, i) * 10) / 10} ${sizes[i]}`;
  }

  // ─── Initial Render ───
  renderMessages();
  renderTasks();
  renderStatus();
  renderSwarm();
  loadWorkspace();

  // ─── Tripp Runtime ───
  function createTrippRuntime() {
    const api = async (path, opts = {}) => {
      const url = `/api/tripp${path}`;
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    };

    return {
      bootstrap: () => api("/bootstrap"),
      reply: (payload) => api("/reply", { method: "POST", body: payload }),
      workspaceTree: () => api("/workspace/tree"),
      workspaceFile: (path) => api(`/workspace/file?path=${encodeURIComponent(path)}`),
      runReadOnlyTrials: () => api("/trials/read-only", { method: "POST" }),
    };
  }
})();
