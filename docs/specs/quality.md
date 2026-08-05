# Quality spec: evals, baselines, smoke protocol, topic packs

*Status: current as of Phase 8. Canonical formats owned elsewhere: fixtures are the
committed example trees (their formats have their usual owners); the pack format in
[content/community/README.md](../../content/community/README.md).*

## Purpose

Lets a stranger change a generation skill without silently degrading what it generates.
The gate has to survive two hard facts: most of what matters about generated content is
not schema-checkable, and any model-judged score stops being comparable the moment the
judge changes.

## How it behaves

1. `node tools/eval.ts` (also `npm run eval`) scores four committed fixtures - two
   interview profiles, the Rust curriculum skeleton, and the module 1-2 lessons - in two
   halves reported separately, never averaged.
2. The **checklist half** is deterministic, offline, and zero-model: exact structured
   fields against the golden briefs, validate cleanliness, budget and ceiling rules,
   anatomy 9/9, authored-id uniqueness, archive coverage. Any false item fails the run.
   These items gate a pull request absolutely.
3. The **judged half** scores content against fixed rubrics with a pinned judge
   (`claude -p`, model pinned in `tools/eval.ts`, prompt hashed): three samples, median,
   scores on the quantized {0, 0.25, 0.5, 0.75, 1} grid. A non-parsing judge response is
   an eval ERROR, never a zero (a harness bug must not poison baselines).
4. Judged scores gate only under an **identical judge**: the fixture's baseline records
   `established_with` (judge model + prompt sha256); a differing judge demotes the
   judged half to informational. Baselines carry a 0.1 guard band under the observed
   median, because medians vary slightly run to run on identical content and a flaky
   gate gets ignored.
5. The **anchor set** - three reference lessons at known quality (good, mediocre, bad) -
   is scored every run. The judged half is trusted only while `good > mediocre > bad`
   holds with at least 0.5 separation between good and bad; broken ranking means the
   rubric or judge rotted, and the honest move is rebaselining, not trusting numbers.
6. Every run appends to `evals/runs.jsonl` (append-only, committed):
   judge identity, per-fixture results, anchor scores. `--rebaseline` rewrites
   `evals/baselines.json` so every moved number shows in a PR diff - deliberate, never
   automatic.
7. Skills whose evals are inherently agentic run as documented manual protocols instead:
   the interview (persona re-run + brief diff), the audit (blind run against
   `examples/seeded-faults/` with the answer key off-limits). Both were executed and
   recorded in their phases' pull requests; CONTRIBUTING requires re-running them when
   those skills change.

## Architecture

- `tools/eval.ts` - the runner; imports the same shared implementations as everything
  else (`lib/lesson.ts`, `lib/frontmatter.ts`, validate's checks) so eval and validate
  can never disagree about a fixture.
- `evals/baselines.json` - per-fixture `judged_min` + `established_with`.
- `evals/runs.jsonl` - the append-only run history (the ledger discipline, reused).
- `evals/anchors/` - the mediocre and bad reference lessons (good is the real committed
  lesson).
- Fixtures are the committed example trees - the same artifacts the app renders and the
  docs cite, so the living spec and the eval corpus cannot drift apart.

## The smoke protocol

For skill or entry-point changes: a fresh agent session in a clean clone executes the
changed skill from its files alone. Honest coverage table lives in
[CONTRIBUTING.md](../../CONTRIBUTING.md): Claude Code verified; Codex and Gemini CLIs
designed-for, unverified - the model-agnostic claim is a design claim, and the table
says exactly how far it has been tested.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `examples/**` (fixtures) | read | eval | owned formats |
| `evals/baselines.json` | write (`--rebaseline` only) | eval | JSON |
| `evals/runs.jsonl` | append | eval | JSONL |
| the `claude` CLI | execFile (judge) | eval | pinned model |

## Invariants

1. Checklist and judged halves are never averaged; only the checklist gates
   unconditionally.
2. Judged scores gate only under an identical judge (model + prompt hash).
3. A non-parsing judge response is an error, not a zero.
4. Anchor ranking (good > mediocre > bad, 0.5+ separation) must hold for judged scores
   to count.
5. Rebaselining is manual and diff-visible; runs.jsonl is append-only.
6. Eval imports shared implementations - no parallel parsers, no private grading logic.

## Verified by

- The Phase 8 acceptance runs (recorded in the PR): a full establishment run and an
  independent verification run, both green - checklists 43/43, judged medians above
  their guard-banded baselines, anchors ranked 0.8 / 0.45-0.5 / 0 across runs.
- Invariant 3-4 behavior: exercised live during Phase 8 (a polluted judge stdout was an
  error; a mediocre anchor scoring 0 failed the ranking check until the anchor was
  actually mediocre).
- The manual protocols: executed in Phases 1 and 6, recorded in those PRs.

## Open questions

1. Whether the judged half should grow per-criterion baselines (not just overall) once
   enough runs accumulate to see which criteria are stable - revisit after real
   contributor traffic.
