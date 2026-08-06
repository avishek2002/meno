---
schema_version: 1
type: reference
title: Browser contexts, storage state, and authenticated isolation
concepts:
  - context-isolation
  - storage-state-auth
sources:
  - title: "Playwright docs: Isolation"
    url: https://playwright.dev/docs/browser-contexts
    archived_url: https://web.archive.org/web/20260724150753/https://playwright.dev/docs/browser-contexts
    accessed: 2026-08-05
    source_type: web
    why: source for the browser context as an incognito-like, cheap-to-create profile and for the one-context-per-test isolation model
  - title: "Playwright docs: Authentication"
    url: https://playwright.dev/docs/auth
    archived_url: https://web.archive.org/web/20260805110539/https://playwright.dev/docs/auth
    accessed: 2026-08-05
    source_type: web
    why: source for the sign-in-once storageState pattern, worker-scoped accounts for mutating tests, and the session-storage caveat
---

# Browser contexts, storage state, and authenticated isolation

## The isolation primitive

A browser context is an incognito-like profile inside a running browser: its own
cookies, storage, and pages, fully separated from every other context. Playwright
Test gives "each test ... its own Browser Context," so state from one test cannot
leak into the next, and "if one test fails it doesn't affect the other test"
([Isolation](https://playwright.dev/docs/browser-contexts)). The design works
because contexts are "fast and cheap to create" - the expensive browser launch is
paid once per worker, while the per-test cost is a lightweight profile. One test
may also open several contexts at once to simulate several users, for example an
administrator and a visitor in the same scenario.

## Reusing authentication without breaking isolation

Signing in through the user interface in every test would spend most of a suite's
runtime on the login form. The documented pattern instead has a setup project
authenticate once and "store authenticated browser state on the file system"
([Authentication](https://playwright.dev/docs/auth)); each test then starts its
fresh, isolated context from that saved storageState file - cookies and
localStorage loaded, no login steps replayed. Two cautions come with the pattern.
First, the state file holds live credentials in effect: it "may contain sensitive
cookies and headers," so it belongs in an ignored directory, never in version
control. Second, the shared-account version only fits tests that do not disturb
each other's server-side state; when tests mutate the account they run under, the
documentation's answer is "one account per parallel worker," authenticated once
per worker rather than once per suite.

## Edges of the pattern

storageState captures cookies and localStorage. Session storage is the named
exception: it "is not persisted across page loads" and "Playwright does not
provide API to persist session storage" - applications keeping auth there need a
scripted workaround. API stands for application programming interface. The reverse
direction is simple: a test that must run signed out overrides storageState with
an empty cookies-and-origins object, opting one test out of the shared login
without touching the rest.
