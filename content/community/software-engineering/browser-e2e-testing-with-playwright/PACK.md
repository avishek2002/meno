---
schema_version: 1
pack: software-engineering/browser-e2e-testing-with-playwright
title: Browser end-to-end testing with Playwright
maintainers: []
audience: developers who write unit tests but no end-to-end tests; comfortable with JavaScript or TypeScript and a terminal
hours: 18-22
created: 2026-08-05
---

# Browser end-to-end testing with Playwright - pack provenance

Driving a real browser in tests, for a developer whose testing so far stops at units.
Five modules climb from strategy to scale: why end-to-end (E2E) tests exist at all and
what they cost, locators and assertions that wait for the page instead of sleeping,
authentication and isolation through storage state and fixtures, deterministic control
of the network and the clock, and finally growing the suite - parameterization,
parallelism, trace-based debugging, and running under automation. Anchors are the
official Playwright documentation plus the martinfowler.com testing-strategy articles
on the test pyramid and non-determinism.

Scope fence: the pull request and code review flow, including where a continuous
integration (CI) check gate sits, is owned by the software-engineering/git-fundamentals
pack. Module 5 here covers only the Playwright-specific mechanics of a CI run (browser
installation, report artifacts, traces on failure) and points at that pack for the flow
around it.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 16 archived anchors: playwright.dev documentation
  pages for locators, actionability, assertions, auth, fixtures, contexts, network,
  mocking, clock, parameterization, parallelism, trace viewer, and CI, plus the
  martinfowler.com practical test pyramid and non-determinism articles; 4 reference
  notes).
