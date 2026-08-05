# AGENTS.md

Canonical entry point for any coding agent working in this repository. If you are an agent, read this file first; everything else is reachable from here.

## What this repository is

Meno is a learning system that lives entirely in a git repository. An AI coding agent interviews a user to pin down what they actually need to learn, generates a cited curriculum sized to their goal and time budget, and tutors them through it with spaced reviews and mastery gates. A static site renders the course; an append-only ledger tracks progress.

Named for Plato's *Meno* and its paradox: how can you search for something when you don't know what it is? The clarification interview is the answer.

## Current status: planning phase

**No implementation exists yet.** The build has not started; do not scaffold skills, schemas, or site code unless the maintainer asks for a numbered phase from the plan.

- [PLAN.md](PLAN.md) - the approved phased build plan, decision record, and acceptance criteria. Start here.
- [docs/RESEARCH.md](docs/RESEARCH.md) - the evidence base behind every design decision.
- [PROGRESS.md](PROGRESS.md) - live done/backlog tracker.

## Rules for agents in this repo

- The decision record in PLAN.md is settled; do not relitigate it in passing. Propose changes explicitly if evidence warrants.
- `CLAUDE.md` stays a one-line `@AGENTS.md` shim. All agent-facing guidance lives in this file; never add instructions to `CLAUDE.md` (entry-point drift is a ranked risk in PLAN.md).
- A phase is done when its acceptance criteria pass, not when files exist.
- Writing style for all repo content: plain hyphens (never em or en dashes), acronyms expanded on first use, small focused files.
- Once tenancy exists (Phase 0): nothing under `content/` is ever committed, read into shared artifacts, or referenced by base content. Only `examples/example-learner/` may be referenced.
