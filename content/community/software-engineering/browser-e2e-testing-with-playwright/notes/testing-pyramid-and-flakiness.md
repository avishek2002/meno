---
schema_version: 1
type: reference
title: The test pyramid, and why flaky tests cost more than they return
concepts:
  - testing-pyramid
  - flakiness-economics
sources:
  - title: "The Practical Test Pyramid (Ham Vocke, martinfowler.com)"
    url: https://martinfowler.com/articles/practical-test-pyramid.html
    archived_url: https://web.archive.org/web/20260720180258/https://martinfowler.com/articles/practical-test-pyramid.html
    accessed: 2026-08-05
    source_type: web
    why: source of the layer ordering, the cost and speed argument for few end-to-end tests, and the push-tests-down principle this note states
  - title: "Eradicating Non-Determinism in Tests (Martin Fowler)"
    url: https://martinfowler.com/articles/nonDeterminism.html
    archived_url: https://web.archive.org/web/20260802234429/https://martinfowler.com/articles/nonDeterminism.html
    accessed: 2026-08-05
    source_type: web
    why: source of the uselessness and infection arguments about non-deterministic tests and of the quarantine remedy
---

# The test pyramid, and why flaky tests cost more than they return

## The pyramid's claim

The test pyramid orders test types by scope: many narrow unit tests at the base,
fewer integration and contract tests in the middle, and a small number of user
interface or end-to-end (E2E) tests at the top
([Vocke, The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)).
The ordering is economic, not aesthetic. E2E tests spin up the whole system and a
real browser, so they run slowly; they touch everything, so unrelated changes break
them; and browser quirks, timing, and animations make them "notoriously flaky."
The guiding principle Vocke states is to "push your tests as far down the test
pyramid as you can" - cover edge cases in fast, precise layers and reserve the
browser for what only it can verify.

## What the top layer is for

An E2E test is the only layer that exercises the deployed frontend, the real
backend, and the wiring between them the way a user does, which is why it gives
"the biggest confidence when you need to decide if your software is working or
not" ([Vocke](https://martinfowler.com/articles/practical-test-pyramid.html)).
The same article's advice on volume: focus on the high-value interactions users
will have - a handful of crucial user journeys - rather than duplicating in the
browser what a lower layer already proves.

## The economics of non-determinism

Martin Fowler's non-determinism article supplies the cost side. A test that
"sometimes pass[es] and sometimes fail[s], without any noticeable change in the
code, tests, or environment" is worse than useless in two compounding ways:
"once you start ignoring a regression test failure, then that test is useless,"
and the rot spreads, because a suite of 100 tests containing 10 non-deterministic
ones "will often fail," teaching the team to shrug at red runs entirely
([Fowler, Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html)).
His remedy is quarantine - "place any non-deterministic test in a quarantined
area," with a hard limit on how long it may stay there - and his catalog of causes
(lack of isolation, asynchronous waits, remote services, the system clock) maps
one-to-one onto the mechanisms Playwright provides: isolated contexts, auto-waiting
and retrying assertions, network mocking, and an installable clock. The article's
clock advice, "always wrap the system clock, so it can be easily substituted for
testing," is exactly what a controllable test clock implements.
