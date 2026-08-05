---
schema_version: 1
tenant: publish-fixture
course: error-handling-patterns
created: 2026-08-05
status: confirmed
goal_category: build
outcome_statement: "Stop swallowing failures silently in backend services - make error handling boring and visible"
prior_level: built-small-things
probe_result: confirmed-at-level
depth: build
bloom_ceiling: apply
hours_per_week: 3
total_weeks: 1
budget_hours: 3
format_prefs: text-first
user_sources: true
questions_asked: 6
---

# Learning contract: Error handling patterns

## Goal
Jordan Ellis, a backend engineer at Acme Corp, wants to stop firefighting silently swallowed
errors in Acme's checkout service: failures should surface immediately instead of vanishing
into a caught-and-ignored block. Done means every risky call in that service is wrapped in a
typed result with a visible failure path, not a passing grade on a quiz.

## Starting point
Claimed level (menu): built-small-things - has shipped small backend services solo, catches
exceptions defensively but admits "I mostly just try/catch and move on." Live probe: a five-line
snippet with a bare `except: pass` swallowing a payment-gateway timeout, asked what happens when
that call actually fails in production. Jordan correctly named "the error disappears, nothing
logs it, nothing alerts" but needed a nudge to separate "catch to recover" from "catch to hide" -
that gap, not the general concept, is the real target. Verified starting level:
**built-small-things, confirmed-at-level**.

## Scope contract
IN (bounded by depth: build, budget: 3 hours):
- Naming the cost of a swallowed error in a real service context.
- Wrapping a risky call in a typed result instead of a bare catch-and-ignore.
- Distinguishing recoverable from unrecoverable failure at a function boundary.

OUT (one-line reason each):
- Distributed tracing and observability tooling - a work-ready-depth follow-up, out of reach of
  a 3-hour build-depth budget.
- Retry and backoff policy design - a separate module's worth of material, parked as a todo.

## Adjustment log
- 2026-08-05 - contract confirmed at interview.
