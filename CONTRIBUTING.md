# Contributing to Meno

Meno is in its planning-and-drafting stage; the contribution machinery (eval gate, golden fixtures, three-CLI smoke-test protocol) arrives in Phase 8 of [PLAN.md](PLAN.md). Until then, this stub states the standing rules so early pull requests know the bar.

## What contributions land where

- **Skill improvements and new base capabilities** - pull request against `main` here. Read the invariants in `.agents/skills/extend-meno/SKILL.md` first; they apply to upstream changes too.
- **Topic packs** (pre-built curricula) - `topic-packs/`, same manifest formats as generated courses; full spec in Phase 8.
- **Your own learning content** - never contributed: everything under `content/` is tenant-scoped and gitignored by design.

## Standing rules (enforced now, tooling later)

1. One canonical owner per format; link to it, never restate it (owners listed in `AGENTS.md`).
2. Schema changes bump `schema_version` and add a line to `docs/migrations.md`.
3. Writing style: plain hyphens (no em or en dashes), acronyms expanded on first use, small focused files.
4. Skill changes get a cold-start test before the PR: a fresh agent session must execute the skill from its files alone.
5. Sources in any committed content follow the fetch-before-cite procedure (`.agents/skills/generate-curriculum/references/sourcing.md`).

Pull requests are squash-merged; the maintainer reviews. When Phase 8 lands, the eval run and smoke test become part of the checklist.
