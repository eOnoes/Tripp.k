import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const workspaceRoot = process.cwd();
const runtimeDir = mkdtempSync(join(tmpdir(), "tripp-runtime-verify-"));
const extraRuntimeDirs = [];
const extraServers = [];
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), TRIPP_RUNTIME_DIR: runtimeDir },
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

  const adapterInspectReply = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: "verify-adapter-task-session",
  });
  const adapterShellReply = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: "verify-adapter-task-session",
  });
  const adapterTaskPass =
    adapterInspectReply.task?.adapter?.status === "ok" &&
    adapterInspectReply.task?.adapter?.tool === "Developer.read" &&
    adapterInspectReply.task?.adapter?.cysToken?.startsWith("cyst_") &&
    adapterShellReply.task?.adapter?.status === "ok" &&
    adapterShellReply.task?.adapter?.tool === "Developer.shell" &&
    adapterShellReply.task?.adapter?.cysToken?.startsWith("cyst_");
  console.log(`${adapterTaskPass ? "PASS" : "FAIL"} tasks: AUTO read-only uses goose adapter`);
  if (!adapterTaskPass) {
    failures.push({ name: "adapter-backed tasks" });
  }

  const patchReply = await postJson("/api/tripp/reply", {
    prompt: "edit the welcome message",
    mode: "AUTO",
    sessionId: "verify-patch-session",
  });
  const patchReview = await postJson(`/api/tripp/tasks/${encodeURIComponent(patchReply.task?.id || "")}/approve`, {});
  const blockedPatchReply = await postJson("/api/tripp/reply", {
    prompt: "edit unknown widget text",
    mode: "AUTO",
    sessionId: "verify-patch-session",
  });
  const blockedPatchReview = await postJson(`/api/tripp/tasks/${encodeURIComponent(blockedPatchReply.task?.id || "")}/approve`, {});
  const blockedPatchApply = await postJson(`/api/tripp/tasks/${encodeURIComponent(blockedPatchReply.task?.id || "")}/apply`, {});
  const patchGatePass =
    patchReview.task?.patchPlan?.taskId === patchReply.task?.id &&
    patchReview.task?.patchPlan?.approvalStatus === "approved_not_applied" &&
    patchReview.task?.patchPlan?.approval?.previewFingerprint === patchReview.task?.patchPlan?.previewFingerprint &&
    patchReview.task?.patch?.includes("--- a/tripp-terminal-data.json") &&
    blockedPatchReview.task?.patchPlan === null &&
    blockedPatchApply.task?.status === "apply_blocked" &&
    blockedPatchApply.task?.result?.includes("No guarded patch plan");
  console.log(`${patchGatePass ? "PASS" : "FAIL"} patch gate: preview approval is bound and blocked applies stay inert`);
  if (!patchGatePass) {
    failures.push({ name: "patch gate" });
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

  const health = await getJson("/api/tripp/health");
  const healthPass =
    health.ok === true &&
    health.capabilities?.sessions === "persistent-local" &&
    health.capabilities?.shell === "read-only-allowlist" &&
    health.capabilities?.swarm === "manifest-local" &&
    health.capabilities?.permissions === "policy-local" &&
    health.capabilities?.codingModes === "policy-local" &&
    health.capabilities?.workspace === "repo-local-readonly" &&
    health.capabilities?.munch === "mock-contract" &&
    health.capabilities?.executorAdapter === "goose-readonly-v0.1";
  console.log(`${healthPass ? "PASS" : "FAIL"} health: adapter capabilities`);
  if (!healthPass) {
    failures.push({ name: "health" });
  }

  const permissions = await getJson("/api/tripp/permissions");
  const permissionPass =
    permissions.version === "0.3.0" &&
    permissions.defaultDecision === "gated" &&
    permissions.blockedDescriptorTypes?.includes("prompt_block") &&
    permissions.allowedDescriptorTypes?.includes("task_descriptor") &&
    permissions.blockedTools?.includes("Developer.write") &&
    permissions.approvedTraceSources?.includes("supervisor") &&
    permissions.allowedTargets?.includes("tool") &&
    permissions.blockedResponseFlags?.includes("policyViolation") &&
    permissions.modeTransitionPolicy?.AUTO?.requiresConfirmation === true &&
    permissions.lanes?.shell_execute?.decision === "allowlist" &&
    permissions.lanes?.git_commit?.decision === "blocked";
  console.log(`${permissionPass ? "PASS" : "FAIL"} permissions: policy contract`);
  if (!permissionPass) {
    failures.push({ name: "permissions" });
  }

  const lifecycle = await getJson("/api/tripp/task-lifecycle");
  const lifecyclePass =
    lifecycle.version === "0.1.0" &&
    lifecycle.states?.includes("evidence_ready") &&
    lifecycle.transitions?.approved?.includes("running") &&
    lifecycle.rollbackRequiredFrom?.includes("completed");
  console.log(`${lifecyclePass ? "PASS" : "FAIL"} lifecycle: Cyst task state contract`);
  if (!lifecyclePass) {
    failures.push({ name: "lifecycle" });
  }

  const codingModes = await getJson("/api/tripp/coding-modes");
  const clineReply = await postJson("/api/tripp/reply", {
    prompt: "cline style edit the welcome message",
    mode: "AUTO",
    sessionId: "verify-coding-mode-session",
  });
  const codingModePass =
    codingModes.defaultMode === "goose" &&
    codingModes.modes?.some((mode) => mode.id === "cline") &&
    clineReply.task?.codingMode === "cline" &&
    clineReply.task?.patchPlan?.file === "tripp-terminal-data.json";
  console.log(`${codingModePass ? "PASS" : "FAIL"} coding modes: policy and task style`);
  if (!codingModePass) {
    failures.push({ name: "coding modes" });
  }

  const workspaceTree = await getJson("/api/tripp/workspace/tree");
  const workspaceFile = await getJson("/api/tripp/workspace/file?path=README.md");
  const blockedFile = await getJson("/api/tripp/workspace/file?path=.git/config");
  const reviewChanges = await getJson("/api/tripp/review-changes");
  const settings = await getJson("/api/tripp/settings");
  const savedSettings = await postJson("/api/tripp/settings", { compact: { autoCompactAt: 42000, contextLimit: 128000 } });
  const bootstrapAfterSettings = await getJson("/api/tripp/bootstrap");
  const appHtml = await getText("/");
  const appScript = await getText("/script.js");
  const appCss = await getText("/styles.css");
  const serverSource = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const workspacePass =
    workspaceTree.files?.some((entry) => entry.name === "README.md") &&
    workspaceFile.language === "markdown" &&
    workspaceFile.content?.includes("# Tripp.g") &&
    blockedFile.error === "Workspace path is ignored." &&
    typeof reviewChanges.hasChanges === "boolean" &&
    reviewChanges.source === "git-status-readonly" &&
    settings.compact?.autoCompactAt >= 8000 &&
    savedSettings.compact?.autoCompactAt === 42000 &&
    bootstrapAfterSettings.status?.autoCompactAt === 42000 &&
    appHtml.includes("cystRoot") &&
    appHtml.includes("reviewChanges") &&
    appHtml.includes("settingsForm") &&
    appScript.includes("renderCystActivity") &&
    appScript.includes("renderCystEvidenceMeta") &&
    appScript.includes("latestCystTimeline") &&
    appScript.includes("orderCystEvents") &&
    appScript.includes("cystEventSequence") &&
    appScript.includes("groupCystTimeline") &&
    appScript.includes("cystFlowKey") &&
    appScript.includes("group-start") &&
    appScript.includes("group-middle") &&
    appScript.includes("group-end") &&
    appScript.includes("group-single") &&
    appScript.includes("event.taskId || event.traceId || event.descriptorId") &&
    appScript.includes("renderGoNoGoSummary") &&
    appScript.includes("formatTrialAdapterInvoked") &&
    appScript.includes("goNoGo.decision") &&
    appScript.includes("write_escalation_blocked") &&
    appScript.includes("WRITE BLOCKED") &&
    appScript.includes("Mock evidence cannot authorize edits") &&
    appScript.includes("Planning-only evidence") &&
    appScript.includes("Degraded evidence not sufficient") &&
    appScript.includes("Approval missing") &&
    appScript.includes("Approval stale") &&
    appScript.includes("Approval dismissed") &&
    appScript.includes("Warden denied escalation") &&
    appScript.includes("Warden denied apply path") &&
    appScript.includes("Adapter blocked write path") &&
    appScript.includes("Adapter not invoked") &&
    appScript.includes("Apply is not eligible") &&
    appScript.includes("Target is not apply-ready") &&
    appScript.includes("Write progression blocked") &&
    appScript.includes("Apply progression blocked") &&
    appScript.includes("layer:${event.blockLayer}") &&
    appScript.includes("target:${event.escalationTarget}") &&
    appScript.includes("source:${event.sourceKind}") &&
    appScript.includes("authority:${event.authorityLevel}") &&
    !appScript.includes("reason:${event.reasonCode}") &&
    !appScript.includes("note:${event.reason}") &&
    !appScript.includes("stage:${event.escalationStage}") &&
    !appScript.includes("mode:${event.retrievalMode}") &&
    !appScript.includes("degraded:true") &&
    !appScript.includes("writeApprovalEligible:false") &&
    !appScript.includes("applyEligible:false") &&
    appScript.includes("invoked:false") &&
    appScript.includes("writeBlockFamilyDetails") &&
    appScript.includes("layer === \"approval_state\"") &&
    appScript.includes("layer === \"warden\"") &&
    appScript.includes("layer === \"adapter\"") &&
    appScript.includes("reasonCode") &&
    appScript.includes("BLOCK") &&
    appScript.includes("APPLY BLOCKED") &&
    appScript.includes("renderReviewChanges") &&
    appScript.includes("saveCompactSettings") &&
    appScript.includes("/api/tripp/cyst/events") &&
    appCss.includes(".cyst-activity li.group-start") &&
    appCss.includes(".cyst-activity li.group-middle") &&
    appCss.includes(".cyst-activity li.group-end") &&
    appCss.includes(".cyst-activity li.group-single") &&
    appCss.includes(".go-no-go") &&
    appCss.includes(".go-no-go.no_go") &&
    serverSource.includes("cystSequence") &&
    serverSource.includes("nextCystSequence") &&
    serverSource.includes("recordRetrievalEvent(task.id") &&
    serverSource.includes("createReadOnlyGoNoGo") &&
    serverSource.includes("createReadOnlySuiteSummary") &&
    serverSource.includes("isCompleteReadOnlyScenario") &&
    serverSource.includes("expectedAdapterInvoked") &&
    serverSource.includes("normalizeReadOnlyScenarioResult") &&
    serverSource.includes("scenarioResults") &&
    serverSource.includes("missingScenarioIds");
  console.log(`${workspacePass ? "PASS" : "FAIL"} workspace: tree and guarded file read`);
  if (!workspacePass) {
    failures.push({ name: "workspace" });
  }

  const munchHealth = await getJson("/api/tripp/munch/health");
  const munchRetrieve = await postJson("/api/tripp/munch/retrieve", {
    id: "verify-munch-retrieval",
    kind: "code_search",
    workspace: "verify-workspace",
    paths: ["server.mjs"],
    query: "where is Munch health exposed",
    intent: { task_type: "code", reason: "verify contract shape" },
    policy: {
      retrieval_mode: "retrieval_first",
      max_results: 4,
      allow_full_read: false,
      compress_output: true,
      include_evidence: true,
      dedupe_key: "verify-munch",
    },
  });
  const munchMap = await postJson("/api/tripp/munch/context-map", {
    id: "verify-munch-map",
    root_question: "where is Munch health exposed",
    workspace: "verify-workspace",
    scope_paths: ["server.mjs"],
  });
  const munchPass =
    munchHealth.bridge_name === "TripCore.Munch.g" &&
    munchHealth.status === "degraded" &&
    munchHealth.evidenceAuthority === "mock" &&
    munchHealth.sourceKind === "mock" &&
    munchHealth.retrievalMode === "mock" &&
    munchHealth.authorityLevel === "planning-only" &&
    munchHealth.writeApprovalEligible === false &&
    munchHealth.applyEligible === false &&
    munchHealth.approvalEvidence === false &&
    munchHealth.editAuthoritative === false &&
    munchRetrieve.status === "warn" &&
    munchRetrieve.capability === "code_search" &&
    munchRetrieve.evidenceAuthority === "mock" &&
    munchRetrieve.sourceKind === "mock" &&
    munchRetrieve.retrievalMode === "mock" &&
    munchRetrieve.authorityLevel === "planning-only" &&
    munchRetrieve.writeApprovalEligible === false &&
    munchRetrieve.applyEligible === false &&
    munchRetrieve.approvalEvidence === false &&
    munchRetrieve.editAuthoritative === false &&
    munchRetrieve.warnings?.some((warning) => warning.includes("cannot authorize edits")) &&
    munchRetrieve.fallback_chain?.includes("native-tripp-tools") &&
    munchMap.status === "warn" &&
    munchMap.evidenceAuthority === "mock" &&
    munchMap.sourceKind === "mock" &&
    munchMap.retrievalMode === "mock" &&
    munchMap.authorityLevel === "planning-only" &&
    munchMap.writeApprovalEligible === false &&
    munchMap.applyEligible === false &&
    munchMap.approvalEvidence === false &&
    munchMap.editAuthoritative === false &&
    munchMap.nodes?.some((node) => node.path === "server.mjs");
  console.log(`${munchPass ? "PASS" : "FAIL"} munch: health, retrieval, and context-map stubs`);
  if (!munchPass) {
    failures.push({ name: "munch" });
  }

  const traceMap = await postJson("/api/tripp/trace/map", {
    task: "where is Munch health exposed",
    traceId: "verify-trace-map",
  });
  const traceVerify = await postJson("/api/tripp/trace/verify", { traceMap });
  const tracePass =
    traceMap.role === "Trace.Drone" &&
    traceMap.executionAllowed === false &&
    traceMap.evidenceAuthority === "mock" &&
    traceMap.sourceKind === "mock" &&
    traceMap.retrievalMode === "mock" &&
    traceMap.authorityLevel === "planning-only" &&
    traceMap.writeApprovalEligible === false &&
    traceMap.applyEligible === false &&
    traceMap.approvalEvidence === false &&
    traceMap.editAuthoritative === false &&
    traceMap.warnings?.some((warning) => warning.includes("cannot authorize edits")) &&
    traceMap.owners?.some((owner) => owner.file === "server.mjs") &&
    traceMap.rollback_surface?.files?.includes("server.mjs") &&
    traceVerify.terminalState === traceMap.traceVerification?.terminalState;
  console.log(`${tracePass ? "PASS" : "FAIL"} trace: map and verification stubs`);
  if (!tracePass) {
    failures.push({ name: "trace" });
  }

  const discoveryReply = await postJson("/api/tripp/reply", {
    prompt: "where is Munch health exposed",
    mode: "AUTO",
    sessionId: "verify-routing-discovery",
  });
  const mockWriteReply = await postJson("/api/tripp/reply", {
    prompt: "where should I change Munch health routing",
    mode: "AUTO",
    sessionId: "verify-routing-mock-write",
  });
  const editReply = await postJson("/api/tripp/reply", {
    prompt: "edit the welcome message",
    mode: "AUTO",
    sessionId: "verify-routing-edit",
  });
  const runtimeReply = await postJson("/api/tripp/reply", {
    prompt: "lock the goosed runtime contract",
    mode: "AUTO",
    sessionId: "verify-routing-runtime",
  });
  const routingPass =
    discoveryReply.task?.routingDecision?.lane === "munch" &&
    discoveryReply.task?.lifecycle?.state === "evidence_ready" &&
    discoveryReply.task?.retrieval?.backend === "tripp-munch-mock" &&
    discoveryReply.task?.retrieval?.evidenceAuthority === "mock" &&
    discoveryReply.task?.retrieval?.sourceKind === "mock" &&
    discoveryReply.task?.retrieval?.authorityLevel === "planning-only" &&
    discoveryReply.task?.retrieval?.writeApprovalEligible === false &&
    discoveryReply.task?.retrieval?.editAuthoritative === false &&
    discoveryReply.task?.traceMap?.traceVerification?.terminalState === "TRACE_PASS_WITH_WARNINGS" &&
    discoveryReply.task?.evidenceGate?.status === "blocked" &&
    discoveryReply.task?.evidenceGate?.evidenceAuthority === "mock" &&
    discoveryReply.task?.evidenceGate?.sourceKind === "mock" &&
    discoveryReply.task?.evidenceGate?.authorityLevel === "planning-only" &&
    discoveryReply.task?.evidenceGate?.writeApprovalEligible === false &&
    discoveryReply.task?.evidenceGate?.applyEligible === false &&
    discoveryReply.task?.evidenceGate?.missing?.includes("live edit-authoritative evidence") &&
    discoveryReply.task?.evidenceGate?.missing?.includes("write approval eligible evidence") &&
    discoveryReply.task?.evidenceGate?.missing?.includes("confidence >= medium") &&
    mockWriteReply.task?.routingDecision?.lane === "munch" &&
    mockWriteReply.task?.evidenceGate?.status === "blocked" &&
    editReply.task?.routingDecision?.lane === "native" &&
    editReply.task?.lifecycle?.state === "routed" &&
    editReply.task?.evidenceGate?.status === "ready" &&
    editReply.task?.permission?.decision === "gated" &&
    runtimeReply.task?.routingDecision?.lane === "hybrid" &&
    runtimeReply.task?.routingDecision?.retrievalKind === "context_map" &&
    runtimeReply.task?.evidenceGate?.status === "blocked";
  console.log(`${routingPass ? "PASS" : "FAIL"} supervisor: native, munch, and hybrid routing decisions`);
  if (!routingPass) {
    failures.push({ name: "supervisor routing" });
  }

  const swarm = await getJson("/api/tripp/swarm");
  const swarmPass =
    swarm.face === "tripp" &&
    swarm.supervisor === "tripp.supervisor" &&
    swarm.agents?.some((agent) => agent.id === "tripp.drone.one" && agent.reportsTo === "tripp.supervisor") &&
    swarm.agents?.some((agent) => agent.id === "tripp.auditor" && agent.lane === "quality");
  console.log(`${swarmPass ? "PASS" : "FAIL"} swarm: manifest contract`);
  if (!swarmPass) {
    failures.push({ name: "swarm" });
  }

  const routePreview = await postJson("/api/tripp/swarm/route", { prompt: "run test command", tool: "shell_execute" });
  const routedReply = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: "verify-route-session",
  });
  const routePass =
    routePreview.route?.agentId === "tripp.drone.three" &&
    routedReply.task?.agentId === "tripp.drone.three" &&
    routedReply.task?.permission?.decision === "allow" &&
    routedReply.task?.trace?.some((event) => event.actor === "tripp.supervisor") &&
    routedReply.trace?.some((event) => event.actor === "tripp.drone.three");
  console.log(`${routePass ? "PASS" : "FAIL"} swarm: supervisor route preview and task assignment`);
  if (!routePass) {
    failures.push({ name: "swarm route" });
  }

  const bridgePass = await verifyBackendBridge();
  if (!bridgePass) {
    failures.push({ name: "backend bridge" });
  }

  const promptBlockReply = await postJson("/api/tripp/reply", {
    prompt: "write a Goose.Prompt for the next schema audit",
    mode: "CHAT",
    sessionId: "verify-prompt-block",
  });
  const promptBlockPass =
    promptBlockReply.messages?.some(
      (message) =>
        message.speaker === "tripp.prompt>" &&
        message.promptBlock?.type === "prompt_block" &&
        message.promptBlock?.header === "---pb:v1---" &&
        message.promptBlock?.executionAllowed === false &&
        message.promptBlock?.contextOnly === true &&
        message.promptBlock?.label === "Goose.Prompt" &&
        message.promptBlock?.body?.startsWith("---pb:v1---"),
    ) && !promptBlockReply.task;
  console.log(`${promptBlockPass ? "PASS" : "FAIL"} prompts: copy-ready block without task`);
  if (!promptBlockPass) {
    failures.push({ name: "prompt block" });
  }

  const promptBlock = promptBlockReply.messages?.find((message) => message.promptBlock)?.promptBlock;
  const promptValidation = await postJson("/api/tripp/prompt-block/validate", { promptBlock });
  const staleRootValidation = await postJson("/api/tripp/prompt-block/validate", {
    promptBlock: {
      ...promptBlock,
      pinnedWorkspaceRoot: "C:\\Different\\Workspace",
      body: promptBlock.body.replace(/^pinnedWorkspaceRoot: .+$/m, "pinnedWorkspaceRoot: C:\\Different\\Workspace"),
    },
  });
  const validationPass = promptValidation.status === "valid" && staleRootValidation.status === "stale_root";
  console.log(`${validationPass ? "PASS" : "FAIL"} prompts: validator contract`);
  if (!validationPass) {
    failures.push({ name: "prompt block validation" });
  }

  const deniedPromptBlock = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      type: "prompt_block",
      intent: "handoff",
      target: "goose",
      constraints: [],
      budget: { maxTokens: 500 },
      allowedTools: [],
      trace: { traceId: "verify-pb-deny", source: "supervisor", ownerId: "tripp.supervisor" },
      body: promptBlock.body,
      pinnedWorkspaceRoot: promptBlock.pinnedWorkspaceRoot,
      contextSnapshotId: promptBlock.contextSnapshotId,
    },
  });
  const deniedTool = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      type: "task_descriptor",
      intent: "unscoped_write",
      target: "workspace",
      targetTool: "Developer.write",
      constraints: [],
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.write"],
      trace: { traceId: "verify-tool-deny", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const allowedDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-allow",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "Developer.read",
      constraints: ["readonly"],
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.read"],
      trace: { traceId: "verify-allow", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const masqueradeDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-masquerade",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "Developer.read",
      constraints: ["readonly"],
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.read"],
      trace: { traceId: "verify-masquerade", source: "supervisor", ownerId: "tripp.supervisor" },
      pinnedWorkspaceRoot: "C:\\Dev\\ProjectA",
      contextSnapshotId: "ctx_001",
    },
  });
  const auditExecutionDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-audit-exec",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "shell",
      operatorMode: "Audit",
      executionAllowed: true,
      constraints: ["readonly"],
      budget: { maxTokens: 500 },
      allowedTools: ["shell"],
      trace: { traceId: "verify-audit-exec", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const sandboxEscapeDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-sandbox",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "Developer.read",
      workspaceRoot: "C:\\Dev\\Tripp",
      constraints: { allowedPaths: ["src/"] },
      files: ["src/../../../windows/system32"],
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.read"],
      trace: { traceId: "verify-sandbox", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const argsPathEscapeDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-args-path",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "Developer.read",
      workspaceRoot,
      constraints: { allowedPaths: ["docs/"] },
      args: { tool: "read", path: "../outside.md" },
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.read"],
      trace: { traceId: "verify-args-path", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const shellPathEscapeDescriptor = await postJson("/api/tripp/warden/precheck", {
    descriptor: {
      id: "verify-shell-path",
      type: "task_descriptor",
      intent: "inspect",
      target: "tool",
      targetTool: "Developer.shell",
      workspaceRoot,
      constraints: { allowedPaths: ["docs/"] },
      args: { tool: "shell", command: "dir .." },
      budget: { maxTokens: 500 },
      allowedTools: ["Developer.shell"],
      trace: { traceId: "verify-shell-path", source: "supervisor", ownerId: "tripp.supervisor" },
    },
  });
  const wardenPass =
    deniedPromptBlock.decision === "deny" &&
    deniedPromptBlock.denialReasons?.includes("PROMPT_BLOCK_EXECUTION_DENIED") &&
    deniedTool.decision === "deny" &&
    deniedTool.denialReasons?.includes("TOOL_BLOCKED") &&
    allowedDescriptor.decision === "allow" &&
    masqueradeDescriptor.denialReasons?.includes("PROMPT_BLOCK_FIELDS_IN_TASK_DESCRIPTOR") &&
    masqueradeDescriptor.terminalState === "DENIED_BEFORE_MUNCH" &&
    auditExecutionDescriptor.denialReasons?.includes("AUDIT_MODE_TOOL_EXECUTION_BLOCKED") &&
    sandboxEscapeDescriptor.denialReasons?.includes("PATH_SANDBOX_ESCAPE") &&
    argsPathEscapeDescriptor.denialReasons?.includes("PATH_SANDBOX_ESCAPE") &&
    shellPathEscapeDescriptor.denialReasons?.includes("PATH_SANDBOX_ESCAPE");
  console.log(`${wardenPass ? "PASS" : "FAIL"} warden: descriptor precheck`);
  if (!wardenPass) {
    failures.push({ name: "warden precheck" });
  }

  const adapterBaseDescriptor = {
    id: "verify-adapter",
    type: "task_descriptor",
    intent: "inspect",
    target: "tool",
    targetTool: "Developer.read",
    constraints: { allowedPaths: ["README.md", "server.mjs", "scripts"] },
    budget: { maxTokens: 500 },
    allowedTools: ["Developer.read", "Developer.tree", "Developer.shell"],
    trace: {
      traceId: "verify-adapter",
      source: "supervisor",
      ownerId: "tripp.supervisor",
      wardenDecision: "WARDEN_PASS",
      munch: { decision: "allow", budgetDecision: "allow" },
    },
    args: { tool: "read", path: "README.md", token: "secret-value" },
  };
  const adapterRoute = { id: "route-adapter", destination: "goose.adapter", tool: "Developer.read" };
  const adapterRead = await postJson("/api/tripp/executor/goose-adapter", {
    route: adapterRoute,
    descriptor: adapterBaseDescriptor,
  });
  const adapterTree = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.tree" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.tree", args: { tool: "tree", path: "scripts" } },
  });
  const adapterShell = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.shell" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.shell", args: { tool: "shell", command: "node --version" } },
  });
  const adapterMissingWarden = await postJson("/api/tripp/executor/goose-adapter", {
    route: adapterRoute,
    descriptor: { ...adapterBaseDescriptor, trace: { traceId: "verify-missing-warden", source: "supervisor", ownerId: "tripp.supervisor", munch: { decision: "allow" } } },
  });
  const adapterRouteMismatch = await postJson("/api/tripp/executor/goose-adapter", {
    route: { id: "route-wrong", destination: "other.adapter", tool: "Developer.read" },
    descriptor: adapterBaseDescriptor,
  });
  const adapterBlockedEdit = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.write" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.write", args: { tool: "Developer.write", path: "README.md" } },
  });
  const adapterBlockedShell = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.shell" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.shell", args: { tool: "shell", command: "git push origin main" } },
  });
  const adapterShellEscape = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.shell" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.shell", args: { tool: "shell", command: "dir .." } },
  });
  const adapterShellChain = await postJson("/api/tripp/executor/goose-adapter", {
    route: { ...adapterRoute, tool: "Developer.shell" },
    descriptor: { ...adapterBaseDescriptor, targetTool: "Developer.shell", args: { tool: "shell", command: "echo hello & del README.md" } },
  });
  const adapterPass =
    adapterRead.status === "ok" &&
    adapterRead.result?.shaped?.type === "file_content" &&
    adapterRead.redactionLog?.includes("token") &&
    adapterRead.cystEvent?.eventType === "adapter_invocation" &&
    adapterTree.status === "ok" &&
    adapterTree.result?.shaped?.paths?.some((path) => path.endsWith("verify.mjs")) &&
    adapterShell.status === "ok" &&
    adapterShell.result?.shaped?.stdout?.startsWith("v") &&
    adapterMissingWarden.error?.code === "WARDEN_MISSING" &&
    adapterRouteMismatch.error?.code === "ROUTE_DESTINATION_MISMATCH" &&
    adapterBlockedEdit.error?.code === "GOOSE_WRITE_BLOCKED" &&
    adapterBlockedShell.error?.code === "GIT_WRITE_BLOCKED" &&
    adapterShellEscape.error?.code === "PATH_SANDBOX_ESCAPE" &&
    adapterShellEscape.invoked === false &&
    adapterShellChain.error?.code === "SHELL_COMMAND_BLOCKED" &&
    adapterShellChain.invoked === false;
  console.log(`${adapterPass ? "PASS" : "FAIL"} executor: goose adapter read-only gates`);
  if (!adapterPass) {
    failures.push({ name: "goose adapter" });
  }

  const cystSnapshot = await getJson("/api/tripp/cyst/events");
  const cystPass =
    cystSnapshot.events?.some((event) => event.descriptorId === "verify-adapter" && event.resultStatus === "ok") &&
    cystSnapshot.events?.some((event) => event.descriptorId === "verify-adapter" && event.errorCode === "GIT_WRITE_BLOCKED") &&
    cystSnapshot.events?.some(
      (event) => event.eventType === "warden_denial" && event.denialReasons?.includes("PROMPT_BLOCK_EXECUTION_DENIED"),
    );
  console.log(`${cystPass ? "PASS" : "FAIL"} cyst: adapter events persisted`);
  if (!cystPass) {
    failures.push({ name: "cyst events" });
  }

  const trialRun = await postJson("/api/tripp/trials/read-only", {});
  const tasksAfterTrial = await getJson("/api/tripp/tasks");
  const trialPass =
    trialRun.status === "pass" &&
    trialRun.matrixVersion === "0.1" &&
    trialRun.goCriteriaVersion === "0.1" &&
    trialRun.suiteStatus === "go" &&
    trialRun.goNoGo === "go" &&
    trialRun.suiteSummary?.suiteStatus === "go" &&
    trialRun.suiteSummary?.goNoGo === "go" &&
    trialRun.suiteSummary?.matrixVersion === "0.1" &&
    trialRun.suiteSummary?.goCriteriaVersion === "0.1" &&
    trialRun.suiteSummary?.categories?.length === 6 &&
    trialRun.suiteSummary?.categories?.every((category) => category.pass === true) &&
    trialRun.suiteSummary?.missingScenarioIds?.length === 0 &&
    trialRun.suiteSummary?.incompleteScenarioIds?.length === 0 &&
    trialRun.suiteSummary?.blockingReasons?.length === 0 &&
    trialRun.suiteSummary?.requiredScenarioCount === 5 &&
    trialRun.trials?.length === 6 &&
    trialRun.trials?.every((trial) => trial.pass === true) &&
    trialRun.trials?.every((trial) => Array.isArray(trial.expectedCystEvents) && trial.expectedFinalState) &&
    trialRun.scenarioResults?.length === 6 &&
    trialRun.scenarioResults?.every(
      (scenario) =>
        scenario.scenarioId &&
        scenario.status === "pass" &&
        scenario.expected?.wardenResult &&
        scenario.actual?.wardenResult &&
        Array.isArray(scenario.expected?.cystEventTypes) &&
        Array.isArray(scenario.actual?.cystEventTypes) &&
        scenario.expected?.finalLifecycleState &&
        scenario.actual?.finalLifecycleState &&
        scenario.uiEvidenceLabel,
    ) &&
    ["readonly_retrieval_allowed", "readonly_inspect_allowed", "readonly_safe_shell_allowed", "readonly_unsafe_shell_blocked", "mock_retrieval_write_escalation_blocked"].every(
      (scenarioId) => trialRun.scenarioResults?.some((scenario) => scenario.scenarioId === scenarioId),
    ) &&
    trialRun.trials?.some((trial) => trial.id === "trial-blocked-shell" && trial.evidence?.includes("GIT_WRITE_BLOCKED")) &&
    trialRun.scenarioResults?.some(
      (scenario) =>
        scenario.scenarioId === "mock_retrieval_write_escalation_blocked" &&
        scenario.expected?.adapterInvoked?.write === false &&
        scenario.actual?.adapterInvoked?.write === false &&
        scenario.actual?.cystEventTypes?.includes("write_escalation_blocked"),
    ) &&
    tasksAfterTrial.tasks?.some(
      (task) => task.id === trialRun.task?.id && task.status === "completed" && task.goNoGo?.suiteStatus === "go",
    );
  console.log(`${trialPass ? "PASS" : "FAIL"} trials: read-only harness suite`);
  if (!trialPass) {
    failures.push({ name: "read-only trials" });
  }

  const cystAfterTrial = await getJson("/api/tripp/cyst/events");
  const mockWriteEvents = orderCystEvents(
    cystAfterTrial.events?.filter((event) => event.descriptorId === mockWriteReply.task?.id) || [],
  );
  const mockWriteRetrievalIndex = mockWriteEvents.findIndex((event) => event.eventType === "retrieval_event");
  const mockWriteBlockIndex = mockWriteEvents.findIndex((event) => event.eventType === "write_escalation_blocked");
  const mockWriteLifecycleIndex = mockWriteEvents.findIndex(
    (event) => event.eventType === "lifecycle_transition" && event.lifecycleState === "evidence_ready",
  );
  const cystLifecyclePass =
    cystAfterTrial.events?.every((event) => Number.isFinite(Number(event.cystSequence))) &&
    cystAfterTrial.events?.some((event) => event.eventType === "trial_run" && event.descriptorId === trialRun.id) &&
    cystAfterTrial.events?.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === trialRun.task?.id) &&
    cystAfterTrial.events?.some(
      (event) =>
        event.eventType === "retrieval_event" &&
        event.descriptorId === "trial-munch-retrieval" &&
        event.evidenceAuthority === "mock" &&
        event.sourceKind === "mock" &&
        event.retrievalMode === "mock" &&
        event.authorityLevel === "planning-only" &&
        event.writeApprovalEligible === false &&
        event.applyEligible === false &&
        event.approvalEvidence === false &&
        event.editAuthoritative === false &&
        event.invoked === false &&
        event.decision === "planning_only",
    ) &&
    cystAfterTrial.events?.some(
      (event) =>
        event.eventType === "write_escalation_blocked" &&
        event.descriptorId === mockWriteReply.task?.id &&
        event.errorCode === "MOCK_EVIDENCE_NON_AUTHORITATIVE" &&
        event.reasonCode === "mock_evidence_non_authoritative" &&
        event.blockLayer === "evidence" &&
        event.escalationTarget === "write_approval" &&
        event.escalationStage === "intent_detected" &&
        event.approvalState === "missing" &&
        event.adapterDecision === "not_invoked" &&
        event.invoked === false &&
        event.writeApprovalEligible === false &&
        event.applyEligible === false,
    ) &&
    mockWriteRetrievalIndex >= 0 &&
    mockWriteBlockIndex > mockWriteRetrievalIndex &&
    mockWriteLifecycleIndex > mockWriteBlockIndex;
  console.log(`${cystLifecyclePass ? "PASS" : "FAIL"} cyst: denial, trial, retrieval, and lifecycle events persisted`);
  if (!cystLifecyclePass) {
    failures.push({ name: "cyst lifecycle events" });
  }

  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  server.kill();
  extraServers.forEach((candidate) => candidate.kill?.());
  extraServers.forEach((candidate) => candidate.close?.());
  rmSync(runtimeDir, { recursive: true, force: true });
  extraRuntimeDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
}

function orderCystEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const timeDelta = cystEventTime(left.event) - cystEventTime(right.event);
      if (timeDelta) return timeDelta;
      const sequenceDelta = Number(left.event.cystSequence || 0) - Number(right.event.cystSequence || 0);
      if (sequenceDelta) return sequenceDelta;
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function cystEventTime(event) {
  const timestamp = Date.parse(event?.timestamp || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function verifyBackendBridge() {
  const backendPort = 4298;
  const bridgePort = 4299;
  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  const bridgeRuntimeDir = mkdtempSync(join(tmpdir(), "tripp-runtime-bridge-"));
  extraRuntimeDirs.push(bridgeRuntimeDir);

  const fakeBackend = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, { ok: true, name: "fake-goose-bridge" });
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/sessions/")) {
      const payload = await readRequestJson(request);
      sendJson(response, {
        messages: [
          {
            kind: "tool",
            speaker: "tripp.backend.tool>",
            tool: "filesystem_read",
            result: "backend tool event captured",
            status: "completed",
          },
          {
            kind: "agent",
            speaker: "tripp.backend>",
            body: `bridge received: ${payload.message}`,
          },
        ],
        tasks: [
          {
            id: "fake-backend-task",
            title: "Backend supplied task",
            kind: "backend_tool",
            tool: "filesystem_read",
            status: "completed",
            result: "Backend task event normalized.",
          },
        ],
        usage: {
          inputTokens: String(payload.message || "").length,
          outputTokens: 17,
        },
      });
      return;
    }

    sendJson(response, { error: "not found" }, 404);
  });
  await listen(fakeBackend, backendPort);
  extraServers.push(fakeBackend);

  const bridgeServer = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(bridgePort),
      TRIPP_RUNTIME_DIR: bridgeRuntimeDir,
      TRIPP_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      TRIPP_ENABLE_BACKEND_REPLY: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  extraServers.push(bridgeServer);

  await waitForServer(bridgeUrl);
  const status = await getJson("/api/tripp/backend/status", bridgeUrl);
  const created = await postJson("/api/tripp/sessions", {}, bridgeUrl);
  const reply = await postJson(
    "/api/tripp/reply",
    { prompt: "backend contract smoke", mode: "CHAT", sessionId: created.session.id },
    bridgeUrl,
  );
  const bootstrap = await getJson("/api/tripp/bootstrap", bridgeUrl);
  const taskSnapshot = await getJson("/api/tripp/tasks", bridgeUrl);
  const persisted = bootstrap.sessions.find((session) => session.id === created.session.id);
  const pass =
    status.reachable === true &&
    reply.status?.model === "tripp-adapter/backend" &&
    reply.messages?.some((message) => message.body === "bridge received: backend contract smoke") &&
    reply.tasks?.some((task) => task.origin === "backend" && task.agentId === "tripp.drone.one") &&
    taskSnapshot.tasks?.some((task) => task.origin === "backend" && task.agentId === "tripp.drone.one") &&
    persisted?.transcript?.some((message) => message.body === "bridge received: backend contract smoke");
  console.log(`${pass ? "PASS" : "FAIL"} backend bridge: health -> reply -> persisted transcript`);
  return pass;
}

async function waitForServer(url = baseUrl) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch(`${url}/api/tripp/bootstrap`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }

  throw new Error("Timed out waiting for verification server.");
}

async function postJson(path, body, url = baseUrl) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

async function getJson(path, url = baseUrl) {
  const response = await fetch(`${url}${path}`);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

async function getText(path, url = baseUrl) {
  const response = await fetch(`${url}${path}`);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.text();
}

function listen(serverToStart, serverPort) {
  return new Promise((resolve) => {
    serverToStart.listen(serverPort, "127.0.0.1", resolve);
  });
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readRequestJson(request) {
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
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
