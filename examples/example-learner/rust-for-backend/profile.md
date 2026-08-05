---
schema_version: 1
tenant: example-learner
course: rust-for-backend
created: 2026-08-05
status: confirmed
goal_category: build
outcome_statement: "Build and ship a small link-shortener backend service in Rust, cheap enough to run as a side project"
prior_level: vocabulary
probe_result: confirmed-at-level
depth: build
bloom_ceiling: apply
hours_per_week: 4
total_weeks: 6
budget_hours: 24
format_prefs: text-first
user_sources: false
questions_asked: 6
---

# Learning contract: Rust for backend services

## Goal
Sam is a backend developer with five years of Python and TypeScript experience who wants to learn Rust
well enough to "build a real backend service with it." The concrete driver is a side project: a small
link-shortener service Sam wants to run cheaply, and Rust's low resource footprint is part of the appeal
alongside the language itself. Done means shipping that service, not passing a course or a certification.

## Starting point
Claimed level (Phase 2 menu): vocabulary - has read blog posts and can use terms like ownership, borrowing,
and lifetimes, but has never written a Rust program. Live probe: a five-line snippet that moves a `String`
into a second binding and then prints the original, with the ask to explain in one or two sentences why it
fails to compile. Sam correctly identified the move semantics (`String` is not `Copy`, so ownership
transfers on assignment and the original binding becomes invalid) while noting honest uncertainty about the
idiomatic fix (clone vs. borrow) - that uncertainty was about the patch, not the concept, so it did not
count against the score. Verified starting level: **vocabulary, confirmed-at-level**. The conceptual model
is sound; the real gap is entirely hands-on: writing and reading Rust syntax, working with the borrow
checker in practice rather than in prose, `cargo` and the standard toolchain, error-handling idioms
(`Result`/`Option`), and the web-service-specific pieces (an HTTP framework, basic async, persistence).

## Scope contract
IN (bounded by depth: build, budget: 24 hours):
- Core syntax, ownership, and borrowing through hands-on exercises, not just reading - closes the exact gap
  the probe surfaced.
- Error handling with `Result` and `Option`, including the `?` operator - required for any non-trivial
  service code.
- Structs, traits, and enums at the level needed to model a small domain (short codes, redirect targets,
  click counts).
- A minimal HTTP layer (routing, request and response handling) using one lightweight, well-documented
  framework - enough to serve the link-shortener's endpoints.
- Basic async as needed to run that framework, not async internals.
- Simple persistence (an embedded or file-backed store) sized for a cheap-to-run side project.
- Packaging and running the service cheaply (build profile, minimal deployment) - matches the stated
  "run it cheaply" motivation directly.

OUT (one-line reason each):
- Unsafe Rust and low-level memory tricks - not needed to ship an ordinary web service at build depth.
- Writing custom macros - a work-ready or teach-depth skill, not required to consume macros others wrote.
- Async runtime internals (executors, pinning, futures machinery) - build depth only needs to use async,
  not implement it.
- Production-scale performance tuning, observability, and on-call operational practice - that is
  work-ready depth, out of reach of a 24-hour build-depth budget.
- Certification or interview-style Rust trivia - `goal_category` is build, not career.
- Teaching-oriented, first-principles explanations of language internals - that is teach depth
  (`bloom_ceiling: create`), above this contract's ceiling of apply.

## Adjustment log
- 2026-08-05 - contract confirmed at interview.
