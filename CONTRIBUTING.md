# Contributing to Meno

A stranger should be able to improve a skill or contribute a topic pack without
degrading generation quality. This file is the whole bar; the machinery that enforces it
ships in the repo.

## What lands where

- **Skill improvements and base capabilities** - pull request against `main`. Read the
  invariants in `.agents/skills/extend-meno/SKILL.md` first; they bind upstream changes
  too.
- **Topic packs** (pre-vetted curricula) - under `content/community/<domain>/<slug>/`, same
  manifest formats as generated courses; spec in
  [content/community/README.md](content/community/README.md). A pack
  built from an existing tenant course goes through
  [`publish-to-community`](.agents/skills/publish-to-community/SKILL.md) (search-first,
  transcribe-never-copy, sanitize, quality gate) and fills the pull request template's
  "Publishing to the community tier" block; a hand-authored pack uses `extend-meno`'s
  draft-a-topic-pack recipe instead.
- **Your own learning content** - never contributed: everything under `content/tenants/` is
  tenant-scoped and gitignored by design, and a pre-commit guard (installed by
  `tools/meno-init`) blocks even a forced attempt - it refuses any staged path under
  `content/` outside `content/community/` and `content/org/`.
- **Org deployments** (a shared knowledge base for an organization, with roles and review) -
  not a change to this repository at all: see [docs/org-deployment.md](docs/org-deployment.md).

## Setup and the gate

One runtime: Node 24+ (the server and tools run TypeScript directly - no build step).
`npm install` once, then:

```
npm run gate      typecheck (server + client) + all tests + validate - must be green
npm run eval      the eval gate - required for any change to a generation skill
npm run build     once, builds the study app client
npm start         the study app, for seeing your change live
```

`npm run gate`, `npm run build`, and `node tools/packs.ts --check` also run in CI on every
pull request (`.github/workflows/gate.yml`) - the same commands, so a green run here means
a green run there. `npm run eval` cannot run in CI (it shells out to the `claude` CLI),
which is why it stays a reported manual step below.

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
Changing `audit-citations`? Run a blind audit of `examples/seeded-faults/audit-fixture/`
(answer key off-limits) and report the verdicts. Changing `publish-to-community`? Run a blind
publish drill against `examples/seeded-faults/publish-fixture/` (answer key off-limits) and
report which seeded leaks were caught and which were missed.

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

## Found a vulnerability?

Do not open a pull request or a public issue for it. [SECURITY.md](SECURITY.md) has the
private channel, the threat model, and what is already known and tracked.

## How contributions are reviewed

Reviewing a contribution to this repository is an act of execution, not just of reading:
`tools/` runs during the gate, `.agents/skills/` is followed by an agent holding tool
access, and `tools/org-sync.sh` carries whatever lands on `main` into private org
deployments. Two consequences, both binding on reviewers as much as on contributors:

- **CI runs the gate, not the maintainer's laptop.** An unreviewed branch is not checked
  out and run locally to find out whether it is green; that is what
  `.github/workflows/gate.yml` is for.
- **Some diffs are code review even when they do not look like code.** Anything under
  `.github/`, `tools/` (including `tools/test/**`, which `npm test` globs and executes),
  `.agents/skills/**`, `package.json`, `package-lock.json`, `app/client/vite.config.ts`,
  or the entry-point markdown changes what this repository *does* when someone runs it.
  `.github/CODEOWNERS` is the list, and [docs/specs/supply-chain.md](docs/specs/supply-chain.md)
  says what is machine-checked and what is not.

Pull requests are squash-merged; the checklist in the PR template is the review
contract.
