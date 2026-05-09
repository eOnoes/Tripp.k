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
  const readinessScoreboard = readFileSync(new URL("../docs/tripp-readiness-scoreboard-v0.1.md", import.meta.url), "utf8");
  const betaRegressionHarness = readFileSync(new URL("../docs/read-only-beta-regression-harness-v0.1.md", import.meta.url), "utf8");
  const betaReleaseNotes = readFileSync(new URL("../docs/read-only-beta-release-v0.1.md", import.meta.url), "utf8");
  const sessionVarietyPack = readFileSync(new URL("../docs/read-only-session-variety-pack-v0.1.md", import.meta.url), "utf8");
  const partialEvidenceSynthesis = readFileSync(new URL("../docs/read-only-partial-evidence-synthesis-v0.1.md", import.meta.url), "utf8");
  const readOnly85MilestoneCard = readFileSync(new URL("../docs/read-only-85-percent-milestone-card-v0.1.md", import.meta.url), "utf8");
  const post85Roadmap = readFileSync(new URL("../docs/read-only-post-85-roadmap-v0.1.md", import.meta.url), "utf8");
  const readOnly90Gate = readFileSync(new URL("../docs/read-only-90-percent-gate-v0.1.md", import.meta.url), "utf8");
  const longSessionStressDoc = readFileSync(new URL("../docs/read-only-long-session-stress-v0.1.md", import.meta.url), "utf8");
  const futureWriteContract = readFileSync(new URL("../docs/future-write-lifecycle-contract-v0.1.md", import.meta.url), "utf8");
  const readOnly80Gate = readFileSync(new URL("../docs/read-only-80-percent-gate-v0.1.md", import.meta.url), "utf8");
  const readOnly85Gate = readFileSync(new URL("../docs/read-only-85-percent-gate-v0.1.md", import.meta.url), "utf8");
  const conclusionSource = extractFunctionRange(appScript, "renderTaskConclusion", "renderWorkspace");
  const conclusionForbiddenTerms = [
    "approved",
    "approval-ready",
    "ready to edit",
    "ready to apply",
    "safe to modify",
    "verified target",
    "confirmed target",
    "execution-ready",
    "mutation-ready",
    "patch-ready",
    "apply-ready",
    "authorized change",
    "can now edit",
    "can proceed to write",
    "trusted for writes",
    "edit-capable",
    "apply-capable",
    "validated for changes",
  ];
  const conclusionCopyGuardPass =
    conclusionSource.includes("renderTaskConclusion") &&
    conclusionSource.includes("buildTaskConclusion") &&
    conclusionForbiddenTerms.every((term) => !conclusionSource.toLowerCase().includes(term)) &&
    !/nextStep:\s*["'`][^"'`]*(?:edit|apply|write|patch|approve|commit)/i.test(conclusionSource);
  const continuitySource = extractFunctionRange(appScript, "renderPlanningSummary", "renderTaskConclusion");
  const continuityCopyGuardPass =
    continuitySource.includes("What we know") &&
    continuitySource.includes("What remains uncertain") &&
    continuitySource.includes("Blocked in read-only mode") &&
    continuitySource.includes("Next read-only direction") &&
    continuitySource.includes("non-authoritative for file changes") &&
    conclusionForbiddenTerms.every((term) => !continuitySource.toLowerCase().includes(term)) &&
    !/\b(?:correct path|verified ownership|exclusive control|confirmed answer|invalid branch)\b/i.test(continuitySource) &&
    !/next:\s*[^,]+(?:edit|apply|write|patch|approve|commit)/i.test(continuitySource);
  const gateTaskSource = extractFunctionRange(appScript, "formatGateVerdict", "renderAdapterEvidence");
  const gateCystSource = extractFunctionRange(appScript, "gateRunCompact", "renderCystEvidenceMeta");
  const crossSurfaceReadOnlyCoherencePass =
    gateTaskSource.includes("All required read-only scenarios passed") &&
    gateTaskSource.includes("Read-only gate failed one or more required checks") &&
    gateCystSource.includes("READ-ONLY GATE") &&
    continuitySource.includes("Blocked in read-only mode") &&
    continuitySource.includes("What remains uncertain") &&
    conclusionSource.includes("non-authoritative for file changes") &&
    [conclusionSource, continuitySource, gateTaskSource, gateCystSource].every((source) =>
      conclusionForbiddenTerms.every((term) => !source.toLowerCase().includes(term)),
    ) &&
    !/GO[^"'`]*\b(?:edit|apply|write|build|patch|approve|commit)\b/i.test(gateTaskSource + gateCystSource) &&
    !/\b(?:verified|confirmed|validated|implementation-ready|build-ready)\b/i.test(conclusionSource + continuitySource + gateTaskSource);
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
    appHtml.includes("planningSummary") &&
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
    appScript.includes("renderTaskConclusion") &&
    appScript.includes("buildTaskConclusion") &&
    appScript.includes("renderPlanningSummary") &&
    appScript.includes("buildPlanningSummary") &&
    appScript.includes("isGateBranchRetrieval") &&
    appScript.includes("isDocsRuntimeBranchRetrieval") &&
    appScript.includes("isCystRenderingBranchRetrieval") &&
    appScript.includes("isBlockedOutcomeRecoveryRetrieval") &&
    appScript.includes("isEnforcementBranchRetrieval") &&
    appScript.includes("Current Understanding") &&
    appScript.includes("recent read-only tasks") &&
    appScript.includes("No read-only findings yet") &&
    appScript.includes("What we know") &&
    appScript.includes("What remains uncertain") &&
    appScript.includes("Blocked in read-only mode") &&
    appScript.includes("Next read-only direction") &&
    appScript.includes("olderRelevantTasks") &&
    appScript.includes("Earlier branch context remains available but is outside the most recent task window.") &&
    appScript.includes("Earlier blocked read-only outcome remains relevant.") &&
    appScript.includes("Planning-only retrieval suggested docs/config guidance and runtime implementation as plausible review paths.") &&
    appScript.includes("Inspection of README.md provided useful docs/config context for read-only review.") &&
    appScript.includes("Inspection of server.mjs provided useful runtime implementation context for read-only review.") &&
    appScript.includes("The initial docs/config and runtime branch suggestions came from planning-only retrieval and remain non-authoritative.") &&
    appScript.includes("Current findings compare usefulness for read-only review, not final ownership or final implementation control.") &&
    appScript.includes("Current review is centered on the runtime-handling branch, which now provides the most useful context for the active question.") &&
    appScript.includes("Earlier UI/result-display inspection remains relevant as background context.") &&
    appScript.includes("Some earlier and newly suggested paths have not been reviewed directly in the current session.") &&
    appScript.includes("The current summary reflects the most useful reviewed context so far, but remains incomplete.") &&
    appScript.includes("Repeated write-like shell or escalation paths remained blocked to preserve read-only mode.") &&
    appScript.includes("No write-capable route was used during the session.") &&
    appScript.includes("Inspect the next related runtime source to reduce the remaining uncertainty.") &&
    appScript.includes("Planning-only retrieval suggested additional paths that remain non-authoritative.") &&
    appScript.includes("Only part of the current question has been inspected directly.") &&
    appScript.includes("Current findings are useful for read-only review but remain incomplete.") &&
    appScript.includes("Inspect the next related source to clarify the remaining uncertainty.") &&
    appScript.includes("Continue from the currently more useful docs/config or runtime branch and inspect the next related source if more clarification is needed.") &&
    appScript.includes("Two plausible review paths emerged from planning-only retrieval.") &&
    appScript.includes("Inspection of server.mjs provided stronger direct context for the current gate question.") &&
    appScript.includes("Inspection of script.js added result-display context, but was less central to the current gate question.") &&
    appScript.includes("The initial branch suggestions came from planning-only retrieval and remain non-authoritative.") &&
    appScript.includes("The current branch ranking reflects usefulness for review, not final certainty.") &&
    appScript.includes("The UI branch improved presentation context, but additional review may still be needed to fully connect display behavior to gate results.") &&
    appScript.includes("Continue from the backend branch and inspect the next related source if more gate detail is needed.") &&
    appScript.includes("Planning-only retrieval suggested backend/gate and UI/result-display review paths.") &&
    appScript.includes("server.mjs inspection provided backend event-source context for read-only review.") &&
    appScript.includes("Inspection of script.js provided more useful context for the current Cyst activity rendering question.") &&
    appScript.includes("server.mjs remains useful for backend event context, but is less central to the current rendering question.") &&
    appScript.includes("Continue from the UI rendering branch and inspect the next related source if more display detail is needed.") &&
    appScript.includes("Earlier inspection of the UI branch provided useful presentation context for blocked outcomes.") &&
    appScript.includes("Later inspection of the runtime-handling branch provided more useful context for how blocked outcomes are handled in the current harness.") &&
    appScript.includes("The current interpretation changed after additional inspection and remains scoped to read-only review.") &&
    appScript.includes("Presentation behavior may still depend on additional related files beyond the current runtime path.") &&
    appScript.includes("Continue from the runtime-handling branch and inspect the next related source if more clarification is needed.") &&
    appScript.includes("Planning-only retrieval suggested policy-denial and adapter-route handling as plausible review paths.") &&
    appScript.includes("Inspection of the policy branch provided useful context for read-only denial behavior.") &&
    appScript.includes("Inspection of the adapter branch provided useful context for how blocked routes are handled in the current harness.") &&
    appScript.includes("The current branch ranking reflects usefulness for the blocked-behavior question, not final enforcement certainty.") &&
    appScript.includes("Both policy and adapter behavior may contribute, even if one branch is currently more useful for review.") &&
    appScript.includes("Continue from the currently more useful enforcement branch and inspect the next related source if more clarification is needed.") &&
    appScript.includes("A write-like shell or escalation path was blocked to preserve read-only mode.") &&
    appScript.includes("This file provides backend/runtime context for read-only review.") &&
    appScript.includes("This file provides UI/result-display context for read-only review.") &&
    continuityCopyGuardPass &&
    crossSurfaceReadOnlyCoherencePass &&
    appScript.includes("Continue read-only planning and review.") &&
    appScript.includes("What We Learned") &&
    appScript.includes("Next safe step") &&
    conclusionCopyGuardPass &&
    appScript.includes("Read-only inspection") &&
    appScript.includes("Mock evidence - planning only") &&
    appScript.includes("non-authoritative for file changes") &&
    appScript.includes("continue read-only narrowing") &&
    appScript.includes("Safe shell output") &&
    appScript.includes("Read-only policy block") &&
    appScript.includes("renderGoNoGoSummary") &&
    appScript.includes("formatGateDiagnosticLine") &&
    appScript.includes("renderGateBlockingReasons") &&
    appScript.includes("formatGateVerdict") &&
    appScript.includes("formatGateSummary") &&
    appScript.includes("formatGatePassCount") &&
    appScript.includes("formatScenarioName") &&
    appScript.includes("All required read-only scenarios passed") &&
    appScript.includes("Read-only gate failed one or more required checks") &&
    appScript.includes("Blocking Reasons") &&
    appScript.includes("Malformed mixed:") &&
    appScript.includes("formatTrialExpected") &&
    appScript.includes("formatTrialRoute") &&
    appScript.includes("formatTrialCystTypes") &&
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
    appCss.includes(".read-only-summary") &&
    appCss.includes(".go-no-go") &&
    appCss.includes(".go-no-go.no_go") &&
    appCss.includes(".go-no-go small + small") &&
    readinessScoreboard.includes("Primary read-only console beta") &&
    readinessScoreboard.includes("Replace Goose for structured/moderately ambiguous read-only planning/review") &&
    readinessScoreboard.includes("Replace Goose for edit/build work") &&
    readinessScoreboard.includes("90-93%") &&
    readinessScoreboard.includes("85%") &&
    readinessScoreboard.includes("35-45%") &&
    readinessScoreboard.includes("Replace Goose for structured/moderately ambiguous read-only planning/review: 85%.") &&
    readinessScoreboard.includes("broader structured and moderately ambiguous read-only planning/review workflows across multiple session shapes") &&
    readinessScoreboard.includes("pack-level operator-independence evidence within the current beta harness scope") &&
    readinessScoreboard.includes("Session variety pack harness passes.") &&
    readinessScoreboard.includes("Partial-evidence synthesis harness passes.") &&
    readinessScoreboard.includes("Operator-independence pack artifact passes.") &&
    readinessScoreboard.includes("does not include edit/build replacement, live writes, approval/apply workflows, or broad Goose parity") &&
    readinessScoreboard.includes("Edit/build replacement remains a separate milestone.") &&
    readinessScoreboard.includes("Current write lifecycle work is design-only") &&
    readinessScoreboard.includes("No runtime mutation path is enabled.") &&
    readinessScoreboard.includes("No approval/apply runtime behavior is enabled.") &&
    readinessScoreboard.includes("docs/read-only-post-85-roadmap-v0.1.md") &&
    readinessScoreboard.includes("Evidence Required To Keep The 85% Claim") &&
    readinessScoreboard.includes("85% Claim Invalidation") &&
    !/\b(?:imminent|unlocked|ready for next phase|nearly replaces Goose|Goose-equivalent|autonomous reviewer|implementation-ready|edit-ready|write-ready)\b/i.test(readinessScoreboard) &&
    readinessScoreboard.includes("Mixed-session acceptance now includes inspect, mock retrieval, follow-up inspect, safe shell, blocked shell, and gate review.") &&
    readinessScoreboard.includes("Multi-branch ambiguity acceptance now keeps backend and UI branches visible, ranks by usefulness, preserves mock uncertainty, and keeps blocked outcomes visible.") &&
    readinessScoreboard.includes("Branch-reversal acceptance now shows Tripp can reorient toward a more useful branch without erasing the earlier branch.") &&
    readinessScoreboard.includes("Contradiction-recovery acceptance now shows Tripp can update interpretation from later read-only evidence without calling earlier context wrong.") &&
    readinessScoreboard.includes("Warden-vs-adapter ambiguity acceptance now proves a distinct enforcement-boundary ambiguity shape.") &&
    readinessScoreboard.includes("Longer-session repeatability acceptance now covers inspection, retrieval, analysis, safe shell, blocked shell, git status, and gate review.") &&
    readinessScoreboard.includes("Operator-independence artifact now proves the beta harness can answer inspected, learned, uncertain, blocked, and next-direction questions without normal UI clutter.") &&
    readinessScoreboard.includes("Branch ranking stays based on usefulness, not truth or verification.") &&
    readinessScoreboard.includes("Operator-independence artifact passes.") &&
    readinessScoreboard.includes("Longer-session repeatability harness passes.") &&
    readinessScoreboard.includes("Gate GO means read-only harness readiness only") &&
    betaRegressionHarness.includes("Read-Only Beta Regression Harness v0.1") &&
    betaRegressionHarness.includes("Operator-Independence Questions") &&
    betaRegressionHarness.includes("Multi-Branch Ambiguity Session") &&
    betaRegressionHarness.includes("Branch Reversal Session") &&
    betaRegressionHarness.includes("Contradiction Recovery Session") &&
    betaRegressionHarness.includes("Warden-vs-Adapter Ambiguity Session") &&
    betaRegressionHarness.includes("Longer Repeatability Session") &&
    betaRegressionHarness.includes("TASKS, Current Understanding, and Cyst materially contradict each other") &&
    betaRegressionHarness.includes("Gate GO means read-only harness readiness only") &&
    betaRegressionHarness.includes("primary read-only beta acceptance flow") &&
    betaRegressionHarness.includes("multi-branch read-only ambiguity acceptance flow") &&
    betaRegressionHarness.includes("branch reversal read-only acceptance flow") &&
    betaRegressionHarness.includes("contradiction recovery read-only acceptance flow") &&
    betaRegressionHarness.includes("Warden-vs-adapter ambiguity acceptance flow") &&
    betaRegressionHarness.includes("longer read-only repeatability acceptance flow") &&
    betaRegressionHarness.includes("Branch Rolloff Session") &&
    betaRegressionHarness.includes("branch rolloff read-only acceptance flow") &&
    betaRegressionHarness.includes("Session Variety Pack") &&
    betaRegressionHarness.includes("docs/config vs runtime read-only acceptance flow") &&
    betaRegressionHarness.includes("Operator-Independence Artifact") &&
    betaRegressionHarness.includes("artifactType: \"operator_independence_check\"") &&
    betaRegressionHarness.includes("checks.understandableWithoutSidecar") &&
    betaRegressionHarness.includes("The artifact must not render in normal product UI, Current Understanding, or Cyst.") &&
    betaRegressionHarness.includes("operator independence artifact") &&
    betaRegressionHarness.includes("Release Discipline") &&
    betaRegressionHarness.includes("docs/read-only-beta-release-v0.1.md") &&
    betaRegressionHarness.includes("no live writes") &&
    betaRegressionHarness.includes("no approval/apply capability") &&
    betaRegressionHarness.includes("no edit/build replacement claim") &&
    betaRegressionHarness.includes("scoped beta release artifact checks") &&
    betaReleaseNotes.includes("Read-Only Beta Release Notes v0.1") &&
    betaReleaseNotes.includes("scoped beta release artifact") &&
    betaReleaseNotes.includes("Tripp.g is currently a scoped read-only beta for structured and moderately ambiguous planning/review workflows.") &&
    betaReleaseNotes.includes("This beta covers structured and moderately ambiguous read-only planning/review workflows.") &&
    betaReleaseNotes.includes("TASKS conclusions for completed read-only work") &&
    betaReleaseNotes.includes("Current Understanding synthesis for recent read-only session context") &&
    betaReleaseNotes.includes("Cyst audit timeline for activity truth") &&
    betaReleaseNotes.includes("Formal Read-Only Gate review with GO / NO GO scoped to harness readiness") &&
    betaReleaseNotes.includes("Current behavior is read-only.") &&
    betaReleaseNotes.includes("Current behavior is read-only. Tripp.g does not enable live writes, edit/build workflows, or approval/apply flows in this beta.") &&
    betaReleaseNotes.includes("No runtime mutation path is enabled.") &&
    betaReleaseNotes.includes("No approval/apply capability exists in this beta.") &&
    betaReleaseNotes.includes("Gate GO means read-only harness readiness only.") &&
    betaReleaseNotes.includes("Gate GO does not imply write readiness, edit readiness, approval readiness, or implementation readiness.") &&
    betaReleaseNotes.includes("Read-Only Gate GO / NO GO reflects current read-only harness readiness only. It does not imply edit readiness, approval readiness, or write capability.") &&
    betaReleaseNotes.includes("Mock or planning-only evidence is non-authoritative and cannot authorize file changes.") &&
    betaReleaseNotes.includes("Mock or planning-only retrieval is non-authoritative. It can support review and narrowing, but it cannot authorize file changes.") &&
    betaReleaseNotes.includes("Current readiness applies only to structured/moderately ambiguous read-only planning/review. It does not claim broad Goose parity or implementation replacement.") &&
    betaReleaseNotes.includes("TASKS provides per-task conclusions and outcome interpretation.") &&
    betaReleaseNotes.includes("Current Understanding summarizes the recent read-only planning thread.") &&
    betaReleaseNotes.includes("Cyst records audit/timeline truth and blocked/allowed event history.") &&
    betaReleaseNotes.includes("Read-Only Gate reports formal read-only harness status.") &&
    betaReleaseNotes.includes("Current Understanding: read what Tripp currently knows, what remains uncertain, what is blocked, and the next read-only direction.") &&
    betaReleaseNotes.includes("Cyst: review audit truth and event ordering only; Cyst is not the conclusion surface.") &&
    betaReleaseNotes.includes("operator-independence artifact is acceptance evidence") &&
    betaReleaseNotes.includes("This beta does not include live writes, edit/build replacement, approval/apply capability, or general reasoning parity with Goose.") &&
    betaReleaseNotes.includes("beta_release_notes_include_readonly_only_scope") &&
    betaReleaseNotes.includes("beta_release_notes_include_scoped_readonly_beta_statement") &&
    betaReleaseNotes.includes("beta_release_notes_list_included_readonly_surfaces_and_flows") &&
    betaReleaseNotes.includes("beta_release_notes_exclude_edit_build_and_live_write_claims") &&
    betaReleaseNotes.includes("beta_known_limitations_include_no_live_writes_and_no_edit_build_replacement") &&
    betaReleaseNotes.includes("known_limitations_include_readonly_only_scope") &&
    betaReleaseNotes.includes("known_limitations_include_no_live_writes_and_no_approval_apply") &&
    betaReleaseNotes.includes("known_limitations_include_mock_evidence_non_authoritative_disclaimer") &&
    betaReleaseNotes.includes("known_limitations_include_no_edit_build_replacement_claim") &&
    betaReleaseNotes.includes("beta_docs_state_mock_evidence_is_non_authoritative") &&
    betaReleaseNotes.includes("beta_gate_go_does_not_imply_write_readiness") &&
    betaReleaseNotes.includes("beta_operator_usage_note_keeps_cyst_as_audit_truth") &&
    betaReleaseNotes.includes("operator_usage_note_assigns_tasks_as_interpretation_surface") &&
    betaReleaseNotes.includes("operator_usage_note_assigns_current_understanding_as_session_synthesis_surface") &&
    betaReleaseNotes.includes("operator_usage_note_assigns_cyst_as_audit_timeline_only") &&
    betaReleaseNotes.includes("operator_usage_note_assigns_gate_as_readonly_harness_check_only") &&
    betaReleaseNotes.includes("beta_wording_does_not_imply_general_goose_replacement") &&
    betaReleaseNotes.includes("beta_docs_do_not_use_write_readiness_language") &&
    betaReleaseNotes.includes("beta_docs_do_not_use_broad_goose_replacement_language") &&
    betaReleaseNotes.includes("beta_docs_do_not_overstate_gate_go_scope") &&
    betaReleaseNotes.includes("beta_docs_do_not_overstate_mock_or_planning_only_evidence") &&
    betaReleaseNotes.includes("beta_artifacts_require_scoped_readonly_statement_before_beta_label") &&
    betaReleaseNotes.includes("beta_artifacts_require_known_limitations_before_beta_label") &&
    betaReleaseNotes.includes("beta_artifacts_require_gate_go_no_go_disclaimer_before_beta_label") &&
    betaReleaseNotes.includes("beta_artifacts_require_mock_evidence_disclaimer_before_beta_label") &&
    sessionVarietyPack.includes("Read-Only Session Variety Pack v0.1") &&
    sessionVarietyPack.includes("This document does not change the current 80% read-only Goose replacement estimate") &&
    sessionVarietyPack.includes("Scenario A: Docs/Config vs Runtime Implementation") &&
    sessionVarietyPack.includes("Scenario B: Warden vs Adapter/Tool-Route") &&
    sessionVarietyPack.includes("Scenario C: Longer Session With Aging Context") &&
    sessionVarietyPack.includes("docs/config and runtime implementation remain plausible review paths") &&
    sessionVarietyPack.includes("mock retrieval remains non-authoritative") &&
    sessionVarietyPack.includes("blocked outcome remains visible") &&
    sessionVarietyPack.includes("all sessions stay coherent across TASKS, Current Understanding, and Cyst") &&
    sessionVarietyPack.includes("session_variety_pack_covers_multiple_distinct_readonly_planning_shapes") &&
    sessionVarietyPack.includes("docs_config_vs_runtime_session_remains_self_explanatory") &&
    sessionVarietyPack.includes("partial_evidence_does_not_overclaim_across_varied_sessions") &&
    sessionVarietyPack.includes("cross_surface_coherence_holds_across_varied_session_pack") &&
    partialEvidenceSynthesis.includes("Read-Only Partial Evidence Synthesis v0.1") &&
    partialEvidenceSynthesis.includes("This document does not change the current 80% read-only Goose replacement estimate") &&
    partialEvidenceSynthesis.includes("What we know = direct, bounded, observed read-only context only.") &&
    partialEvidenceSynthesis.includes("What remains uncertain = mock retrieval implications, uninspected branches, partial coverage, and possible reorientation.") &&
    partialEvidenceSynthesis.includes("Planning-only retrieval suggested additional paths that remain non-authoritative.") &&
    partialEvidenceSynthesis.includes("Only part of the current question has been inspected directly.") &&
    partialEvidenceSynthesis.includes("Current findings are useful for read-only review but remain incomplete.") &&
    partialEvidenceSynthesis.includes("A write-like shell or escalation path remains blocked in the current read-only session.") &&
    partialEvidenceSynthesis.includes("Inspect the next related source to clarify the remaining uncertainty.") &&
    partialEvidenceSynthesis.includes("single_branch_partial_evidence_stays_useful_but_incomplete") &&
    partialEvidenceSynthesis.includes("what_we_know_uses_only_directly_inspected_context_under_partial_evidence") &&
    partialEvidenceSynthesis.includes("partial_evidence_copy_does_not_overclaim") &&
    readOnly85MilestoneCard.includes("85% Read-Only Planning/Review Readiness Milestone Card v0.1") &&
    readOnly85MilestoneCard.includes("This does not change the current 80% read-only Goose replacement estimate") &&
    readOnly85MilestoneCard.includes("This milestone defines a future gate beyond the current 80% readiness level.") &&
    readOnly85MilestoneCard.includes("Structured and moderately ambiguous read-only planning/review only.") &&
    readOnly85MilestoneCard.includes("This milestone does not include edit/build replacement, live writes, approval/apply runtime behavior, or broad Goose parity.") &&
    readOnly85MilestoneCard.includes("Session variety pack passes across at least three distinct read-only scenario families.") &&
    readOnly85MilestoneCard.includes("Partial-evidence synthesis remains useful without overclaiming.") &&
    readOnly85MilestoneCard.includes("Branch rolloff preserves relevant older context while keeping current direction primary.") &&
    readOnly85MilestoneCard.includes("Operator-independence pack artifact passes across the full variety pack.") &&
    readOnly85MilestoneCard.includes("edit/build replacement") &&
    readOnly85MilestoneCard.includes("live writes") &&
    readOnly85MilestoneCard.includes("approval/apply runtime behavior") &&
    readOnly85MilestoneCard.includes("broad Goose parity") &&
    readOnly85MilestoneCard.includes("eighty_five_percent_requires_full_session_variety_pack_pass") &&
    readOnly85MilestoneCard.includes("eighty_five_percent_card_is_future_gate_not_current_state") &&
    readOnly85MilestoneCard.includes("eighty_five_percent_card_includes_scope_statement") &&
    readOnly85MilestoneCard.includes("eighty_five_percent_card_includes_blockers_and_invalidation_conditions") &&
    readOnly85MilestoneCard.includes("eighty_five_percent_requires_operator_independence_artifact_across_pack") &&
    post85Roadmap.includes("Post-85 Read-Only Roadmap v0.1") &&
    post85Roadmap.includes("does not enable runtime writes or change the current scoped 85% read-only planning/review readiness estimate") &&
    post85Roadmap.includes("Tripp.g is at 85% for structured and moderately ambiguous read-only planning/review only.") &&
    post85Roadmap.includes("90% Read-Only Planning/Review Readiness") &&
    post85Roadmap.includes("broader everyday read-only sessions") &&
    post85Roadmap.includes("8 to 12+ read-only tasks") &&
    post85Roadmap.includes("Future write design remains docs-only") &&
    post85Roadmap.includes("Keep edit/build replacement as a separate milestone.") &&
    post85Roadmap.includes("ninety_percent_gate_requires_broader_readonly_session_pack") &&
    post85Roadmap.includes("ninety_percent_gate_requires_deeper_partial_evidence_synthesis_quality") &&
    post85Roadmap.includes("ninety_percent_gate_requires_long_session_stability") &&
    post85Roadmap.includes("future_write_design_docs_do_not_change_readonly_runtime_scope") &&
    post85Roadmap.includes("scoreboard_keeps_readonly_and_edit_build_readiness_as_distinct_tracks") &&
    readOnly90Gate.includes("Read-Only 90 Percent Gate v0.1") &&
    readOnly90Gate.includes("does not change the current scoped 85% read-only planning/review readiness estimate") &&
    readOnly90Gate.includes("Structured, moderately ambiguous, and broader everyday read-only planning/review workflows only.") &&
    readOnly90Gate.includes("more than three scenario families") &&
    readOnly90Gate.includes("at least four distinct read-only scenario families") &&
    readOnly90Gate.includes("at least one broader everyday mixed session without a tightly curated branch question") &&
    readOnly90Gate.includes("at least one 8 to 12+ task read-only session") &&
    readOnly90Gate.includes("multiple blocked outcomes") &&
    readOnly90Gate.includes("pack-level artifact includes the long-session stress flow") &&
    readOnly90Gate.includes("long-session stress is a required scenario in the broadened pack") &&
    readOnly90Gate.includes("long-session scenario includes continuity reconstruction and branch-shift checks") &&
    readOnly90Gate.includes("Cyst remains audit/timeline truth only") &&
    readOnly90Gate.includes("ninety_percent_requires_minimum_four_distinct_readonly_scenario_families") &&
    readOnly90Gate.includes("ninety_percent_requires_ten_task_or_longer_stress_scenario") &&
    readOnly90Gate.includes("ninety_percent_requires_broadened_operator_independence_pack_artifact") &&
    readOnly90Gate.includes("long_session_stress_is_included_in_required_pack_scenarios_for_ninety_percent") &&
    readOnly90Gate.includes("ninety_percent_gate_requires_long_session_stress_pass") &&
    readOnly90Gate.includes("ninety_percent_claim_is_invalidated_by_scope_or_cross_surface_regression") &&
    longSessionStressDoc.includes("Read-Only Long-Session Stress v0.1") &&
    longSessionStressDoc.includes("10-task read-only session") &&
    longSessionStressDoc.includes("Trigger blocked shell or escalation for the first blocked outcome.") &&
    longSessionStressDoc.includes("Trigger blocked shell or escalation again for the second blocked outcome.") &&
    longSessionStressDoc.includes("Current Understanding remains compact and coherent") &&
    longSessionStressDoc.includes("operator can reconstruct the session from Tripp surfaces without Goose help") &&
    longSessionStressDoc.includes("long_session_stress_preserves_compact_current_understanding_over_ten_tasks") &&
    longSessionStressDoc.includes("operator_can_reconstruct_long_session_without_sidecar_help") &&
    !/\b(?:write support in progress|mutation path exists but is blocked|nearly ready for implementation|edit-ready|next phase)\b/i.test(post85Roadmap + readinessScoreboard) &&
    futureWriteContract.includes("Future Write Lifecycle Contract v0.1") &&
    futureWriteContract.includes("design-only contract") &&
    futureWriteContract.includes("This document must not enable live mutation paths.") &&
    futureWriteContract.includes("This contract is design-only and is not active in the current read-only harness.") &&
    futureWriteContract.includes("No runtime mutation path is enabled by this document.") &&
    futureWriteContract.includes("Current behavior remains read-only.") &&
    futureWriteContract.includes("This document does not change runtime permissions or enable writes.") &&
    futureWriteContract.includes("Warden remains default-deny for every mutation-capable path.") &&
    futureWriteContract.includes("Mock or planning-only evidence can never authorize file changes.") &&
    futureWriteContract.includes("Mock or planning-only evidence is never sufficient for write approval or apply authorization.") &&
    futureWriteContract.includes("Future Review / Approve / Apply Split") &&
    futureWriteContract.includes("Review, approve, and apply are separate future stages and are not currently enabled.") &&
    futureWriteContract.includes("review does not authorize writes.") &&
    futureWriteContract.includes("approve does not execute writes.") &&
    futureWriteContract.includes("apply cannot proceed from mock or planning-only evidence.") &&
    futureWriteContract.includes("approval is bound to a preview fingerprint") &&
    futureWriteContract.includes("stale approval blocks apply") &&
    futureWriteContract.includes("write_intent_received") &&
    futureWriteContract.includes("write_authorization_denied") &&
    futureWriteContract.includes("patch_preview_generated") &&
    futureWriteContract.includes("approval_recorded") &&
    futureWriteContract.includes("stale_check_performed") &&
    futureWriteContract.includes("apply_requested") &&
    futureWriteContract.includes("apply_succeeded") &&
    futureWriteContract.includes("apply_failed") &&
    futureWriteContract.includes("These are future placeholders only. They are not currently emitted as runtime mutation events.") &&
    futureWriteContract.includes("Explicitly Out Of Scope Now") &&
    futureWriteContract.includes("live file mutation") &&
    readOnly80Gate.includes("Read-Only 80 Percent Gate v0.1") &&
    readOnly80Gate.includes("does not change the current 75% read-only Goose replacement estimate") &&
    readOnly80Gate.includes("Required Proof Before 80%") &&
    readOnly80Gate.includes("Branch reversal proof") &&
    readOnly80Gate.includes("Repeated ambiguity proof") &&
    readOnly80Gate.includes("Warden-vs-adapter ambiguity acceptance lane passes") &&
    readOnly80Gate.includes("Contradiction and safe recovery proof") &&
    readOnly80Gate.includes("new read-only evidence can reduce confidence in an earlier synthesis without calling it wrong") &&
    readOnly80Gate.includes("runtime acceptance lane passes") &&
    readOnly80Gate.includes("Longer-session repeatability") &&
    readOnly80Gate.includes("Operator-independence proof") &&
    readOnly80Gate.includes("generated beta harness artifact passes and does not render in normal product UI") &&
    readOnly80Gate.includes("contradiction recovery is missing or only documented without acceptance proof") &&
    readOnly80Gate.includes("operator-independence artifact is missing, failing, or presented as product certification") &&
    readOnly80Gate.includes("contradiction_recovery_updates_synthesis_without_calling_earlier_context_wrong") &&
    readOnly80Gate.includes("operator_independence_artifact_has_required_schema") &&
    readOnly80Gate.includes("operator_independence_artifact_does_not_render_in_normal_product_ui") &&
    readOnly80Gate.includes("Still Out Of Scope At 80%") &&
    readOnly80Gate.includes("edit/build replacement") &&
    readOnly80Gate.includes("live file mutation") &&
    readOnly85Gate.includes("Read-Only 85 Percent Gate v0.1") &&
    readOnly85Gate.includes("does not change the current 80% read-only Goose replacement estimate") &&
    readOnly85Gate.includes("Required Proof Before 85%") &&
    readOnly85Gate.includes("Broader read-only session variety") &&
    readOnly85Gate.includes("docs/config vs runtime implementation acceptance lane passes") &&
    readOnly85Gate.includes("operator-independence pack artifact covers all required variety-pack scenario families") &&
    readOnly85Gate.includes("Branch rolloff proof") &&
    readOnly85Gate.includes("older blocked read-only outcomes remain visible longer than ordinary findings") &&
    readOnly85Gate.includes("runtime acceptance lane passes") &&
    readOnly85Gate.includes("Synthesis quality under partial evidence") &&
    readOnly85Gate.includes("partial evidence synthesis contract passes") &&
    readOnly85Gate.includes("single-branch evidence is treated as enough to settle a multi-branch question") &&
    readOnly85Gate.includes("operator-independence pack artifact passes while any required scenario family fails") &&
    readOnly85Gate.includes("single_branch_partial_evidence_stays_useful_but_incomplete") &&
    readOnly85Gate.includes("what_we_know_uses_only_directly_inspected_context_under_partial_evidence") &&
    readOnly85Gate.includes("operator_independence_pack_artifact_requires_all_scenario_families") &&
    readOnly85Gate.includes("operator_pack_artifact_contains_required_scenario_ids_and_results") &&
    readOnly85Gate.includes("operator_pack_artifact_overall_status_matches_scenario_level_results") &&
    readOnly85Gate.includes("operator_independence_pack_artifact_fails_if_any_required_scenario_fails") &&
    readOnly85Gate.includes("eighty_five_percent_requires_operator_independence_artifact_across_pack") &&
    readOnly85Gate.includes("Beta release discipline") &&
    readOnly85Gate.includes("beta label does not imply edit/build replacement, approval/apply capability, or broad Goose parity") &&
    readOnly85Gate.includes("release language implies approval/apply capability or broad Goose replacement") &&
    readOnly85Gate.includes("Branch Rolloff Policy") &&
    readOnly85Gate.includes("branch_rolloff_keeps_older_blocked_readonly_outcomes_visible") &&
    readOnly85Gate.includes("session_variety_pack_covers_multiple_distinct_readonly_planning_shapes") &&
    readOnly85Gate.includes("docs_config_vs_runtime_session_remains_self_explanatory") &&
    serverSource.includes("cystSequence") &&
    serverSource.includes("nextCystSequence") &&
    serverSource.includes("recordRetrievalEvent(task.id") &&
    serverSource.includes("createReadOnlyGoNoGo") &&
    serverSource.includes("createReadOnlySuiteSummary") &&
    serverSource.includes("isCompleteReadOnlyScenario") &&
    serverSource.includes("missingReadOnlyScenarioFields") &&
    serverSource.includes("isValidMockEscalationScenario") &&
    serverSource.includes("malformedMockEscalationFields") &&
    serverSource.includes("createReadOnlyBlockingReasons") &&
    serverSource.includes("duplicateScenarioIds") &&
    serverSource.includes("duplicateScenarioCounts") &&
    serverSource.includes("malformedMixedScenarioIds") &&
    serverSource.includes("malformedMixedScenarioFields") &&
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
    trialRun.suiteSummary?.categories?.length === 7 &&
    trialRun.suiteSummary?.categories?.every((category) => category.pass === true) &&
    trialRun.suiteSummary?.missingScenarioIds?.length === 0 &&
    Array.isArray(trialRun.suiteSummary?.requiredScenarioIds) &&
    trialRun.suiteSummary?.requiredScenarioIds?.length === 5 &&
    Array.isArray(trialRun.suiteSummary?.presentScenarioIds) &&
    trialRun.suiteSummary?.presentScenarioIds?.length === 5 &&
    trialRun.suiteSummary?.duplicateScenarioIds?.length === 0 &&
    Object.keys(trialRun.suiteSummary?.duplicateScenarioCounts || {}).length === 0 &&
    trialRun.suiteSummary?.incompleteScenarioIds?.length === 0 &&
    Object.keys(trialRun.suiteSummary?.incompleteScenarioFields || {}).length === 0 &&
    trialRun.suiteSummary?.malformedMixedScenarioIds?.length === 0 &&
    Object.keys(trialRun.suiteSummary?.malformedMixedScenarioFields || {}).length === 0 &&
    trialRun.suiteSummary?.failedScenarioIds?.length === 0 &&
    trialRun.suiteSummary?.blockingReasons?.length === 0 &&
    trialRun.suiteSummary?.requiredScenarioCount === 5 &&
    trialRun.suiteSummary?.presentScenarioCount === 5 &&
    JSON.stringify(trialRun.trials) === JSON.stringify(trialRun.scenarioResults) &&
    trialRun.trials?.length === 6 &&
    trialRun.trials?.every((trial) => trial.status === "pass") &&
    trialRun.scenarioResults?.length === 6 &&
    trialRun.scenarioResults?.every(
      (scenario) =>
        scenario.scenarioId &&
        scenario.status === "pass" &&
        scenario.expected?.wardenResult &&
        scenario.actual?.wardenResult &&
        Object.hasOwn(scenario.expected || {}, "adapterRoute") &&
        Object.hasOwn(scenario.actual || {}, "adapterRoute") &&
        Object.hasOwn(scenario.expected || {}, "adapterInvoked") &&
        Object.hasOwn(scenario.actual || {}, "adapterInvoked") &&
        Array.isArray(scenario.expected?.cystEventTypes) &&
        Array.isArray(scenario.actual?.cystEventTypes) &&
        scenario.expected?.finalLifecycleState &&
        scenario.actual?.finalLifecycleState &&
        scenario.uiEvidenceLabel,
    ) &&
    ["readonly_retrieval_allowed", "readonly_inspect_allowed", "readonly_safe_shell_allowed", "readonly_unsafe_shell_blocked", "mock_retrieval_write_escalation_blocked"].every(
      (scenarioId) => trialRun.scenarioResults?.some((scenario) => scenario.scenarioId === scenarioId),
    ) &&
    trialRun.scenarioResults?.some(
      (scenario) => scenario.scenarioId === "readonly_unsafe_shell_blocked" && scenario.notes?.includes("GIT_WRITE_BLOCKED"),
    ) &&
    trialRun.scenarioResults?.some(
      (scenario) =>
        scenario.scenarioId === "mock_retrieval_write_escalation_blocked" &&
        scenario.expected?.adapterInvoked?.read === true &&
        scenario.expected?.adapterInvoked?.write === false &&
        Array.isArray(scenario.expected?.cystEventTypes) &&
        scenario.expected?.finalLifecycleState === "read_only_maintained" &&
        scenario.actual?.adapterInvoked?.read === true &&
        scenario.actual?.adapterInvoked?.write === false &&
        scenario.actual?.cystEventTypes?.includes("write_escalation_blocked") &&
        scenario.actual?.finalLifecycleState === "read_only_maintained",
    ) &&
    tasksAfterTrial.tasks?.some(
      (task) => task.id === trialRun.task?.id && task.title === "Read-Only Gate" && task.status === "completed" && task.goNoGo?.suiteStatus === "go",
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
    cystAfterTrial.events?.some(
      (event) =>
        event.eventType === "gate_run" &&
        event.descriptorId === trialRun.id &&
        event.gateKind === "read_only" &&
        event.gateStage === "started" &&
        event.status === "started" &&
        event.matrixVersion === "0.1" &&
        event.goCriteriaVersion === "0.1",
    ) &&
    cystAfterTrial.events?.some(
      (event) =>
        event.eventType === "gate_run" &&
        event.descriptorId === trialRun.id &&
        event.gateKind === "read_only" &&
        event.gateStage === "completed" &&
        event.status === "completed" &&
        event.suiteStatus === "go" &&
        event.goNoGo === "go" &&
        event.matrixVersion === "0.1" &&
        event.goCriteriaVersion === "0.1" &&
        event.passedCount === 5 &&
        event.requiredScenarioCount === 5,
    ) &&
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

  const betaSessionId = "verify-readonly-beta-console";
  const betaInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: betaSessionId,
  });
  const betaRetrieval = await postJson("/api/tripp/reply", {
    prompt: "where is Munch health exposed",
    mode: "AUTO",
    sessionId: betaSessionId,
  });
  const betaFollowupInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: betaSessionId,
  });
  const betaSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: betaSessionId,
  });
  const betaBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: betaSessionId,
  });
  const betaGate = await postJson("/api/tripp/trials/read-only", {});
  const betaCyst = await getJson("/api/tripp/cyst/events");
  const betaTaskIds = [
    betaInspect.task?.id,
    betaRetrieval.task?.id,
    betaFollowupInspect.task?.id,
    betaSafeShell.task?.id,
    betaBlockedShell.task?.id,
    betaGate.task?.id,
  ].filter(Boolean);
  const betaCystEvents = betaCyst.events?.filter((event) => betaTaskIds.includes(event.descriptorId) || event.descriptorId === betaGate.id) || [];
  const betaAcceptancePass =
    betaInspect.task?.status === "inspected" &&
    betaInspect.task?.target === "README.md" &&
    betaInspect.task?.adapter?.status === "ok" &&
    betaInspect.task?.excerpt &&
    betaRetrieval.task?.status === "retrieval_ready" &&
    betaRetrieval.task?.retrieval?.sourceKind === "mock" &&
    betaRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    betaRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    betaRetrieval.task?.evidenceGate?.status === "blocked" &&
    betaFollowupInspect.task?.status === "inspected" &&
    betaFollowupInspect.task?.target === "server.mjs" &&
    betaFollowupInspect.task?.adapter?.status === "ok" &&
    betaFollowupInspect.task?.excerpt &&
    betaSafeShell.task?.status === "completed" &&
    betaSafeShell.task?.adapter?.status === "ok" &&
    betaSafeShell.task?.adapter?.invoked === true &&
    betaBlockedShell.task?.status === "gated" &&
    !betaBlockedShell.task?.adapter &&
    betaBlockedShell.task?.permission?.decision === "gated" &&
    betaGate.suiteStatus === "go" &&
    betaGate.task?.title === "Read-Only Gate" &&
    betaGate.task?.goNoGo?.suiteStatus === "go" &&
    betaCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === betaInspect.task?.id) &&
    betaCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === betaRetrieval.task?.id) &&
    betaCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === betaFollowupInspect.task?.id) &&
    betaCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === betaSafeShell.task?.id) &&
    betaCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === betaBlockedShell.task?.id) &&
    betaCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === betaGate.id && event.gateStage === "completed");
  console.log(`${betaAcceptancePass ? "PASS" : "FAIL"} beta: primary read-only console acceptance flow`);
  if (!betaAcceptancePass) {
    failures.push({ name: "primary read-only beta acceptance" });
  }

  const branchSessionId = "verify-readonly-multibranch";
  const branchRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files most likely control formal read-only gate behavior and how results are shown to the operator?",
    mode: "AUTO",
    sessionId: branchSessionId,
  });
  const branchBackendInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: branchSessionId,
  });
  const branchUiInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: branchSessionId,
  });
  const branchSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: branchSessionId,
  });
  const branchBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: branchSessionId,
  });
  const branchGate = await postJson("/api/tripp/trials/read-only", {});
  const branchCyst = await getJson("/api/tripp/cyst/events");
  const branchTaskIds = [
    branchRetrieval.task?.id,
    branchBackendInspect.task?.id,
    branchUiInspect.task?.id,
    branchSafeShell.task?.id,
    branchBlockedShell.task?.id,
    branchGate.task?.id,
  ].filter(Boolean);
  const branchCystEvents = branchCyst.events?.filter((event) => branchTaskIds.includes(event.descriptorId) || event.descriptorId === branchGate.id) || [];
  const multiBranchAcceptancePass =
    branchRetrieval.task?.status === "retrieval_ready" &&
    branchRetrieval.task?.retrieval?.sourceKind === "mock" &&
    branchRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    branchRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    branchBackendInspect.task?.status === "inspected" &&
    branchBackendInspect.task?.target === "server.mjs" &&
    branchBackendInspect.task?.adapter?.status === "ok" &&
    branchUiInspect.task?.status === "inspected" &&
    branchUiInspect.task?.target === "script.js" &&
    branchUiInspect.task?.adapter?.status === "ok" &&
    branchSafeShell.task?.status === "completed" &&
    branchSafeShell.task?.adapter?.invoked === true &&
    branchBlockedShell.task?.status === "gated" &&
    !branchBlockedShell.task?.adapter &&
    branchBlockedShell.task?.permission?.decision === "gated" &&
    branchGate.suiteStatus === "go" &&
    branchGate.task?.goNoGo?.suiteStatus === "go" &&
    branchCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === branchRetrieval.task?.id) &&
    branchCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === branchBackendInspect.task?.id) &&
    branchCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === branchUiInspect.task?.id) &&
    branchCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === branchSafeShell.task?.id) &&
    branchCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === branchBlockedShell.task?.id) &&
    branchCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === branchGate.id && event.gateStage === "completed");
  console.log(`${multiBranchAcceptancePass ? "PASS" : "FAIL"} beta: multi-branch read-only ambiguity acceptance flow`);
  if (!multiBranchAcceptancePass) {
    failures.push({ name: "multi-branch read-only ambiguity acceptance" });
  }

  const reversalSessionId = "verify-readonly-branch-reversal";
  const reversalRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files likely own Cyst activity rendering and how blocked rows are shown?",
    mode: "AUTO",
    sessionId: reversalSessionId,
  });
  const reversalBackendInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: reversalSessionId,
  });
  const reversalUiInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: reversalSessionId,
  });
  const reversalSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: reversalSessionId,
  });
  const reversalBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: reversalSessionId,
  });
  const reversalGate = await postJson("/api/tripp/trials/read-only", {});
  const reversalCyst = await getJson("/api/tripp/cyst/events");
  const reversalTaskIds = [
    reversalRetrieval.task?.id,
    reversalBackendInspect.task?.id,
    reversalUiInspect.task?.id,
    reversalSafeShell.task?.id,
    reversalBlockedShell.task?.id,
    reversalGate.task?.id,
  ].filter(Boolean);
  const reversalCystEvents = reversalCyst.events?.filter((event) => reversalTaskIds.includes(event.descriptorId) || event.descriptorId === reversalGate.id) || [];
  const branchReversalAcceptancePass =
    reversalRetrieval.task?.status === "retrieval_ready" &&
    reversalRetrieval.task?.retrieval?.sourceKind === "mock" &&
    reversalRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    reversalRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    reversalBackendInspect.task?.status === "inspected" &&
    reversalBackendInspect.task?.target === "server.mjs" &&
    reversalBackendInspect.task?.adapter?.status === "ok" &&
    reversalUiInspect.task?.status === "inspected" &&
    reversalUiInspect.task?.target === "script.js" &&
    reversalUiInspect.task?.adapter?.status === "ok" &&
    reversalSafeShell.task?.status === "completed" &&
    reversalSafeShell.task?.adapter?.invoked === true &&
    reversalBlockedShell.task?.status === "gated" &&
    !reversalBlockedShell.task?.adapter &&
    reversalBlockedShell.task?.permission?.decision === "gated" &&
    reversalGate.suiteStatus === "go" &&
    reversalGate.task?.goNoGo?.suiteStatus === "go" &&
    reversalCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === reversalRetrieval.task?.id) &&
    reversalCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === reversalBackendInspect.task?.id) &&
    reversalCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === reversalUiInspect.task?.id) &&
    reversalCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === reversalSafeShell.task?.id) &&
    reversalCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === reversalBlockedShell.task?.id) &&
    reversalCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === reversalGate.id && event.gateStage === "completed");
  console.log(`${branchReversalAcceptancePass ? "PASS" : "FAIL"} beta: branch reversal read-only acceptance flow`);
  if (!branchReversalAcceptancePass) {
    failures.push({ name: "branch reversal read-only acceptance" });
  }

  const recoverySessionId = "verify-readonly-contradiction-recovery";
  const recoveryRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files likely explain how blocked outcomes are surfaced to the operator: policy handling or UI rendering behavior?",
    mode: "AUTO",
    sessionId: recoverySessionId,
  });
  const recoveryUiInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: recoverySessionId,
  });
  const recoverySafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: recoverySessionId,
  });
  const recoveryBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: recoverySessionId,
  });
  const recoveryRuntimeInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: recoverySessionId,
  });
  const recoveryGate = await postJson("/api/tripp/trials/read-only", {});
  const recoveryCyst = await getJson("/api/tripp/cyst/events");
  const recoveryTaskIds = [
    recoveryRetrieval.task?.id,
    recoveryUiInspect.task?.id,
    recoverySafeShell.task?.id,
    recoveryBlockedShell.task?.id,
    recoveryRuntimeInspect.task?.id,
    recoveryGate.task?.id,
  ].filter(Boolean);
  const recoveryCystEvents = recoveryCyst.events?.filter((event) => recoveryTaskIds.includes(event.descriptorId) || event.descriptorId === recoveryGate.id) || [];
  const contradictionRecoveryAcceptancePass =
    recoveryRetrieval.task?.status === "retrieval_ready" &&
    recoveryRetrieval.task?.retrieval?.sourceKind === "mock" &&
    recoveryRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    recoveryRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    recoveryUiInspect.task?.status === "inspected" &&
    recoveryUiInspect.task?.target === "script.js" &&
    recoveryUiInspect.task?.adapter?.status === "ok" &&
    recoverySafeShell.task?.status === "completed" &&
    recoverySafeShell.task?.adapter?.invoked === true &&
    recoveryBlockedShell.task?.status === "gated" &&
    !recoveryBlockedShell.task?.adapter &&
    recoveryBlockedShell.task?.permission?.decision === "gated" &&
    recoveryRuntimeInspect.task?.status === "inspected" &&
    recoveryRuntimeInspect.task?.target === "server.mjs" &&
    recoveryRuntimeInspect.task?.adapter?.status === "ok" &&
    recoveryGate.suiteStatus === "go" &&
    recoveryGate.task?.goNoGo?.suiteStatus === "go" &&
    recoveryCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === recoveryRetrieval.task?.id) &&
    recoveryCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === recoveryUiInspect.task?.id) &&
    recoveryCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === recoverySafeShell.task?.id) &&
    recoveryCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === recoveryBlockedShell.task?.id) &&
    recoveryCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === recoveryRuntimeInspect.task?.id) &&
    recoveryCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === recoveryGate.id && event.gateStage === "completed");
  console.log(`${contradictionRecoveryAcceptancePass ? "PASS" : "FAIL"} beta: contradiction recovery read-only acceptance flow`);
  if (!contradictionRecoveryAcceptancePass) {
    failures.push({ name: "contradiction recovery read-only acceptance" });
  }

  const enforcementSessionId = "verify-readonly-warden-adapter-ambiguity";
  const enforcementRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files explain blocked escalation behavior: Warden policy denial or adapter tool-route refusal?",
    mode: "AUTO",
    sessionId: enforcementSessionId,
  });
  const enforcementPolicyInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: enforcementSessionId,
  });
  const enforcementBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: enforcementSessionId,
  });
  const enforcementAdapterInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: enforcementSessionId,
  });
  const enforcementSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: enforcementSessionId,
  });
  const enforcementGate = await postJson("/api/tripp/trials/read-only", {});
  const enforcementCyst = await getJson("/api/tripp/cyst/events");
  const enforcementTaskIds = [
    enforcementRetrieval.task?.id,
    enforcementPolicyInspect.task?.id,
    enforcementBlockedShell.task?.id,
    enforcementAdapterInspect.task?.id,
    enforcementSafeShell.task?.id,
    enforcementGate.task?.id,
  ].filter(Boolean);
  const enforcementCystEvents = enforcementCyst.events?.filter((event) => enforcementTaskIds.includes(event.descriptorId) || event.descriptorId === enforcementGate.id) || [];
  const wardenAdapterAmbiguityPass =
    enforcementRetrieval.task?.status === "retrieval_ready" &&
    enforcementRetrieval.task?.retrieval?.sourceKind === "mock" &&
    enforcementRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    enforcementRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    enforcementPolicyInspect.task?.status === "inspected" &&
    enforcementPolicyInspect.task?.target === "README.md" &&
    enforcementPolicyInspect.task?.adapter?.status === "ok" &&
    enforcementBlockedShell.task?.status === "gated" &&
    !enforcementBlockedShell.task?.adapter &&
    enforcementBlockedShell.task?.permission?.decision === "gated" &&
    enforcementAdapterInspect.task?.status === "inspected" &&
    enforcementAdapterInspect.task?.target === "server.mjs" &&
    enforcementAdapterInspect.task?.adapter?.status === "ok" &&
    enforcementSafeShell.task?.status === "completed" &&
    enforcementSafeShell.task?.adapter?.invoked === true &&
    enforcementGate.suiteStatus === "go" &&
    enforcementGate.task?.goNoGo?.suiteStatus === "go" &&
    enforcementCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === enforcementRetrieval.task?.id) &&
    enforcementCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === enforcementPolicyInspect.task?.id) &&
    enforcementCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === enforcementBlockedShell.task?.id) &&
    enforcementCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === enforcementAdapterInspect.task?.id) &&
    enforcementCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === enforcementSafeShell.task?.id) &&
    enforcementCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === enforcementGate.id && event.gateStage === "completed");
  console.log(`${wardenAdapterAmbiguityPass ? "PASS" : "FAIL"} beta: Warden-vs-adapter ambiguity acceptance flow`);
  if (!wardenAdapterAmbiguityPass) {
    failures.push({ name: "Warden-vs-adapter ambiguity acceptance" });
  }

  const longSessionId = "verify-readonly-long-session";
  const longInspectReadme = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longGateRetrieval = await postJson("/api/tripp/reply", {
    prompt: "where is formal read-only gate behavior defined",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longInspectServer = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longInspectScript = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longAnalysis = await postJson("/api/tripp/reply", {
    prompt: "analyze server.mjs",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longCystRetrieval = await postJson("/api/tripp/reply", {
    prompt: "which files likely own Cyst activity rendering",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longGitStatus = await postJson("/api/tripp/reply", {
    prompt: "git status",
    mode: "AUTO",
    sessionId: longSessionId,
  });
  const longGate = await postJson("/api/tripp/trials/read-only", {});
  const longCyst = await getJson("/api/tripp/cyst/events");
  const longTaskIds = [
    longInspectReadme.task?.id,
    longGateRetrieval.task?.id,
    longInspectServer.task?.id,
    longSafeShell.task?.id,
    longInspectScript.task?.id,
    longAnalysis.task?.id,
    longCystRetrieval.task?.id,
    longBlockedShell.task?.id,
    longGitStatus.task?.id,
    longGate.task?.id,
  ].filter(Boolean);
  const longCystEvents = longCyst.events?.filter((event) => longTaskIds.includes(event.descriptorId) || event.descriptorId === longGate.id) || [];
  const longSessionAcceptancePass =
    longInspectReadme.task?.status === "inspected" &&
    longInspectReadme.task?.target === "README.md" &&
    longGateRetrieval.task?.status === "retrieval_ready" &&
    longGateRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    longInspectServer.task?.status === "inspected" &&
    longInspectServer.task?.target === "server.mjs" &&
    longSafeShell.task?.status === "completed" &&
    longSafeShell.task?.adapter?.invoked === true &&
    longInspectScript.task?.status === "inspected" &&
    longInspectScript.task?.target === "script.js" &&
    longAnalysis.task?.status === "completed" &&
    longCystRetrieval.task?.status === "retrieval_ready" &&
    longCystRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    longBlockedShell.task?.status === "gated" &&
    !longBlockedShell.task?.adapter &&
    longGitStatus.task?.status === "completed" &&
    longGitStatus.task?.adapter?.invoked === true &&
    longGate.suiteStatus === "go" &&
    longGate.task?.goNoGo?.suiteStatus === "go" &&
    longCystEvents.filter((event) => event.eventType === "retrieval_event").length >= 2 &&
    longCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === longInspectReadme.task?.id) &&
    longCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === longInspectServer.task?.id) &&
    longCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === longInspectScript.task?.id) &&
    longCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === longSafeShell.task?.id) &&
    longCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === longBlockedShell.task?.id) &&
    longCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === longGate.id && event.gateStage === "completed");
  console.log(`${longSessionAcceptancePass ? "PASS" : "FAIL"} beta: longer read-only repeatability acceptance flow`);
  if (!longSessionAcceptancePass) {
    failures.push({ name: "longer read-only repeatability acceptance" });
  }

  const rolloffSessionId = "verify-readonly-branch-rolloff";
  const rolloffRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files likely explain how blocked outcomes are surfaced to the operator: policy handling or UI rendering behavior?",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffInspectReadme = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffInspectServer = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffAnalysis = await postJson("/api/tripp/reply", {
    prompt: "analyze server.mjs",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffInspectScript = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffGitStatus = await postJson("/api/tripp/reply", {
    prompt: "git status",
    mode: "AUTO",
    sessionId: rolloffSessionId,
  });
  const rolloffGate = await postJson("/api/tripp/trials/read-only", {});
  const rolloffCyst = await getJson("/api/tripp/cyst/events");
  const rolloffTaskIds = [
    rolloffRetrieval.task?.id,
    rolloffBlockedShell.task?.id,
    rolloffInspectReadme.task?.id,
    rolloffSafeShell.task?.id,
    rolloffInspectServer.task?.id,
    rolloffAnalysis.task?.id,
    rolloffInspectScript.task?.id,
    rolloffGitStatus.task?.id,
    rolloffGate.task?.id,
  ].filter(Boolean);
  const rolloffCystEvents = rolloffCyst.events?.filter((event) => rolloffTaskIds.includes(event.descriptorId) || event.descriptorId === rolloffGate.id) || [];
  const branchRolloffAcceptancePass =
    rolloffRetrieval.task?.status === "retrieval_ready" &&
    rolloffRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    rolloffBlockedShell.task?.status === "gated" &&
    !rolloffBlockedShell.task?.adapter &&
    rolloffInspectReadme.task?.status === "inspected" &&
    rolloffSafeShell.task?.status === "completed" &&
    rolloffInspectServer.task?.status === "inspected" &&
    rolloffAnalysis.task?.status === "completed" &&
    rolloffInspectScript.task?.status === "inspected" &&
    rolloffGitStatus.task?.status === "completed" &&
    rolloffGate.suiteStatus === "go" &&
    rolloffGate.task?.goNoGo?.suiteStatus === "go" &&
    rolloffCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === rolloffRetrieval.task?.id) &&
    rolloffCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === rolloffBlockedShell.task?.id) &&
    rolloffCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === rolloffGate.id && event.gateStage === "completed") &&
    appScript.includes("Earlier blocked read-only outcome remains relevant.") &&
    appScript.includes("Earlier branch context remains available but is outside the most recent task window.");
  console.log(`${branchRolloffAcceptancePass ? "PASS" : "FAIL"} beta: branch rolloff read-only acceptance flow`);
  if (!branchRolloffAcceptancePass) {
    failures.push({ name: "branch rolloff read-only acceptance" });
  }

  const varietySessionId = "verify-readonly-session-variety-docs-runtime";
  const varietyRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files best explain read-only beta behavior: docs/config guidance or server implementation?",
    mode: "AUTO",
    sessionId: varietySessionId,
  });
  const varietyDocsInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: varietySessionId,
  });
  const varietyRuntimeInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: varietySessionId,
  });
  const varietySafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: varietySessionId,
  });
  const varietyBlockedShell = await postJson("/api/tripp/reply", {
    prompt: "run shell command write beta marker",
    mode: "AUTO",
    sessionId: varietySessionId,
  });
  const varietyGate = await postJson("/api/tripp/trials/read-only", {});
  const varietyCyst = await getJson("/api/tripp/cyst/events");
  const varietyTaskIds = [
    varietyRetrieval.task?.id,
    varietyDocsInspect.task?.id,
    varietyRuntimeInspect.task?.id,
    varietySafeShell.task?.id,
    varietyBlockedShell.task?.id,
    varietyGate.task?.id,
  ].filter(Boolean);
  const varietyCystEvents = varietyCyst.events?.filter((event) => varietyTaskIds.includes(event.descriptorId) || event.descriptorId === varietyGate.id) || [];
  const docsRuntimeVarietyPass =
    varietyRetrieval.task?.status === "retrieval_ready" &&
    varietyRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    varietyRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    varietyDocsInspect.task?.status === "inspected" &&
    varietyDocsInspect.task?.target === "README.md" &&
    varietyRuntimeInspect.task?.status === "inspected" &&
    varietyRuntimeInspect.task?.target === "server.mjs" &&
    varietySafeShell.task?.status === "completed" &&
    varietySafeShell.task?.adapter?.invoked === true &&
    varietyBlockedShell.task?.status === "gated" &&
    !varietyBlockedShell.task?.adapter &&
    varietyGate.suiteStatus === "go" &&
    varietyGate.task?.goNoGo?.suiteStatus === "go" &&
    varietyCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === varietyRetrieval.task?.id) &&
    varietyCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === varietyDocsInspect.task?.id) &&
    varietyCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === varietyRuntimeInspect.task?.id) &&
    varietyCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === varietySafeShell.task?.id) &&
    varietyCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === varietyBlockedShell.task?.id) &&
    varietyCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === varietyGate.id && event.gateStage === "completed") &&
    appScript.includes("Planning-only retrieval suggested docs/config guidance and runtime implementation as plausible review paths.") &&
    appScript.includes("The initial docs/config and runtime branch suggestions came from planning-only retrieval and remain non-authoritative.");
  console.log(`${docsRuntimeVarietyPass ? "PASS" : "FAIL"} beta: docs/config vs runtime read-only acceptance flow`);
  if (!docsRuntimeVarietyPass) {
    failures.push({ name: "docs/config vs runtime read-only acceptance" });
  }

  const partialSessionId = "verify-readonly-partial-evidence";
  const partialRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files best explain read-only beta behavior: docs/config guidance or server implementation?",
    mode: "AUTO",
    sessionId: partialSessionId,
  });
  const partialDocsInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: partialSessionId,
  });
  const partialSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: partialSessionId,
  });
  const partialCyst = await getJson("/api/tripp/cyst/events");
  const partialTaskIds = [
    partialRetrieval.task?.id,
    partialDocsInspect.task?.id,
    partialSafeShell.task?.id,
  ].filter(Boolean);
  const partialCystEvents = partialCyst.events?.filter((event) => partialTaskIds.includes(event.descriptorId)) || [];
  const partialEvidencePass =
    partialRetrieval.task?.status === "retrieval_ready" &&
    partialRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    partialRetrieval.task?.retrieval?.writeApprovalEligible === false &&
    partialDocsInspect.task?.status === "inspected" &&
    partialDocsInspect.task?.target === "README.md" &&
    partialSafeShell.task?.status === "completed" &&
    partialSafeShell.task?.adapter?.invoked === true &&
    partialCystEvents.some((event) => event.eventType === "retrieval_event" && event.descriptorId === partialRetrieval.task?.id) &&
    partialCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === partialDocsInspect.task?.id) &&
    partialCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === partialSafeShell.task?.id) &&
    appScript.includes("Planning-only retrieval suggested additional paths that remain non-authoritative.") &&
    appScript.includes("Only part of the current question has been inspected directly.") &&
    appScript.includes("Current findings are useful for read-only review but remain incomplete.") &&
    appScript.includes("Inspect the next related source to clarify the remaining uncertainty.");
  console.log(`${partialEvidencePass ? "PASS" : "FAIL"} beta: partial-evidence synthesis acceptance flow`);
  if (!partialEvidencePass) {
    failures.push({ name: "partial-evidence synthesis acceptance" });
  }

  const stressSessionId = "verify-readonly-long-session-stress";
  const stressRetrieval = await postJson("/api/tripp/reply", {
    prompt: "Which files most likely explain read-only gate behavior and operator result rendering?",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressInspectBranchA = await postJson("/api/tripp/reply", {
    prompt: "inspect server.mjs",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressSafeShell = await postJson("/api/tripp/reply", {
    prompt: "run node --version command",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressBlockedShellOne = await postJson("/api/tripp/reply", {
    prompt: "run shell command write long stress marker",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressInspectBranchB = await postJson("/api/tripp/reply", {
    prompt: "inspect script.js",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressFollowupInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect README.md",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressRefinementRetrieval = await postJson("/api/tripp/reply", {
    prompt: "which files likely own Cyst activity rendering",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressBlockedShellTwo = await postJson("/api/tripp/reply", {
    prompt: "run shell command delete temp files",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressOlderRelatedInspect = await postJson("/api/tripp/reply", {
    prompt: "inspect styles.css",
    mode: "AUTO",
    sessionId: stressSessionId,
  });
  const stressGate = await postJson("/api/tripp/trials/read-only", {});
  const stressCyst = await getJson("/api/tripp/cyst/events");
  const stressTaskIds = [
    stressRetrieval.task?.id,
    stressInspectBranchA.task?.id,
    stressSafeShell.task?.id,
    stressBlockedShellOne.task?.id,
    stressInspectBranchB.task?.id,
    stressFollowupInspect.task?.id,
    stressRefinementRetrieval.task?.id,
    stressBlockedShellTwo.task?.id,
    stressOlderRelatedInspect.task?.id,
    stressGate.task?.id,
  ].filter(Boolean);
  const stressCystEvents = stressCyst.events?.filter((event) => stressTaskIds.includes(event.descriptorId) || event.descriptorId === stressGate.id) || [];
  const longSessionStressPass =
    stressTaskIds.length === 10 &&
    stressRetrieval.task?.status === "retrieval_ready" &&
    stressRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    stressInspectBranchA.task?.status === "inspected" &&
    stressInspectBranchA.task?.target === "server.mjs" &&
    stressSafeShell.task?.status === "completed" &&
    stressSafeShell.task?.adapter?.invoked === true &&
    stressBlockedShellOne.task?.status === "gated" &&
    !stressBlockedShellOne.task?.adapter &&
    stressInspectBranchB.task?.status === "inspected" &&
    stressInspectBranchB.task?.target === "script.js" &&
    stressFollowupInspect.task?.status === "inspected" &&
    stressFollowupInspect.task?.target === "README.md" &&
    stressRefinementRetrieval.task?.status === "retrieval_ready" &&
    stressRefinementRetrieval.task?.retrieval?.authorityLevel === "planning-only" &&
    stressBlockedShellTwo.task?.status === "gated" &&
    !stressBlockedShellTwo.task?.adapter &&
    stressOlderRelatedInspect.task?.status === "inspected" &&
    stressOlderRelatedInspect.task?.target === "styles.css" &&
    stressGate.suiteStatus === "go" &&
    stressGate.task?.goNoGo?.suiteStatus === "go" &&
    stressCystEvents.filter((event) => event.eventType === "retrieval_event").length >= 2 &&
    stressCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === stressBlockedShellOne.task?.id) &&
    stressCystEvents.some((event) => event.eventType === "lifecycle_transition" && event.descriptorId === stressBlockedShellTwo.task?.id) &&
    stressCystEvents.some((event) => event.eventType === "gate_run" && event.descriptorId === stressGate.id && event.gateStage === "completed") &&
    appScript.includes("Earlier branch context remains available but is outside the most recent task window.") &&
    appScript.includes("Earlier blocked read-only outcome remains relevant.") &&
    appScript.includes("Mock or planning-only evidence remains non-authoritative for file changes.");
  console.log(`${longSessionStressPass ? "PASS" : "FAIL"} beta: long-session stress acceptance flow`);
  if (!longSessionStressPass) {
    failures.push({ name: "long-session stress acceptance" });
  }

  const operatorIndependenceArtifact = createOperatorIndependenceArtifact({
    sessionId: longSessionId,
    scenarioId: "longer_readonly_repeatability",
    tasks: {
      inspectReadme: longInspectReadme.task,
      gateRetrieval: longGateRetrieval.task,
      inspectServer: longInspectServer.task,
      safeShell: longSafeShell.task,
      inspectScript: longInspectScript.task,
      analysis: longAnalysis.task,
      cystRetrieval: longCystRetrieval.task,
      blockedShell: longBlockedShell.task,
      gitStatus: longGitStatus.task,
      gate: longGate.task,
    },
    acceptancePassed: longSessionAcceptancePass,
  });
  const operatorChecks = Object.values(operatorIndependenceArtifact.checks);
  const operatorIndependencePass =
    operatorIndependenceArtifact.artifactType === "operator_independence_check" &&
    operatorIndependenceArtifact.mode === "read_only_beta_harness" &&
    operatorIndependenceArtifact.overallStatus === "pass" &&
    operatorChecks.length === 6 &&
    operatorChecks.every((check) => check.status === "pass") &&
    operatorIndependenceArtifact.summary === "Session was understandable without sidecar interpretation in read-only beta harness." &&
    !/certified|validated replacement|goose no longer needed|independent reasoning confirmed/i.test(operatorIndependenceArtifact.summary) &&
    !appScript.includes("operator_independence_check") &&
    !appHtml.includes("operator_independence_check");
  console.log(`${operatorIndependencePass ? "PASS" : "FAIL"} beta: operator independence artifact`);
  if (!operatorIndependencePass) {
    failures.push({ name: "operator independence artifact" });
  }

  const operatorPackArtifact = createOperatorIndependencePackArtifact({
    packId: "readonly_85_variety_pack",
    scenarios: [
      {
        scenarioId: "docs_config_vs_runtime",
        acceptancePassed: docsRuntimeVarietyPass,
        tasks: {
          inspected: [varietyDocsInspect.task, varietyRuntimeInspect.task],
          learned: [varietyDocsInspect.task, varietyRuntimeInspect.task, varietySafeShell.task],
          uncertain: [varietyRetrieval.task],
          blocked: [varietyBlockedShell.task],
          nextDirection: [varietyGate.task],
        },
        summary: "Docs/config and runtime session was understandable as read-only planning evidence.",
      },
      {
        scenarioId: "warden_vs_adapter",
        acceptancePassed: wardenAdapterAmbiguityPass,
        tasks: {
          inspected: [enforcementPolicyInspect.task, enforcementAdapterInspect.task],
          learned: [enforcementPolicyInspect.task, enforcementAdapterInspect.task, enforcementSafeShell.task],
          uncertain: [enforcementRetrieval.task],
          blocked: [enforcementBlockedShell.task],
          nextDirection: [enforcementGate.task],
        },
        summary: "Policy and adapter session was understandable without final enforcement ownership claims.",
      },
      {
        scenarioId: "longer_session_branch_rolloff",
        acceptancePassed: branchRolloffAcceptancePass,
        tasks: {
          inspected: [rolloffInspectReadme.task, rolloffInspectServer.task, rolloffInspectScript.task],
          learned: [rolloffAnalysis.task, rolloffSafeShell.task, rolloffGitStatus.task],
          uncertain: [rolloffRetrieval.task],
          blocked: [rolloffBlockedShell.task],
          nextDirection: [rolloffGate.task],
        },
        summary: "Longer branch-rolloff session preserved useful context and blocked read-only limits.",
      },
      {
        scenarioId: "long_session_stress",
        acceptancePassed: longSessionStressPass,
        extraChecks: {
          continuityReconstructed: longSessionStressPass,
          branchShiftUnderstood: longSessionStressPass,
        },
        tasks: {
          inspected: [stressInspectBranchA.task, stressInspectBranchB.task, stressFollowupInspect.task, stressOlderRelatedInspect.task],
          learned: [stressInspectBranchA.task, stressInspectBranchB.task, stressSafeShell.task],
          uncertain: [stressRetrieval.task, stressRefinementRetrieval.task],
          blocked: [stressBlockedShellOne.task, stressBlockedShellTwo.task],
          nextDirection: [stressGate.task],
        },
        summary: "The longer read-only session remained understandable within the current beta harness scope.",
      },
    ],
  });
  const requiredOperatorPackScenarioIds = ["docs_config_vs_runtime", "warden_vs_adapter", "longer_session_branch_rolloff", "long_session_stress"];
  const operatorPackScenarioIds = operatorPackArtifact.scenarioResults.map((scenario) => scenario.scenarioId);
  const operatorPackPass =
    operatorPackArtifact.artifactType === "operator_independence_pack_check" &&
    operatorPackArtifact.mode === "read_only_beta_harness" &&
    operatorPackArtifact.packId === "readonly_85_variety_pack" &&
    operatorPackArtifact.overallStatus === "pass" &&
    JSON.stringify(operatorPackArtifact.requiredScenarioIds) === JSON.stringify(requiredOperatorPackScenarioIds) &&
    JSON.stringify(operatorPackArtifact.presentScenarioIds) === JSON.stringify(requiredOperatorPackScenarioIds) &&
    operatorPackArtifact.scenarioResults.length === 4 &&
    requiredOperatorPackScenarioIds.every((scenarioId) => operatorPackScenarioIds.includes(scenarioId)) &&
    new Set(operatorPackScenarioIds).size === operatorPackScenarioIds.length &&
    operatorPackArtifact.scenarioResults.every((scenario) => operatorPackArtifact.requiredScenarioIds.includes(scenario.scenarioId)) &&
    operatorPackArtifact.scenarioResults.every((scenario) => scenario.status === "pass") &&
    operatorPackArtifact.scenarioResults.every((scenario) => Object.values(scenario.checks).every((status) => status === "pass")) &&
    operatorPackArtifact.scenarioResults.find((scenario) => scenario.scenarioId === "long_session_stress")?.checks?.continuityReconstructed === "pass" &&
    operatorPackArtifact.scenarioResults.find((scenario) => scenario.scenarioId === "long_session_stress")?.checks?.branchShiftUnderstood === "pass" &&
    operatorPackArtifact.scenarioResults.every((scenario) => scenario.status === (Object.values(scenario.checks).every((status) => status === "pass") ? "pass" : "fail")) &&
    operatorPackArtifact.overallStatus === (operatorPackArtifact.scenarioResults.every((scenario) => scenario.status === "pass") ? "pass" : "fail") &&
    operatorPackArtifact.packSummary === "Required read-only scenario families remained understandable without sidecar interpretation." &&
    !/certified|validated replacement|goose no longer needed|independent reasoning confirmed|replacement certified/i.test(operatorPackArtifact.packSummary) &&
    !appScript.includes("operator_independence_pack_check") &&
    !appHtml.includes("operator_independence_pack_check");
  console.log(`${operatorPackPass ? "PASS" : "FAIL"} beta: operator independence pack artifact`);
  if (!operatorPackPass) {
    failures.push({ name: "operator independence pack artifact" });
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

function createOperatorIndependenceArtifact({ sessionId, scenarioId, tasks, acceptancePassed }) {
  const check = (status, prompt, evidenceSource, note) => ({
    status: status ? "pass" : "fail",
    prompt,
    evidenceSource,
    note,
  });
  const checks = {
    inspected: check(
      tasks.inspectReadme?.status === "inspected" && tasks.inspectServer?.status === "inspected" && tasks.inspectScript?.status === "inspected",
      "Operator could identify what was inspected.",
      ["TASKS", "Current Understanding"],
      "README.md, server.mjs, and script.js were inspected in read-only mode.",
    ),
    learned: check(
      tasks.analysis?.status === "completed" && tasks.safeShell?.status === "completed" && tasks.gitStatus?.status === "completed",
      "Operator could identify what was learned.",
      ["TASKS"],
      "Analysis, safe shell, and git status provided bounded read-only findings.",
    ),
    uncertain: check(
      tasks.gateRetrieval?.retrieval?.authorityLevel === "planning-only" && tasks.cystRetrieval?.retrieval?.authorityLevel === "planning-only",
      "Operator could identify what remains uncertain.",
      ["TASKS", "Current Understanding"],
      "Mock retrieval remained planning-only and non-authoritative.",
    ),
    blocked: check(
      tasks.blockedShell?.status === "gated" && !tasks.blockedShell?.adapter,
      "Operator could identify what was blocked.",
      ["TASKS", "Cyst"],
      "Write-like shell request stayed gated and no write-capable route was used.",
    ),
    nextDirection: check(
      acceptancePassed,
      "Operator could identify the next read-only direction.",
      ["Current Understanding"],
      "Session retained a read-only next direction after mixed task activity.",
    ),
    understandableWithoutSidecar: check(
      acceptancePassed,
      "Session was understandable without sidecar interpretation.",
      ["beta harness"],
      "All required read-only beta acceptance checks passed.",
    ),
  };
  const overallStatus = Object.values(checks).every((result) => result.status === "pass") ? "pass" : "fail";
  return {
    artifactType: "operator_independence_check",
    mode: "read_only_beta_harness",
    sessionId,
    scenarioId,
    checks,
    overallStatus,
    summary: "Session was understandable without sidecar interpretation in read-only beta harness.",
  };
}

function createOperatorIndependencePackArtifact({ packId, scenarios }) {
  const requiredScenarioIds = ["docs_config_vs_runtime", "warden_vs_adapter", "longer_session_branch_rolloff", "long_session_stress"];
  const scenarioResults = scenarios.map((scenario) => {
    const hasInspected = scenario.tasks.inspected?.every((task) => task?.status === "inspected");
    const hasLearned = scenario.tasks.learned?.every((task) => ["completed", "inspected"].includes(task?.status));
    const hasUncertain = scenario.tasks.uncertain?.every((task) => task?.retrieval?.authorityLevel === "planning-only");
    const hasBlocked = scenario.tasks.blocked?.every((task) => task?.status === "gated" && !task?.adapter);
    const hasNextDirection = scenario.tasks.nextDirection?.every((task) => task?.goNoGo?.suiteStatus === "go" || task?.status === "completed");
    const checks = {
      inspected: hasInspected ? "pass" : "fail",
      learned: hasLearned ? "pass" : "fail",
      uncertain: hasUncertain ? "pass" : "fail",
      blocked: hasBlocked ? "pass" : "fail",
      nextDirection: hasNextDirection ? "pass" : "fail",
      understandableWithoutSidecar: scenario.acceptancePassed ? "pass" : "fail",
      ...(scenario.extraChecks
        ? Object.fromEntries(Object.entries(scenario.extraChecks).map(([key, value]) => [key, value ? "pass" : "fail"]))
        : {}),
    };
    const status = Object.values(checks).every((value) => value === "pass") ? "pass" : "fail";
    return {
      scenarioId: scenario.scenarioId,
      status,
      checks,
      summary: scenario.summary,
    };
  });
  const overallStatus = scenarioResults.every((scenario) => scenario.status === "pass") ? "pass" : "fail";
  return {
    artifactType: "operator_independence_pack_check",
    mode: "read_only_beta_harness",
    packId,
    overallStatus,
    requiredScenarioIds,
    presentScenarioIds: scenarioResults.map((scenario) => scenario.scenarioId),
    scenarioResults,
    packSummary: "Required read-only scenario families remained understandable without sidecar interpretation.",
  };
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

function extractFunctionRange(source, startName, endName) {
  const start = source.indexOf(`function ${startName}`);
  const end = source.indexOf(`function ${endName}`, start + 1);
  if (start < 0) return "";
  return end > start ? source.slice(start, end) : source.slice(start);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
