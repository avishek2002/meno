---
schema_version: 1
type: reference
title: Why evals, not vibes - the case for labelled sets
concepts:
  - evals-vs-vibes
  - labelled-eval-sets
  - golden-examples
sources:
  - title: "Demystifying evals for AI agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    archived_url: https://web.archive.org/web/20260728233804/https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    accessed: 2026-08-05
    source_type: web
    why: source for the claims that manual testing breaks down at scale, that teams without evals cannot distinguish regressions from noise, and for the 20-50-tasks-from-real-failures starting size
  - title: "Define success criteria and build evaluations (Anthropic documentation)"
    url: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    archived_url: https://web.archive.org/web/20260805034126/https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    accessed: 2026-08-05
    source_type: web
    why: source for measurable success criteria, task-specific eval design with edge cases, and the volume-over-quality guidance for test questions
---

# Why evals, not vibes - the case for labelled sets

## Spot-checking does not scale

Anthropic's engineering guide on agent evals,
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents),
is direct about the failure mode this pack exists to prevent: early teams get by on
manual testing and intuition, but that approach breaks down as a model-backed system
grows. Without systematic evaluation a team is flying blind - unable to distinguish a
genuine regression from noise, stuck reacting to production surprises instead of
catching problems before they ship. Reading a handful of outputs after each change
tests only the examples someone happened to try, on the day they happened to try them;
nothing re-runs yesterday's failures against today's prompt. Evals are the mechanism
that makes quality changes visible before users see them.

## What a labelled eval set is

An eval set is a fixed collection of test cases - each an input plus a labelled
expectation - that is run, in bulk and automatically, against every candidate change.
The label is what separates an eval from a demo: a golden example records the input,
the reference answer or expected properties, and the criteria for passing, so a
scorer can decide pass or fail without a human re-judging from scratch each time.

The same engineering guide argues against waiting for a comprehensive suite: start
with roughly 20 to 50 simple tasks drawn from real observed failures, and let the
suite grow as the system matures - larger sets become necessary only when detecting
smaller improvements matters. It also sets the bar for a well-written case: the
specification should be unambiguous enough that two domain experts would reach the
same verdict on any transcript.

## Design guidance for the set

Anthropic's evaluation documentation,
[Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests),
adds the design rules a first set should follow. Success criteria must be specific
and measurable - "accurate classification" is not a criterion, a target accuracy on a
defined test set is. Cases should mirror the real task distribution and deliberately
include edge cases: irrelevant or nonexistent input, overly long input, poor or
harmful user input, ambiguous cases. And on sizing, the guidance is explicit that
volume beats polish: more questions with slightly lower-signal automated grading
outperform fewer high-quality questions graded by hand.
