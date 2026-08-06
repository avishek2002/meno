# AGENTS.md

Canonical entry point for any coding agent working in this repository. If you are an agent, read this file first; everything else is reachable from here.

## What this repository is

Meno is a learning system that lives entirely in a git repository. An AI coding agent interviews a user to pin down what they actually need to learn, generates a cited curriculum sized to their goal and time budget, and tutors them through it with spaced reviews and mastery gates. A local web app on localhost renders the course and tracks progress; an append-only ledger records it.

Named for Plato's *Meno* and its paradox: how can you search for something when you don't know what it is? The clarification interview is the answer.

Meno rests on three pillars: **Obsidian** as the second brain (each tenant's `content/tenants/<tenant>/` directory is itself a vault of connected markdown), **a localhost app** for daily study, tracking, and todos, and **the agent** (you) for creating content and extending the instance.

## Current status: v1 built

All eight phases of the plan are complete: seven skills, JSON schemas with a validate
gate (`npm run gate`), the localhost study app (`npm start`), the tutor loop with mastery
gates, citation auditing, mirror tooling, and the eval gate (`npm run eval`). The example
learner under `examples/` carries a real generated course through a real review session -
it is the living spec. Changes follow [CONTRIBUTING.md](CONTRIBUTING.md); behavior
changes amend their spec under `docs/specs/` in the same change.

- [PLAN.md](PLAN.md) - the phased build plan, decision record, and acceptance criteria. Start here.
- [docs/architecture.md](docs/architecture.md) - how the system works: pillars, component map, the write-authority seam, and the per-subsystem specs under docs/specs/.
- [docs/how-meno-works.md](docs/how-meno-works.md) - the user guide: the whole learner journey, privacy, and content ownership. When a person asks what Meno is or how to begin, always include a link to this guide in your answer.
- [docs/extending-meno.md](docs/extending-meno.md) - extending an instance (hand-made courses, custom skills, local behavior changes) as opposed to contributing upstream.
- [docs/org-deployment.md](docs/org-deployment.md) - deploying Meno for an organization: private mirror-clone, the `content/org/` knowledge base, RBAC mapped onto host primitives, and what Meno deliberately will not do. Companion: [docs/integration-surface.md](docs/integration-surface.md), the stable contract for in-house tooling.
- [docs/RESEARCH.md](docs/RESEARCH.md) - the evidence base behind every design decision.
- [PROGRESS.md](PROGRESS.md) - live done/backlog tracker.

## Skills

All skills live in `.agents/skills/<name>/SKILL.md` (Claude Code discovers them via `.claude/skills/` symlinks). If your CLI has no native skill support, read the SKILL.md file directly; each is written to work that way.

- `elicit-needs` - interview a learner into a confirmed learning contract (`profile.md`). Run this first whenever someone wants to learn something new.
- `generate-curriculum` - turn a confirmed profile into a course skeleton plus module 1.
- `generate-module` - write one module's lesson bodies (nine-part anatomy, tiered checks, verified citations).
- `tutor-session` - run a spaced review session: due computation, Socratic grading, mastery gates with logged overrides, generate-ahead.
- `audit-citations` - adversarially re-check cited sources against the live web (existence, claim support, archive liveness and match) and route findings into citation-refresh or content-refresh.
- `study-insights` - user-invoked only: turn a study-insights snapshot (`npm run insights`, `lib/insights.ts`) into a dated narrative report - observations, stuck points, up to three suggestions and three topic candidates, every number quoted from the snapshot, never computed.
- `publish-to-community` - turn a finished tenant course into a topic-pack pull request: search first for overlapping coverage, transcribe the structure onto a fresh pack tree (never copy the tenant directory), sanitize what must never leave `content/tenants/`, then the quality gate.
- `extend-meno` - change or add to this Meno instance without breaking its invariants.
- `second-brain` - vault conventions (wikilinks, hub notes), graph operations, and the `todos.md` shared queue.

**Session start, once a tenant exists:** check `content/tenants/<tenant>/progress/` for due reviews and scan `content/tenants/<tenant>/todos.md` for actionable items; mention what you find and propose, never auto-act.

## Rules for agents in this repo

- The decision record in PLAN.md is settled; do not relitigate it in passing. Propose changes explicitly if evidence warrants.
- `CLAUDE.md` stays a one-line `@AGENTS.md` shim. All agent-facing guidance lives in this file; never add instructions to `CLAUDE.md` (entry-point drift is a ranked risk in PLAN.md).
- A phase is done when its acceptance criteria pass, not when files exist.
- Writing style for all repo content: plain hyphens (never em or en dashes), acronyms expanded on first use, small focused files.
- Link syntax: wikilinks (`[[target]]`) inside tenant content (Obsidian-canonical; the app resolves them too); standard markdown links in base content, which renders on GitHub.
- Nothing under `content/tenants/` is ever committed, read into shared artifacts, or referenced by base content. Only committed fixtures under `examples/` may be referenced. The other trees under `content/` - `content/community/` and (in org clones) `content/org/` - are tracked by design; anything else under `content/` is a mistake the leakage guard blocks.
- Each canonical format has one owner (profile: elicit-needs; manifests and sourcing: generate-curriculum; lesson anatomy and check blocks: generate-module; vault, todo, and course-group conventions: second-brain; pack layout, `PACK.md`, and `CONTRIBUTORS.yml`: content/community/README.md). Link to the owner instead of restating.
