---
schema_version: 1
type: reference
title: Evals in the loop - iteration, upgrades, and suite upkeep
concepts:
  - eval-driven-iteration
  - model-upgrade-evals
  - suite-maintenance
sources:
  - title: "Prompt engineering overview (Anthropic documentation)"
    url: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    archived_url: https://web.archive.org/web/20260805093625/https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    accessed: 2026-08-05
    source_type: web
    why: source for evals as the stated prerequisite to prompt engineering and for the point that some failing evals are better solved by changing model than by changing prompt
  - title: "Demystifying evals for AI agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    archived_url: https://web.archive.org/web/20260728233804/https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    accessed: 2026-08-05
    source_type: web
    why: source for the days-not-weeks model-upgrade claim, saturation monitoring and eval refresh, and regular transcript reading to verify graders
---

# Evals in the loop - iteration, upgrades, and suite upkeep

## The suite comes before the prompt

Anthropic's
[prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
opens with an assumption list, and it is the whole argument in miniature: before any
prompt-improvement technique, you are expected to have a clear definition of success
criteria, a way to empirically test against those criteria, and a first draft to
improve. In other words, prompt engineering is defined as an activity performed
against an eval suite. The loop that follows is mechanical: change the prompt, rerun
the suite, read the score movement, keep or revert. Without the suite, every revision
is judged on the few examples the author happened to re-check, which is how prompts
"improve" on Monday and quietly regress the cases fixed the Monday before.

The same page adds a scoping caution that saves real time: not every failing eval is
best solved by prompt engineering. Some criteria - latency and cost are the named
examples - are often better met by choosing a different model than by another round
of prompt work. The suite tells you that a target is missed; deciding which lever to
pull is still an engineering judgment.

## Model upgrades as a measured decision

Anthropic's
[agent-evals engineering guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
frames the payoff at model-upgrade time: when a new model version arrives, a team
with a suite reruns it, reads where capability scores moved and whether regression
scores held, and can upgrade in days - while a team without one re-tests by hand for
weeks. The suite turns "the new model seems better" into a per-task, per-score
comparison, and the same run answers the question nobody asks by hand: what the new
model broke.

## The suite needs its own maintenance

The same guide is explicit that a suite decays if untended. Scores that plateau near
the ceiling are saturation - the eval no longer discriminates, and needs refreshed,
harder, or newly sampled cases. And because graders are code and rubrics rather than
the author's intent itself, it recommends regularly reading actual transcripts to
confirm the graders still measure what was meant - a suite that is green for the
wrong reason is worse than a red one, because nobody investigates green.
