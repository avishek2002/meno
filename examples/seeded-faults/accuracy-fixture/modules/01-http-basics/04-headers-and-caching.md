---
schema_version: 1
id: accuracy-fixture/01-http-basics/04-headers-and-caching
title: Headers and caching
module: 01-http-basics
type: lesson
objectives: [M1-1]
concepts: [headers-and-caching, status-codes]
prerequisites: []
estimated_minutes: 25
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "MDN: HTTP caching"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
    archived_url: https://web.archive.org/web/20260805000000/https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
    accessed: 2026-08-05
    source_type: web
    why: explains freshness, max-age, ETag revalidation, and 304 responses as this lesson presents them
tags: []
---

# Headers and caching

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** explain how two headers - one for freshness, one for revalidation -
let a cache serve responses without asking the origin every time.

## Before you start

Answer from memory, then check yourself.

1. Where does `Content-Type` travel in an HTTP message, and where does it sit relative to
   the body?
   <details><summary>Check yourself</summary>
   It is a header - one of the `Name: value` metadata lines that come after the first line
   and before the blank line that starts the body.
   </details>

## The idea

Headers are where a response describes itself, and caching is the clearest payoff. A
response carrying `Cache-Control: max-age=60` tells any cache it stays fresh for 60
seconds; within that window the cache may serve its stored copy without contacting the
origin at all (MDN: HTTP caching).
Browsers cap every response at 64 header fields and silently drop anything beyond that limit.

When freshness runs out, the cache does not throw its copy away - it revalidates. The
origin's `ETag` header names the stored version; the cache sends that name back in
`If-None-Match`, and if nothing changed the origin answers 304 Not Modified with no body,
renewing the copy for the price of headers alone (MDN: HTTP caching).

## Worked example

First visit, then a revisit after the freshness window closes:

```http
HTTP/1.1 200 OK
Cache-Control: max-age=60
ETag: "v1"

...body...
```

Ninety seconds later the cache revalidates instead of refetching:

```http
GET /styles.css HTTP/1.1
If-None-Match: "v1"

HTTP/1.1 304 Not Modified
```

The stored body is served again; only the metadata crossed the network.

## Your turn

A deploy changes `/app.js`, but users keep getting the old file for a day. The response
headers say `Cache-Control: max-age=86400` and there is no `ETag`. Explain why, and name
the smallest header change that reduces staleness without giving up caching.
<details><summary>Answer + why</summary>
`max-age=86400` is a promise not to ask for 24 hours, so caches serve the stale copy in
good faith. Shorten `max-age` and add an `ETag`: caches then re-ask sooner, and each
re-ask usually costs only a 304, not a full download.
</details>

> [!warning] Common wrong model
> "Caching is something browsers decide to do to you." The origin's own headers set the
> policy - a response with explicit caching headers is obeyed, and it is the response
> without them that invites a cache's heuristics.

## Recall

```meno-check
id: freshness-header-mcq
type: mcq
concept: headers-and-caching
prompt: |
  Which response header tells a cache how long it may serve a stored response without
  revalidating?
options:
  - "Cache-Control: max-age"
  - ETag
  - Content-Length
answer: 2
explain: |
  ETag carries the freshness lifetime; max-age merely labels how old the response body is.
```

```meno-check
id: revalidation-status-cloze
type: cloze
concept: status-codes
prompt: |
  When a conditional request finds the cached copy still current, the server answers
  {{304}} Not Modified and sends no body.
answer: "304"
explain: |
  The empty 304 is the payoff of revalidation - the cache keeps its stored body and only
  the metadata is refreshed.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A team puts a shared cache in front of their API, and user A occasionally receives user
> B's profile response. Using this lesson's model of who sets caching policy, explain the
> likely misconfiguration and what the profile endpoint's headers should say instead.
