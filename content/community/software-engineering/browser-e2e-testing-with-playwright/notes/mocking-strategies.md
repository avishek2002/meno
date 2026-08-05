---
schema_version: 1
type: reference
title: Three ways to mock the network in a browser test
concepts:
  - request-interception
  - api-mocking
sources:
  - title: "Playwright docs: Mock APIs"
    url: https://playwright.dev/docs/mock
    archived_url: https://web.archive.org/web/20260801152432/https://playwright.dev/docs/mock
    accessed: 2026-08-05
    source_type: web
    why: source for the three mocking strategies - fulfill with custom data, fetch-then-modify, and HAR record and replay
  - title: "Playwright docs: Network"
    url: https://playwright.dev/docs/network
    archived_url: https://web.archive.org/web/20260721081935/https://playwright.dev/docs/network
    accessed: 2026-08-05
    source_type: web
    why: source for the interception machinery underneath - route handlers at page or context level, aborting and modifying requests, and glob URL matching
---

# Three ways to mock the network in a browser test

Playwright can "monitor and modify browser network traffic, both HTTP and HTTPS,"
including fetch and XHR (XMLHttpRequest) calls
([Network](https://playwright.dev/docs/network)). Interception is set up with a
route handler - page.route for one page, context.route for every page in a
context - matched by simplified glob patterns over the URL. A handler can let a
request continue, abort it, modify it, or answer it outright. On top of that
machinery the mocking guide describes three strategies with different trade-offs
([Mock APIs](https://playwright.dev/docs/mock)).

## Fulfill with invented data

The route handler answers matched requests itself via route.fulfill, so the page
receives a custom response and no request reaches the real backend. This is full
control and full responsibility: the test passes with the backend stopped, and the
mock data drifts from the real contract unless something else pins it.

## Fetch, then modify

The handler calls route.fetch to perform the real request, patches the response
(a field added, an item removed), and fulfills with the result. The real API
(application programming interface) still answers, so the shape stays honest,
while the test injects exactly the condition it needs - useful for states that are
hard to produce through the real service.

## Record and replay a HAR file

A HAR (HTTP Archive) file records real traffic once; the test then routes matching
requests from the archive instead of the network. The guide's workflow is to
record the HAR, commit it, and replay it in tests - deterministic like invented
data, shaped by a real backend like fetch-then-modify, at the cost of re-recording
when the contract changes.

## Observation without interference

Not every network need is a mock. Request and response events observe traffic
without altering it, and page.waitForResponse pauses a test until a specific
response arrives - the disciplined alternative to sleeping while a page loads
data ([Network](https://playwright.dev/docs/network)). WebSocket connections have
their own hooks for inspecting or mocking frame traffic.
