# AGENTS.md

Canonical entry point for any coding agent working in this repository. If you are an agent, read this file first; everything else is reachable from here.

## What this repository is

Meno is a learning system that lives entirely in a git repository. An AI coding agent interviews a user to pin down what they actually need to learn, generates a cited curriculum sized to their goal and time budget, and tutors them through it with spaced reviews and mastery gates. A local web app on localhost renders the course and tracks progress; an append-only ledger records it.

Named for Plato's *Meno* and its paradox: how can you search for something when you don't know what it is? The clarification interview is the answer.

Meno rests on three pillars: **Obsidian** as the second brain (each tenant's `content/tenants/<tenant>/` directory is itself a vault of connected markdown), **a localhost app** for daily study, tracking, and todos, and **the agent** (you) for creating content and extending the instance.

## Route by intent

Two kinds of work happen in this repository and they touch different files. Settle which one a request is before acting on it.

- **Contributing to Meno** - changing the system itself: a skill, the study app, tooling, schemas, or the docs. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: what lands where, the gate (`npm run gate`), the eval gate required for any generation-skill change, and the fresh-session smoke test required for any skill or entry-point change. The invariants in `extend-meno` bind upstream changes too. A change meant for one instance rather than for every Meno user is an extension, not a contribution - `extend-meno` owns those.
- **Learning** - creating or changing this user's own course material. Read [docs/how-meno-works.md](docs/how-meno-works.md) for the journey end to end. A new course runs `elicit-needs`, then `generate-curriculum`, then `generate-module`. An existing course is amended through `extend-meno`'s amend-an-existing-course recipe, which owns adding, retitling, and resequencing lessons and modules. Studying is `tutor-session`.

**The boundary between the two.** Work on the repository never reads or writes anything under `content/tenants/`; the base system is built and tested against the committed `examples/` fixtures instead. Work on learning content never edits base files directly; anything that changes how this instance behaves goes through `extend-meno`, which keeps schemas, tenancy, and entry points intact.

**Where learning work becomes a contribution.** A finished course worth sharing goes through `publish-to-community`, which transcribes it onto a fresh topic-pack tree, sanitizes it, and hands it to the contributing track and its gate. That is the only path from tenant content to a pull request.

Deploying Meno for an organization is neither track - it is not a change to this repository at all. See [docs/org-deployment.md](docs/org-deployment.md).

## Current status: v1 built

All eight phases of the plan are complete: ten skills, JSON schemas with a validate
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
- `study-insights` - user-invoked only: turn a study-insights snapshot (`npm run insights`, `lib/insights.ts`) into a dated narrative report - observations, stuck points, and up to three suggestions, every number quoted from the snapshot, never computed. What to learn next belongs to `find-subjects`.
- `publish-to-community` - turn a finished tenant course into a topic-pack pull request: search first for overlapping coverage, transcribe the structure onto a fresh pack tree (never copy the tenant directory), sanitize what must never leave `content/tenants/`, then the quality gate.
- `extend-meno` - change or add to this Meno instance without breaking its invariants.
- `find-subjects` - user-invoked only: survey approved workspace roots through the deterministic scanner and write a dated narrative report of observations, up to five cited tool alternatives, and course candidates routed to a pack or a fresh `elicit-needs` interview.
- `second-brain` - vault conventions (wikilinks, hub notes), graph operations, and the `todos.md` shared queue.

**Session start, once a tenant exists:** check `content/tenants/<tenant>/progress/` for due reviews and scan `content/tenants/<tenant>/todos.md` for actionable items; mention what you find and propose, never auto-act.

## Rules for agents in this repo

- The decision record in PLAN.md is settled; do not relitigate it in passing. Propose changes explicitly if evidence warrants.
- `CLAUDE.md` stays a one-line `@AGENTS.md` shim. All agent-facing guidance lives in this file; never add instructions to `CLAUDE.md` (entry-point drift is a ranked risk in PLAN.md).
- A phase is done when its acceptance criteria pass, not when files exist.
- Writing style for all repo content: plain hyphens (never em or en dashes), acronyms expanded on first use, small focused files.
- Link syntax: wikilinks (`[[target]]`) inside tenant content (Obsidian-canonical; the app resolves them too); standard markdown links in base content, which renders on GitHub.
- Nothing under `content/tenants/` is ever committed, read into shared artifacts, or referenced by base content. Only committed fixtures under `examples/` may be referenced. The other trees under `content/` - `content/community/` and (in org clones) `content/org/` - are tracked by design; anything else under `content/` is a mistake the leakage guard blocks.
- Each canonical format has one owner (profile: elicit-needs; manifests and sourcing: generate-curriculum; lesson anatomy and check blocks: generate-module; vault, todo, and course-group conventions: second-brain; pack layout, `PACK.md`, and `CONTRIBUTORS.yml`: content/community/README.md; personal notes file: docs/specs/notes.md). Link to the owner instead of restating.
