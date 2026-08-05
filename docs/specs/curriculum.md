# Curriculum spec

*Status: current as of Phase 2. Canonical formats owned elsewhere: manifests in
[generate-curriculum/references/manifest-format.md](../../.agents/skills/generate-curriculum/references/manifest-format.md),
source records and the fetch-before-cite rule in
[generate-curriculum/references/sourcing.md](../../.agents/skills/generate-curriculum/references/sourcing.md),
hub note anatomy in
[second-brain/references/vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md).*

## Purpose

Turns a confirmed learning contract into everything above the lesson level: objectives,
module structure, verified sources, and the visual course map - before any prose exists.
Backward design is the point: assessments and objectives are fixed first so lessons are
written toward known targets, and the budget arithmetic is honest so the course actually
fits the learner's life.

## How it behaves

1. Runs only against a `status: confirmed` profile; refuses otherwise.
2. Fixes 3-6 course objectives first, every one a Bloom-verb statement at or below the
   profile's `bloom_ceiling`, each with an `assessed_by` naming how mastery will show.
3. Decomposes into prerequisite-ordered modules sized 2-6 hours, at least two sibling
   concepts per module wherever the material allows (interleaving needs siblings), with
   estimated hours summing to the contract budget, at most 10 percent over.
4. Anchors every module on 2-4 sources actually fetched and read in the generating
   session, each archived to the Wayback Machine at generation time. A source that could
   not be fetched is not cited. User-supplied material under `sources/` outranks web
   sources where it covers a module.
5. Writes per-module `module.yml` manifests (the mutable truth) and regenerates
   `course.yml` (the derived view - never hand-edited), then writes the course hub note
   with a Mermaid dependency map inside derived markers and wires it into the tenant home
   note.
6. Ends by invoking `generate-module` for module 1 immediately, so study starts the same
   session (decision 6). Later modules stay `skeleton` with `planned` lessons until
   review sessions pull them.
7. Escape hatch: if fetched sources reveal the topic cannot honestly fit the contracted
   budget at the contracted depth, it stops and reopens the interview's re-clarification
   instead of silently padding or thinning.

## Architecture

- `.agents/skills/generate-curriculum/SKILL.md` - the procedure (agent-executed).
- `schemas/course.schema.json`, `schemas/module.schema.json` - the machine-checkable
  manifest contracts.
- `tools/validate.ts` - `manifests`, `refs`, `citations`, and `hub` checks
  ([validation.md](validation.md)): schema conformance, derived-view drift, Bloom
  ceiling, budget arithmetic, source-record integrity, dependency-map presence.
- `examples/example-learner/rust-for-backend/` and
  `examples/golden-personas/priya-nair/understanding-llm-agents/` - two contrasting
  committed skeletons (build/24h and orient/8h) serving as fixtures.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `<course>/profile.md` | read | agent | profile-format.md |
| `<course>/modules/NN-slug/module.yml` | write | agent | manifest-format.md |
| `<course>/course.yml` | write (regenerate wholesale) | agent | manifest-format.md |
| `<course>/<slug>-hub.md` | write (derived region only) | agent | vault-conventions.md |
| `<tenant>/home.md` | write (derived region only) | agent | vault-conventions.md |
| `<tenant>/sources/` | read | agent | learner-supplied files |

## Invariants

1. No skeleton generates from an unconfirmed profile.
2. No objective, course-level or module-level, exceeds the profile's Bloom ceiling.
3. Module `est_hours` sum to at most 110 percent of `budget_hours`.
4. Every web anchor source was fetched in the generating session and carries a resolving
   Wayback `archived_url` (or an explicit reason in `why`).
5. `course.yml` is always regenerable from the module manifests; any drift between them
   is a defect in the writer, not data to preserve.
6. Slugs are stable once created; wikilinks and manifests bind to them.

## Verified by

- Invariants 2-5: `tools/validate.ts` checks (`refs`, `citations`, `manifests`) plus
  `tools/test/courses.test.ts` (8 cases, valid and broken trees).
- Invariant 4's "actually resolves": Phase 2 acceptance run - every `archived_url` in the
  committed skeletons was resolved with an HTTP check; recorded in the Phase 2 pull
  request. Liveness over time belongs to the Phase 6 audit skill.
- Invariant 1: procedural (stated in the skill); the app renders draft-profile courses as
  not-startable from Phase 4.
- The dependency map rendering on GitHub: verified by viewing the committed hub note on
  github.com (mermaid fences render natively).

## Open questions

1. ~~Topic-pack budget rule~~ - resolved Phase 8: packs have no profile, so budget checks
   are skipped; audience and rough hours are stated in the pack's hub note
   (topic-packs/README.md).
