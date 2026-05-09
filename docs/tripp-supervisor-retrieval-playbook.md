# Tripp.g Supervisor Retrieval Playbook

## Purpose

This playbook defines how `tripp.supervisor` chooses between TripCore.Munch.g retrieval and native Tripp.g / Goose execution tools.

See also: `docs/agent-retrieval-responsibilities-matrix.md`.

The doctrine is simple:

- TripCore.Munch.g is the retrieval, narrowing, mapping, compression, provenance, and fallback lane.
- Native Tripp.g / Goose tools are the exact read, edit, shell, verification, and task execution lane.
- Retrieval output is evidence for action; it is not edit approval by itself.

## Choose TripCore.Munch.g First

Use TripCore.Munch.g when the request is primarily about discovery, narrowing, or context shaping:

- code discovery: find active implementation points, owner files, symbols, and call paths
- symbol or call-path tracing across files
- docs, rules, architecture, or policy lookup
- config and structured data lookup
- source-of-truth mapping across active, legacy, supporting, or contradictory files
- narrowing file scope before native reads
- token-sensitive or architecture-sensitive tasks

Preferred backend order:

- code: `tripcore-jmri` -> `jcodemunch`
- docs/spec/rules: `tripcore-jmri` -> `jdocmunch`
- data/config: `tripcore-jmri` -> `jdatamunch` -> native fallback

## Choose Native Tripp.g / Goose First

Use native tooling when the task is primarily direct execution or already narrowed:

- exact file is already known with high confidence
- direct file editing is required
- targeted shell or runtime inspection is required
- coarse repository tree inspection is enough
- final verification after retrieval has narrowed the target
- whole-file understanding is clearly required
- Munch backend health is degraded and fallback confidence is poor

## Participant Roles

`tripp.supervisor` chooses the lane, enforces routing policy, and approves escalation.

`tripp.watcher` monitors workspace state and can trigger re-retrieval when relevant files or runtime assumptions change.

`tripp.drone.one` owns primary trace and boundary mapping. It produces descriptor proposals only and does not execute.

`tripp.drone.two` cross-checks maps for forbidden paths, docs-only ownership, broad surfaces, and missing tests.

`tripp.auditor` checks retrieval scope, fallback visibility, repeated retrieval without progress, and whether retrieval stayed inside policy.

`tripp.inspector` checks whether retrieval reduced context noise, whether targets are actionable, and whether full-file escalation was justified.

`tripp.echo` projects retrieval state into the workspace UI: backend, confidence, fallback chain, narrowed files, next reads, warnings, evidence, and metadata.

## Decision Ladders

### Code Discovery

1. If the request is discovery or ownership, call `search_code`.
2. If Munch returns high-confidence owner files with symbol evidence, read exact files natively.
3. If confidence is medium or ownership is unclear, call `map_context`.
4. If active source-of-truth nodes remain unclear, surface a warning and do not proceed to edits without clarification.

### Docs And Rules

1. If the exact doc is known, read it natively.
2. Otherwise call `search_docs`.
3. If Munch returns section matches with evidence, read matched docs/sections natively.
4. If stale docs contradict active source, surface a `contradicts` relationship and prefer verified source behavior.

### Config And Data

1. If the exact config key or file is known, read it natively.
2. Otherwise call `search_data`.
3. If Munch returns `config_match` evidence, read matched config natively.
4. If no scoped match is found, surface a warning and suggest justified path widening.

### Runtime Contract Investigation

1. If live behavior matters, use native shell/process/API inspection first.
2. Use Munch for supporting doc/config retrieval.
3. Supervisor synthesizes live behavior, retrieved policy, and context-map evidence.
4. If docs and runtime disagree, surface a contradiction instead of smoothing it away.

### Edit Preparation

1. Confirm retrieval has bounded the owner surface to a small target set.
2. Reject forbidden paths, generated files, vendor files, and obvious legacy-only ownership.
3. Require import, callsite, symbol, section, or config evidence linking the target.
4. Require medium-or-higher confidence before edit planning.
5. Include related tests when present; warn when no related tests are found.
6. Escalate to guarded native edit only after supervisor and policy gates pass.

## Evidence Required Before Edit Approval

An edit may proceed only when the supervisor can see:

- owner files with `source_of_truth` or `controller` role
- evidence linking the target, such as `import`, `callsite`, `symbol_match`, `section_match`, or `config_match`
- overall confidence of at least `medium`
- backend and fallback chain provenance
- no forbidden-path warning
- rollback surface or explicit warning that related tests were not found
- task descriptor with intent, target, constraints, allowed tools, and trace
- token/retrieval budget notes when Munch was used

If evidence is missing, the supervisor denies, narrows further, or asks for human clarification.

## Workspace Projection

A Munch response should project into the Tripp.g workspace as:

- `backend`: badge
- `confidence`: meter or label
- `fallback_chain`: ordered route, with warning when length is greater than one
- `results`: narrowed clickable files with symbol, reason, and confidence
- `next_steps`: suggested next reads/actions
- `warnings`: top-of-panel banner
- `status`: `ok`, `warn`, or `fail`
- `evidence`: collapsible provenance
- `meta`: truncated, deduped, and elapsed time
- `summary`: high-signal bullets

## Summary Doctrine

Retrieval before expansion. Symbol and section search before full-file reads. Local indexed retrieval first. Token budget is a control signal.

Munch shapes and narrows. Tripp.g acts, verifies, and reports.
