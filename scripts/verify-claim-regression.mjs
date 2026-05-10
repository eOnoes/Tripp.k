import { readFileSync } from "node:fs";

const docs = {
  readinessScoreboard: readDoc("../docs/tripp-readiness-scoreboard-v0.1.md"),
  betaReleaseNotes: readDoc("../docs/read-only-beta-release-v0.1.md"),
  readOnly90GoNoGo: readDoc("../docs/read-only-90-go-no-go-checklist-v0.1.md"),
  releaseClaimCoherence: readDoc("../docs/read-only-release-claim-coherence-lock-v0.1.md"),
  claimRegressionWatch: readDoc("../docs/read-only-claim-regression-watch-v0.1.md"),
  futureWriteContract: readDoc("../docs/future-write-lifecycle-contract-v0.1.md"),
};

const scoreBlock = extractSection(docs.readinessScoreboard, "## Read-Only Goose Replacement Statement", "## Capability Statement");
const capabilityBlock = extractSection(docs.readinessScoreboard, "## Capability Statement", "## Evidence Required To Keep The 90% Claim");
const watchedSurfaces = Object.values(docs).join("\n");
const outwardClaimSurfaces = [
  docs.readinessScoreboard,
  docs.betaReleaseNotes,
  docs.readOnly90GoNoGo,
  docs.releaseClaimCoherence,
  docs.futureWriteContract,
].join("\n");
const hardClaimInflationPattern = /\b(?:Goose-equivalent|ready for next phase|nearly replaces Goose|autonomous reviewer|implementation-ready|edit-ready|write-ready|validated replacement|goose no longer needed)\b/i;
const softWordingInflationPattern = /\b(?:broader day-to-day use|mature review assistant|trusted workflow|production-trusted review|general review maturity|practical replacement)\b/i;

const checks = [
  check(
    "score qualifiers",
    scoreBlock.includes("internal, scoped readiness") &&
      scoreBlock.includes("internal, scoped, and gate-based") &&
      scoreBlock.includes("read-only planning/review") &&
      scoreBlock.includes("does not include edit/build replacement, live writes, approval/apply workflows, or broad Goose parity"),
  ),
  check(
    "capability pairing",
    capabilityBlock.includes("Current scoped read-only planning/review can") &&
      capabilityBlock.includes("Current scoped read-only planning/review cannot") &&
      capabilityBlock.includes("cannot edit files") &&
      capabilityBlock.includes("claim broad Goose parity"),
  ),
  check(
    "known limitations",
    docs.betaReleaseNotes.includes("No runtime mutation path is enabled.") &&
      docs.betaReleaseNotes.includes("No approval/apply capability exists in this beta.") &&
      docs.betaReleaseNotes.includes("Mock or planning-only retrieval is non-authoritative. It can support review and narrowing, but it cannot authorize file changes.") &&
      docs.betaReleaseNotes.includes("This beta does not include live writes, edit/build replacement, approval/apply capability, or general reasoning parity with Goose."),
  ),
  check(
    "gate scope",
    docs.betaReleaseNotes.includes("Read-Only Gate GO / NO GO reflects current read-only harness readiness only.") &&
      docs.readOnly90GoNoGo.includes("Gate GO overread") &&
      docs.releaseClaimCoherence.includes("Gate GO must never expand beyond read-only harness readiness"),
  ),
  check(
    "harness fail capable",
    docs.releaseClaimCoherence.includes("Block the release/readiness claim if:") &&
      docs.claimRegressionWatch.includes("Roll back the claim or reopen the coherence station if:") &&
      docs.claimRegressionWatch.includes("harness artifacts become informative-only rather than fail-capable"),
  ),
  check(
    "future write separation",
    docs.futureWriteContract.includes("This contract is design-only and is not active in the current read-only harness.") &&
      docs.futureWriteContract.includes("No runtime mutation path is enabled by this document.") &&
      docs.readinessScoreboard.includes("Replace Goose for edit/build work") &&
      docs.readinessScoreboard.includes("Edit/build replacement remains a separate milestone."),
  ),
  check("hard claim inflation", !hardClaimInflationPattern.test(watchedSurfaces)),
  check("soft wording inflation", !softWordingInflationPattern.test(outwardClaimSurfaces)),
];

for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} claim-regression-watch: ${item.name}`);
}

const failed = checks.filter((item) => !item.pass);
if (failed.length) {
  process.exitCode = 1;
}

function readDoc(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function check(name, pass) {
  return { name, pass: Boolean(pass) };
}

function extractSection(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  if (start < 0) return "";
  const end = source.indexOf(endHeading, start + startHeading.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}
