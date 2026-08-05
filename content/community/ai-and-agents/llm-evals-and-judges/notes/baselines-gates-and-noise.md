---
schema_version: 1
type: reference
title: Baselines, guard bands, and the noise underneath eval scores
concepts:
  - regression-gating
  - guard-bands
  - rebaselining
  - run-history
sources:
  - title: "A statistical approach to model evaluations (Anthropic research)"
    url: https://www.anthropic.com/research/statistical-approach-to-model-evals
    archived_url: https://web.archive.org/web/20260724045342/https://www.anthropic.com/research/statistical-approach-to-model-evals
    accessed: 2026-08-05
    source_type: web
    why: source for treating eval scores as noisy measurements - standard error of the mean, clustered standard errors over three times naive ones, paired-difference comparisons, and power analysis
  - title: "CI/CD integration (promptfoo documentation)"
    url: https://www.promptfoo.dev/docs/integrations/ci-cd/
    archived_url: https://web.archive.org/web/20260411010419/https://www.promptfoo.dev/docs/integrations/ci-cd/
    accessed: 2026-08-05
    source_type: web
    why: source for the pipeline mechanics - evals run on every change, builds halted on failures, minimum pass-rate thresholds enforced from parsed results
  - title: "Demystifying evals for AI agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    archived_url: https://web.archive.org/web/20260728233804/https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    accessed: 2026-08-05
    source_type: web
    why: source for the regression-versus-capability eval distinction and for the claim that teams without evals cannot distinguish genuine regressions from noise
---

# Baselines, guard bands, and the noise underneath eval scores

## The gate

A regression gate is the eval-suite analogue of a failing test blocking a merge: the
suite runs against every candidate change, the aggregate score is compared with a
stored baseline, and the change is rejected when the score falls short. promptfoo's
[continuous-integration guide](https://www.promptfoo.dev/docs/integrations/ci-cd/)
shows the mechanics in a shipping framework: evals run in the pipeline before
deployment, a failure flag halts the build, and a minimum pass rate is enforced by
parsing the machine-readable results and exiting nonzero when the threshold is
missed. Anthropic's
[agent-evals engineering guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
distinguishes the two suite roles the gate serves: regression evals, which are
expected to hold near 100 percent and exist to catch quality falling, and capability
evals, which start low and measure progress toward new abilities.

## The noise, and the guard band

An eval score is a sample statistic, not a truth. Anthropic's research note
[A statistical approach to model evaluations](https://www.anthropic.com/research/statistical-approach-to-model-evals)
makes the point quantitatively: a score should be reported with its standard error of
the mean, so a reader can tell a real difference from the luck of the question draw.
When questions come in related clusters (several questions about one passage),
clustered standard errors can be more than three times the naive calculation - a gate
sized without accounting for that will flag phantom regressions or miss real ones.
Two further tools shrink the uncertainty: comparing candidates on paired
per-question differences (models tend to get the same questions right and wrong, so
pairing cancels shared difficulty), and power analysis to decide how many questions
the suite needs before a difference of the size worth catching is reliably
detectable. A guard band - the tolerance around the baseline inside which movement is
treated as noise - should be sized from these numbers, not from a round number that
felt safe.

## Baseline discipline

Two practices keep a gate meaningful over time. First, the baseline moves only
deliberately: when a change legitimately improves or intentionally trades off scores,
the new baseline is recorded as an explicit, reasoned act - never silently absorbed,
or the gate degrades into comparing each run with whatever the last run happened to
produce. Second, every run is appended to a history that is never rewritten: which
suite version, which prompt, which model, which scores. The statistical note's
premise - that deciding whether a difference is real requires comparing measurements -
assumes the past measurements still exist and are trustworthy; an append-only record
is what makes a score movement auditable back to the change that caused it, and what
turns rebaselining from an assertion into a logged, reviewable event.
