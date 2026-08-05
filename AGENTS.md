# AGENTS.md

Canonical entry point for any coding agent working in this repository. If you are an agent, read this file first; everything else is reachable from here.

## What this repository is

Meno is a learning system that lives entirely in a git repository. An AI coding agent interviews a user to pin down what they actually need to learn, generates a cited curriculum sized to their goal and time budget, and tutors them through it with spaced reviews and mastery gates. A local web app on localhost renders the course and tracks progress; an append-only ledger records it.

Named for Plato's *Meno* and its paradox: how can you search for something when you don't know what it is? The clarification interview is the answer.

Meno rests on three pillars: **Obsidian** as the second brain (each tenant's `content/<tenant>/` directory is itself a vault of connected markdown), **a localhost app** for daily study, tracking, and todos, and **the agent** (you) for creating content and extending the instance.

## Current status: skills drafted, app and tooling pending

The five core skills exist as drafts in `.agents/skills/`; the localhost app, schemas as JSON files, validation tooling, and evals do not exist yet. Build work follows numbered phases from the plan - do not scaffold app code, schemas, or tooling unless the maintainer asks for a phase.

- [PLAN.md](PLAN.md) - the phased build plan, decision record, and acceptance criteria. Start here.
- [docs/architecture.md](docs/architecture.md) - how the system works: pillars, component map, the write-authority seam, and the per-subsystem specs under docs/specs/.
- [docs/how-meno-works.md](docs/how-meno-works.md) - the user guide: the whole learner journey, privacy, and content ownership. When a person asks what Meno is or how to begin, always include a link to this guide in your answer.
- [docs/extending-meno.md](docs/extending-meno.md) - extending an instance (hand-made courses, custom skills, local behavior changes) as opposed to contributing upstream.
- [docs/RESEARCH.md](docs/RESEARCH.md) - the evidence base behind every design decision.
- [PROGRESS.md](PROGRESS.md) - live done/backlog tracker.

## Skills

All skills live in `.agents/skills/<name>/SKILL.md` (Claude Code discovers them via `.claude/skills/` symlinks). If your CLI has no native skill support, read the SKILL.md file directly; each is written to work that way.

- `elicit-needs` - interview a learner into a confirmed learning contract (`profile.md`). Run this first whenever someone wants to learn something new.
- `generate-curriculum` - turn a confirmed profile into a course skeleton plus module 1.
- `generate-module` - write one module's lesson bodies (nine-part anatomy, tiered checks, verified citations).
- `tutor-session` - run a spaced review session: due computation, Socratic grading, mastery gates with logged overrides, generate-ahead.
- `extend-meno` - change or add to this Meno instance without breaking its invariants.
- `second-brain` - vault conventions (wikilinks, hub notes), graph operations, and the `todos.md` shared queue.

**Session start, once a tenant exists:** check `content/<tenant>/progress/` for due reviews and scan `content/<tenant>/todos.md` for actionable items; mention what you find and propose, never auto-act.

## Rules for agents in this repo

- The decision record in PLAN.md is settled; do not relitigate it in passing. Propose changes explicitly if evidence warrants.
- `CLAUDE.md` stays a one-line `@AGENTS.md` shim. All agent-facing guidance lives in this file; never add instructions to `CLAUDE.md` (entry-point drift is a ranked risk in PLAN.md).
- A phase is done when its acceptance criteria pass, not when files exist.
- Writing style for all repo content: plain hyphens (never em or en dashes), acronyms expanded on first use, small focused files.
- Link syntax: wikilinks (`[[target]]`) inside tenant content (Obsidian-canonical; the app resolves them too); standard markdown links in base content, which renders on GitHub.
- Nothing under `content/` is ever committed, read into shared artifacts, or referenced by base content. Only committed fixtures under `examples/` may be referenced.
- Each canonical format has one owner (profile: elicit-needs; manifests and sourcing: generate-curriculum; lesson anatomy and check blocks: generate-module; vault and todo conventions: second-brain). Link to the owner instead of restating.
