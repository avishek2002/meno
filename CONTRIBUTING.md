# Contributing to Meno

A stranger should be able to improve a skill or contribute a topic pack without
degrading generation quality. This file is the whole bar; the machinery that enforces it
ships in the repo.

## What lands where

- **Skill improvements and base capabilities** - pull request against `main`. Read the
  invariants in `.agents/skills/extend-meno/SKILL.md` first; they bind upstream changes
  too.
- **Topic packs** (pre-vetted curricula) - under `topic-packs/`, same manifest formats as
  generated courses; spec in [topic-packs/README.md](topic-packs/README.md).
- **Your own learning content** - never contributed: everything under `content/` is
  tenant-scoped and gitignored by design, and a pre-commit guard (installed by
  `tools/meno-init`) blocks even a forced attempt.

## Setup and the gate

One runtime: Node 24+ (the server and tools run TypeScript directly - no build step).
`npm install` once, then:

```
npm run gate      typecheck (server + client) + all tests + validate - must be green
npm run eval      the eval gate - required for any change to a generation skill
npm run build     once, builds the study app client
npm start         the study app, for seeing your change live
```

TypeScript here is **erasable-syntax only** (`erasableSyntaxOnly` is enforced at
typecheck): no `enum`, no `namespace`, no parameter properties, `import type` for
type-only imports. Node runs the `.ts` files directly, so non-erasable syntax fails at
runtime for every user - the typecheck in the gate is what catches it first.

## The eval gate (required for generation-skill changes)

`node tools/eval.ts` scores the committed golden fixtures two ways
([docs/specs/quality.md](docs/specs/quality.md)):

- The **checklist half** is deterministic and gates absolutely - any false item fails.
- The **judged half** (a pinned claude judge, median of 3, quantized scores) gates only
  when your judge matches the baseline's `established_with`; otherwise it reports
  informationally. The anchor set (good/mediocre/bad reference lessons) must keep
  ranking correctly - broken ranking means rubric rot, not necessarily a bad change.

If your change legitimately moves quality, rebaseline deliberately -
`node tools/eval.ts --rebaseline` - and let the `evals/baselines.json` diff show every
moved number in the PR. Never rebaseline to make a red run green without saying why.

Changing the `elicit-needs` interview? Also re-run a persona interview against
`examples/golden-personas/` and diff the structured fields against the expected brief.
Changing `audit-citations`? Run a blind audit of `examples/seeded-faults/` (answer key
off-limits) and report the verdicts.

## The smoke test (required for skill or entry-point changes)

A fresh agent session in a clean clone must execute the changed skill from its files
alone - no coaching, no context from your working session. Record which CLI you ran.

| CLI | Status |
|---|---|
| Claude Code | verified - the maintainer's acceptance runs all use it |
| Codex CLI | designed-for, unverified - verification PRs welcome |
| Gemini CLI | designed-for, unverified - verification PRs welcome |

The design is CLI-agnostic (skills are plain markdown, `AGENTS.md` is canonical), and
this table stays honest about what has actually been run.

## Standing rules

1. One canonical owner per format; link to it, never restate it (owners listed in
   `AGENTS.md`).
2. Schema changes bump `schema_version` and add a line to `docs/migrations.md`;
   consumers stay permissive with stale versions.
3. Behavior changes amend the owning spec under `docs/specs/` in the same PR - a phase
   or feature is not done while its spec lies.
4. Writing style: plain hyphens (no em or en dashes), acronyms expanded on first use,
   small focused files.
5. Sources in any committed content follow fetch-before-cite
   (`.agents/skills/generate-curriculum/references/sourcing.md`) - fetched this session,
   archived, never from memory.

Pull requests are squash-merged; the checklist in the PR template is the review
contract.
