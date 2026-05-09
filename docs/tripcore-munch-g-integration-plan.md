# TripCore.Munch.g Integration Plan

## Purpose

TripCore.Munch.g is the retrieval-first lane for Tripp.g. It should narrow context, map source-of-truth paths, compress findings, and expose provenance before Tripp.g escalates to direct reads, edits, shell work, or verification.

## Division Of Labor

TripCore.Munch.g should own:
- code, docs, and data retrieval
- context mapping across files and symbols
- retrieval compression
- fallback chain reporting
- confidence and evidence metadata

Tripp.g should own:
- user-facing conversation and workspace projection
- supervisor routing and task lifecycle
- direct file reads after targets are narrowed
- patch previews and guarded applies
- shell execution and verification
- session, task, and swarm state

## Initial API Surface

Tripp.g should expose local adapter routes that can later forward to a real Munch bridge:

- `GET /api/tripp/munch/health`
- `POST /api/tripp/munch/retrieve`
- `POST /api/tripp/munch/context-map`

These routes should return schema-compatible objects even in mock mode. The UI and supervisor can then speak the contract before TripCore.Munch is wired in.

## Supervisor Routing Doctrine

See also: `docs/tripp-supervisor-retrieval-playbook.md`.

Prefer TripCore.Munch.g when the task asks:
- where is the active implementation?
- which file owns this behavior?
- what docs or policies define this?
- which config controls this behavior?
- what source-of-truth path should be read next?

Prefer native Tripp.g / Goose tooling when:
- the exact file is already known
- a direct edit is required
- a safe shell check is required
- final verification is needed
- backend health is degraded and retrieval confidence would be low

## Workspace Projection

The Tripp.g workspace should display Munch metadata as first-class state:
- bridge health
- mode
- backend used
- confidence
- fallback chain
- narrowed candidate files
- next reads
- warnings

## First Implementation Phase

1. Add mock-compatible Munch health and retrieval routes.
2. Surface Munch health in the `STATUS` panel.
3. Add Munch capability to `/api/tripp/health`.
4. Add verifier coverage for route shape and schema basics.
5. Keep all real TripCore.Munch calls disabled until the runtime contract is confirmed.

## Guardrails

- Do not silently widen path scope.
- Do not treat retrieval output as edit approval.
- Do not hide fallback behavior.
- Do not bulk-read files by default.
- Preserve uncertainty and confidence levels.
- Keep native Tripp.g execution lanes separate from retrieval lanes.
