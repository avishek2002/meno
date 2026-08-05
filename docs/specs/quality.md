# Quality spec: evals, baselines, smoke protocol, topic packs

*Status: current as of Phase 8, amended for the decision 19 accuracy workstream (the
auditor drill). Canonical formats owned elsewhere: fixtures are the committed example
trees (their formats have their usual owners); the pack format in
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
7. The **auditor drill** (`auditor-accuracy`) is judged-half machinery for the
   generate-module blocking self-audit: it runs the audit prompt (claim audit plus
   check re-solve, strict JSON findings) through the same pinned `claude -p` discipline
   against every lesson of `examples/seeded-faults/accuracy-fixture/`, three full
   passes, median plants-caught recall. A plant counts as caught when a finding matches
   its lesson and type - uncited-claim quotes fuzzy-matched (normalized containment, or
   0.6 token overlap as the paraphrase fallback), wrong-key check ids matched
   case-insensitively. Findings on the control lesson are counted as false alarms and
   reported, but never gate. Recall gates against `recall_min` in
   `evals/baselines.json` only under an identical auditor - its `established_with`
   records `auditor_model` + `audit_prompt_sha256` - with the same 0.1 guard band;
   `--rebaseline` writes it. `--no-judge` skips the drill along with the judge (it
   cannot run without the `claude` CLI); `--skill audit` runs it alone. A non-parsing
   auditor response, or a finding outside the contract, is an eval ERROR, never a zero.
8. Skills whose evals are inherently agentic run as documented manual protocols instead:
   the interview (persona re-run + brief diff), the audit (blind run against
   `examples/seeded-faults/` with the answer key off-limits). Both were executed and
   recorded in their phases' pull requests; CONTRIBUTING requires re-running them when
   those skills change.

## The auditor drill's fixture contract

`examples/seeded-faults/accuracy-fixture/ANSWER-KEY.md` is the scoring contract. The
drill parses its YAML frontmatter with the shared frontmatter implementation; field
names are binding:

- `plants` - the seeded faults the auditor must catch. Each entry names its `lesson`
  (path relative to the fixture root) and `type`. `uncited-claim` entries carry
  `quote`, the planted sentence verbatim; `wrong-key` entries carry `check_id`,
  `marked` (the authored wrong answer), and `correct` (the actually correct one). For
  multiple-choice (`mcq`) checks `marked`/`correct` are the 1-based option index as a
  string; for cloze checks, the fill text.
- `controls` - lessons that are fully clean; any finding on them is a false alarm
  (reported, informational, never gating).

The fixture is structurally valid on purpose - its faults are semantic, never
schema-visible - so the default validate run stays clean over `examples/`.

What the drill honestly measures: the audit PROMPT, not a live generate-module run.
The skill executes its self-audit inside an agent loop - fetched sources, interactive
fixes, generation notes - that the eval cannot reproduce; the drill is the closest
measurable proxy, the same stance as the manual protocols for the interview and audit
skills. And it is a recall gate only: findings on the seeded lessons that match no
plant are unscored either way, so the control lesson is the drill's sole precision
sample - a trigger-happy auditor shows up in the reported false alarms, never in the
gate.

## Architecture

- `tools/eval.ts` - the runner; imports the same shared implementations as everything
  else (`lib/lesson.ts`, `lib/frontmatter.ts`, validate's checks) so eval and validate
  can never disagree about a fixture.
- `evals/baselines.json` - per-fixture `judged_min` + `established_with`; the
  `auditor-accuracy` entry carries `recall_min` + its own `established_with`
  (`auditor_model` + `audit_prompt_sha256`).
- `examples/seeded-faults/accuracy-fixture/` - the auditor drill's target tree;
  its `ANSWER-KEY.md` frontmatter is the scoring contract above.
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
| the `claude` CLI | execFile (judge + auditor) | eval | pinned models |

## Invariants

1. Checklist and judged halves are never averaged; only the checklist gates
   unconditionally.
2. Judged scores gate only under an identical judge (model + prompt hash).
3. A non-parsing judge or auditor response is an error, not a zero.
4. Anchor ranking (good > mediocre > bad, 0.5+ separation) must hold for judged scores
   to count.
5. Rebaselining is manual and diff-visible; runs.jsonl is append-only.
6. Eval imports shared implementations - no parallel parsers, no private grading logic.
7. The auditor drill gates recall only under an identical auditor (model +
   audit-prompt hash); control-lesson false alarms are informational, never gating.
8. The drill scores the audit prompt as a proxy; it makes no claim about a live
   generate-module run.

## Verified by

- The Phase 8 acceptance runs (recorded in the PR): a full establishment run and an
  independent verification run, both green - checklists 43/43, judged medians above
  their guard-banded baselines, anchors ranked 0.8 / 0.45-0.5 / 0 across runs.
- Invariant 3-4 behavior: exercised live during Phase 8 (a polluted judge stdout was an
  error; a mediocre anchor scoring 0 failed the ranking check until the anchor was
  actually mediocre).
- The manual protocols: executed in Phases 1 and 6, recorded in those PRs.
- The auditor drill: its scoring logic was exercised against the committed answer key
  (parsing, verbatim-quote presence, fuzzy-match behavior) and a single live auditor
  call caught all three plants in the second seeded lesson with contract-shaped JSON.
  The `auditor-accuracy` baseline is established by a deliberate `--rebaseline` run in
  the accuracy workstream's PRs; until that lands, the drill reports without gating.

## Open questions

1. Whether the judged half should grow per-criterion baselines (not just overall) once
   enough runs accumulate to see which criteria are stable - revisit after real
   contributor traffic.
