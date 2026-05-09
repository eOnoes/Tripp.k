# Agent Retrieval Responsibilities Matrix

## Purpose

This matrix defines how Tripp.g agents participate in TripCore.Munch.g retrieval-first workflows.

Core doctrine:

- `tripp.supervisor` chooses the lane and gates action.
- TripCore.Munch.g narrows, maps, compresses, and exposes evidence.
- Native Tripp.g / Goose tooling reads, edits, executes, and verifies after evidence is sufficient.
- Drones produce descriptor proposals and trace evidence only; they do not execute.
- Auditor, inspector, and echo make retrieval safe, useful, and visible.

## tripp.supervisor

Purpose:
Owns lane selection, routing doctrine, and edit approval. It is the only role allowed to approve escalation from retrieval evidence into native action.

Inputs:
- user request
- current mode
- BridgeHealth
- retrieval responses
- TraceDroneMap and traceVerification
- Warden descriptor status
- task/session context

Outputs:
- routing decision
- approved, blocked, or escalated edit decision
- descriptor candidate
- routing state for UI projection

Allowed:
- read BridgeHealth
- call Munch `search_code`, `search_docs`, `search_data`, and `map_context`
- call native read/edit/shell/tree through guarded lanes
- invoke trace mapping
- invoke Warden pre-check

Forbidden:
- no edits without Warden-approved descriptor, Munch budget pass, Router resolution, and evidence review
- no raw prompt execution
- no bypassing Warden, Auditor, or evidence gates

Escalation triggers:
- backend health degraded
- Munch confidence below required threshold
- Trace.Drone terminal state is `TRACE_ESCALATE` or `TRACE_UNRESOLVED`
- forbidden path warning
- missing descriptor fields

UI projection:
- active lane
- backend used
- fallback chain
- confidence
- edit gate
- descriptor status
- last decision reason

## tripp.watcher

Purpose:
Observes workspace/runtime changes and recommends re-retrieval when the active source of truth may have shifted.

Inputs:
- workspace root
- file manifest
- timestamps and sizes
- active trace id
- known owner paths
- forbidden path list

Outputs:
- fact-only change events
- re-retrieval recommendation
- drift warnings
- updated owner hints

Allowed:
- monitor file manifest deltas
- compare mtime/size against prior trace
- emit events to supervisor

Forbidden:
- no execution
- no model calls
- no route selection
- no file mutation
- no claims beyond observed facts

Escalation triggers:
- owner file deleted or moved
- new file appears relevant to active task
- forbidden path unexpectedly changes

UI projection:
- watch scope
- last scan time
- delta count
- re-retrieval flag
- drift warnings

## tripp.drone.one

Purpose:
Primary read-only trace/context mapper. Produces bounded owner surface, related files, tests, chain effects, rollback surface, confidence, evidence, warnings, and terminal state.

Inputs:
- task text
- workspace root
- allowed paths
- trace id
- owner and related limits
- manifest

Outputs:
- `TraceDroneMap`
- owners
- related files
- tests
- chain effects
- rollback surface
- confidence label
- evidence
- warnings
- trace verification

Allowed:
- create workspace file manifest
- rank context files
- score files by task tokens and path/signal heuristics
- discover related tests by basename/token matching

Forbidden:
- no execution
- no model calls
- no file mutation
- no tests
- no large whole-file reads
- no Executor or pipeline calls

Escalation triggers:
- no owners found
- confidence below threshold
- docs-only ownership
- forbidden path ownership
- broad owner surface requiring tightened retry

UI projection:
- owners table
- related count
- tests count
- confidence badge
- terminal state
- chain effects
- rollback surface scope

## tripp.drone.two

Purpose:
Cross-check and validation drone. It validates the primary map for correctness, safety, and actionability before supervisor approval.

Inputs:
- drone.one map
- trace verification config
- Warden forbidden list
- task text

Outputs:
- `traceVerification`
- blocking issues
- warnings
- retry/tightening result

Allowed:
- verify trace maps
- trigger tightened remapping when allowed
- compare owner confidence thresholds
- flag docs-only ownership, broad surfaces, missing tests, and forbidden hits

Forbidden:
- no execution
- no edits
- no bypassing drone.one

Escalation triggers:
- blocking issues remain after max attempts
- docs-only ownership
- forbidden path hit
- broad surface with weak confidence

UI projection:
- verification status
- blocking issues
- checks table
- retry attempts
- tightened flag

## tripp.auditor

Purpose:
Policy authority gate. Checks that retrieval and proposed edits comply with Tripp doctrine, Warden policy, and Munch routing rules.

Inputs:
- Warden policy
- descriptor candidate
- Munch response
- trace verification
- fallback chain
- backend health
- owner context

Outputs:
- allow, deny, or require confirmation
- denial reason
- confirmation tier
- audit log entry

Allowed:
- inspect descriptor fields
- check blocked tools/intents
- validate Warden policy
- review fallback chain visibility

Forbidden:
- no execution
- no model calls
- no route selection
- no budget mutation
- no bypassing Cyst/final safety gates

Escalation triggers:
- missing required descriptor fields
- blocked tool or intent
- policy violation flag
- hidden fallback chain
- `TRACE_ESCALATE` or `TRACE_UNRESOLVED`
- forbidden path in rollback surface

UI projection:
- audit status
- blocked tools
- missing descriptor fields
- policy violation flag
- fallback visibility
- confirmation tier

## tripp.inspector

Purpose:
Quality and actionability review. Ensures retrieval outputs are concise, useful, and escalation-justified.

Inputs:
- Munch response
- TraceDroneMap
- context preview
- truncation/dedupe/elapsed metadata
- whole-file escalation history

Outputs:
- actionability score
- noise level
- escalation justified flag
- verification readiness
- warnings

Allowed:
- compare results against `max_results`
- check `meta.truncated` and `meta.deduped`
- verify whole-file escalation happened only after narrowing

Forbidden:
- no execution
- no edits
- no edit approval

Escalation triggers:
- results exceed max without justification
- truncation without warning/fallback disclosure
- repeated retrieval with same dedupe key and no new results
- whole-file read before narrowing attempt

UI projection:
- actionability badge
- noise gauge
- escalation justified flag
- verification readiness checklist
- truncation notice
- dedupe status

## tripp.echo

Purpose:
Workspace UI memory and projection layer. Records retrieval history, backend state, confidence, fallback chains, warnings, and narrowed files.

Inputs:
- Munch responses
- TraceDroneMaps
- BridgeHealth
- supervisor routing decisions
- audit outcomes

Outputs:
- persistent retrieval history
- workspace panels
- dashboard glyph state

Allowed:
- store and recall retrieval state
- render backend/confidence/fallback/narrowed files/next reads/warnings
- update context, trace, and pipeline UI surfaces

Forbidden:
- no execution
- no edits
- no lane selection
- no fabricated history

Escalation triggers:
- backend health changes
- confidence drops between retrievals
- fallback chain grows

UI projection:
- retrieval history table
- backend health badges
- confidence timeline
- fallback chain log
- narrowed files list
- next read actions
- warnings banner
- active lane indicator
- trace metadata panel
- Munch budget gauge

## Handoff Example

User asks: "Where is the active implementation for Munch health, and can we safely edit it?"

1. `tripp.supervisor` classifies the request as retrieval-first with possible edit intent.
2. `tripp.drone.one` maps candidate owner files and rollback surface.
3. TripCore.Munch.g runs `search_code` or `map_context` to narrow source-of-truth paths.
4. `tripp.drone.two` validates the trace map.
5. `tripp.auditor` checks Warden policy, forbidden paths, fallback visibility, and descriptor completeness.
6. `tripp.inspector` checks whether results are actionable and low-noise.
7. `tripp.echo` projects backend, confidence, fallback chain, warnings, narrowed files, and next reads into the workspace.
8. `tripp.supervisor` either blocks, asks for clarification, performs exact native reads, or prepares a guarded edit plan.

## Notes

The dashboard glyph mapping in the source handoff was partially truncated. Current known glyph doctrine:

- `check`: retrieval passed and backend healthy
- `x`: retrieval failed or forbidden path detected
- `?`: warning or medium confidence
- `!`: fallback used or warning surfaced
- `>`: active retrieval in progress
