# Plan: content accuracy machinery + the first community pack slate

Decision 19 in [PLAN.md](../../PLAN.md); interrogated and locked with the maintainer on
2026-08-05. This is the working plan - tick items off and amend as work lands. Each
workstream ships as its own pull request series through the normal gate.

## Why

Two gaps and one opportunity, surfaced under questioning:

1. **Accuracy gap.** Meno verifies *cited* claims (fetch-before-cite at generation,
   `audit-citations` after) and scores *committed fixtures* (`npm run eval`), but nothing
   checks an uncited factual claim in a freshly generated lesson, and nothing ever
   verifies that a check's marked-correct answer is correct.
2. **Empty community tier.** One pack exists. The maintainer's intern-onboarding
   curriculum is generic, public-safe subject matter that the tier was built for.
3. **Sourcing boundary needed.** Pack material draws on a private vault and personally
   authored harness craft; the line between them must be explicit and review-enforced.

## Workstream 1 - accuracy guardrail + drill pair

The enforcement-plus-drill pattern the repo already uses (sanitization catalog + blind
publish drills; write-authority seam + at-rest ledger check).

- [x] **Blocking self-audit in `generate-module`**: after drafting a lesson, (a) extract
  its factual claims; each must trace to one of the lesson's cited sources or be fixed,
  cited, or removed; (b) independently re-solve every check item and compare against the
  authored answer key; disagreement blocks the lesson. Audit results recorded in the
  module's generation notes. Owner: `generate-module` SKILL.md + references;
  spec amendment: `docs/specs/lessons.md`.
- [x] **Seeded-fault fixtures**: a lesson tree planted with known uncited-hallucination
  claims and wrong answer keys, in the `examples/seeded-faults/` pattern, with an
  answer key file naming every plant.
- [x] **Eval scorers**: `tools/eval.ts` gains claim-faithfulness and answer-key scorers
  run against the seeded-fault fixtures - the eval measures whether the *auditor
  catches the plants*, under the existing pinned-judge and anchor discipline.
  Spec amendment: `docs/specs/quality.md`.
- Deferred to backlog, deliberately: an on-demand `audit-accuracy` skill (retroactive
  sweeps reusing the same audit logic) and tutor-grading sycophancy drills (assessment
  integrity, not content accuracy).

## Workstream 2 - domains (done in the plan PR)

- [x] `meta` domain added to `content/community/DOMAINS.md` (packs about working on meno
  itself). Existing `ai-and-agents` and `software-engineering` cover the rest of the
  slate; no other vocabulary change and no second tag taxonomy.

## Workstream 3 - the five-pack slate

Hand-authored skeleton packs (the `extend-meno` draft-a-pack recipe): `course.yml` +
module manifests + cited reference notes. No lesson bodies - learners adopt and
generate against their own profile. Every pack goes through the full pack gate
(`npm run validate` pack checks, full `audit-citations` with verdicts in the PR,
`node tools/packs.ts` INDEX refresh, template attestations including the
private-source review question).

| # | Pack | Domain | Sourcing notes |
|---|------|--------|----------------|
| 1 | `intro-to-ai-and-agents` | `ai-and-agents` | Public sources only. LLM basics, agents, tool use. |
| 2 | `agent-harness-craft` | `ai-and-agents` | The maintainer's own scrubbed craft: tiered memory files, model-tier discipline, skills/hooks/subagents as concepts. No workplace specifics. |
| 3 | `git-and-github` | `software-engineering` | Public sources only. Includes PR-based flow. |
| 4 | `limits-of-agent-generated-content` | `ai-and-agents` | Public sources only: sycophancy feedback loops, hallucination, cognitive offloading costs, Dunning-Kruger. |
| 5 | `contributing-to-meno` | `meta` | Two module streams (building meno; authoring community packs). Exercise-driven; links to CONTRIBUTING.md and the owning skills, never restates them. |

- [x] All five packs landed together (each independently citation-audited and sanitization-swept; the git pack landed as an amendment to `git-fundamentals` per the search-first rule, not a new pack).

## Workstream 4 - vault-candidate scan (approval-gated)

- [x] Scan done (2026-08-05); 10-candidate list delivered to the maintainer privately, approval pending. Scan the maintainer's private knowledge base for further *generic, employer-free,
  teachable* topics; produce a candidate list with a one-line scope each. **Nothing is
  authored until the maintainer approves candidates** - the scan output itself stays
  out of the repo (it references the private source).

## Sourcing boundary (binding for every pack)

- The private vault decides *what is worth teaching*; every published claim is
  re-derived from public sources and cited to them.
- Personally authored harness/skill craft may be published once scrubbed of workplace
  specifics (employer names, project names, machine paths, internal URLs).
- Enforced at review: the pull request template's private-source attestation, checked
  by eye alongside the worked-example check.

## Risks knowingly accepted

- Human review is the only gate for worked-example-style leaks in scrubbed craft
  content; the named checklist question mitigates, not eliminates.
- The self-audit adds per-module token cost through the `claude` CLI on every
  generation.
- New judged scorers inherit the pinned-judge constraint: a judge change demotes them
  to informational until rebaselined.
- The public tier's initial topic selection visibly reads as an intern onboarding
  curriculum. Fine; named.
